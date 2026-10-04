"""Login, signup (user + admin), logout, and access-control decorators."""
import functools
import re

from flask import (Blueprint, current_app, flash, g, jsonify, redirect, render_template,
                   request, session, url_for)
from werkzeug.security import check_password_hash, generate_password_hash

import db

bp = Blueprint("auth", __name__)

USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,30}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MIN_PASSWORD = 8


@bp.before_app_request
def load_logged_in_user():
    uid = session.get("uid")
    g.user = db.get_user(uid) if uid else None
    if g.user and not g.user["is_active"]:
        session.clear()
        g.user = None


def _wants_json():
    return request.path.startswith("/api/")


def login_required(view):
    @functools.wraps(view)
    def wrapped(**kwargs):
        if g.user is None:
            if _wants_json():
                return jsonify(error="Please log in again."), 401
            return redirect(url_for("auth.login", next=request.full_path))
        return view(**kwargs)
    return wrapped


def admin_required(view):
    @functools.wraps(view)
    def wrapped(**kwargs):
        if g.user is None:
            if _wants_json():
                return jsonify(error="Please log in again."), 401
            return redirect(url_for("auth.admin_login", next=request.full_path))
        if g.user["role"] != "admin":
            if _wants_json():
                return jsonify(error="Admins only."), 403
            flash("That page is for admins only.", "error")
            return redirect(url_for("journal.home"))
        return view(**kwargs)
    return wrapped


def _safe_next(target):
    # Only allow same-site relative paths, never "//evil.com" or absolute URLs.
    if target and target.startswith("/") and not target.startswith("//"):
        return target
    return None


def _start_session(user):
    session.clear()
    session["uid"] = user["id"]
    db.touch_login(user["id"])


def _validate_signup(form):
    username = form.get("username", "").strip()
    email = form.get("email", "").strip().lower()
    password = form.get("password", "")
    confirm = form.get("confirm", "")
    if not USERNAME_RE.match(username):
        raise db.ValidationError("Username must be 3–30 letters, numbers, dots, dashes or underscores.")
    if not EMAIL_RE.match(email):
        raise db.ValidationError("Please enter a valid email address.")
    if len(password) < MIN_PASSWORD:
        raise db.ValidationError(f"Password must be at least {MIN_PASSWORD} characters.")
    if password != confirm:
        raise db.ValidationError("Passwords do not match.")
    return username, email, generate_password_hash(password)


def _signup(role, template):
    if request.method == "POST":
        try:
            username, email, pw_hash = _validate_signup(request.form)
            uid = db.create_user(username, email, pw_hash, role)
        except db.ValidationError as e:
            flash(str(e), "error")
            return render_template(template, form=request.form), 400
        _start_session(db.get_user(uid))
        flash(f"Welcome, {username}! Your journal is ready.", "success")
        return redirect(url_for("admin.dashboard" if role == "admin" else "journal.home"))
    return render_template(template, form={})


def _login(template, home_endpoint, admins_only=False):
    if request.method == "POST":
        user = db.find_user(request.form.get("login", "").strip())
        if user is None or not check_password_hash(user["password_hash"], request.form.get("password", "")):
            flash("Incorrect username/email or password.", "error")
            return render_template(template, form=request.form), 401
        if not user["is_active"]:
            flash("This account has been deactivated. Contact the admin.", "error")
            return render_template(template, form=request.form), 403
        if admins_only and user["role"] != "admin":
            flash("This login is for admins only. Please use the normal login.", "error")
            return render_template(template, form=request.form), 403
        _start_session(user)
        return redirect(_safe_next(request.args.get("next")) or url_for(home_endpoint))
    return render_template(template, form={})


@bp.route("/login", methods=("GET", "POST"))
def login():
    if g.user:
        return redirect(url_for("journal.home"))
    return _login("auth/login.html", "journal.home")


# Not linked anywhere in the UI, like /admin/signup.
@bp.route("/admin/login", methods=("GET", "POST"))
def admin_login():
    if g.user and g.user["role"] == "admin":
        return redirect(url_for("admin.dashboard"))
    return _login("auth/admin_login.html", "admin.dashboard", admins_only=True)


@bp.route("/signup", methods=("GET", "POST"))
def signup():
    if g.user:
        return redirect(url_for("journal.home"))
    if db.get_setting("signup_enabled") != "1":
        return render_template("auth/signup_closed.html"), 403
    return _signup("user", "auth/signup.html")


# Not linked anywhere in the UI. Disable in production with ADMIN_SIGNUP_ENABLED=false.
@bp.route("/admin/signup", methods=("GET", "POST"))
def admin_signup():
    if not current_app.config["ADMIN_SIGNUP_ENABLED"]:
        return render_template("errors/404.html"), 404
    return _signup("admin", "auth/admin_signup.html")


@bp.route("/logout", methods=("POST",))
def logout():
    session.clear()
    flash("You have been logged out.", "success")
    return redirect(url_for("journal.cover"))
