"""Admin panel: dashboard, dropdown manager, users, settings."""
import secrets
from datetime import date

from flask import Blueprint, flash, g, redirect, render_template, request, url_for
from werkzeug.security import generate_password_hash

import db
from auth import admin_required

bp = Blueprint("admin", __name__, url_prefix="/admin")


@bp.route("/")
@admin_required
def dashboard():
    return render_template("admin/dashboard.html", stats=db.admin_stats(date.today()))


# --- dropdown manager ---------------------------------------------------------

@bp.route("/options")
@admin_required
def options():
    grouped = {kind: [] for kind in db.OPTION_KINDS}
    for o in db.list_options():
        grouped.setdefault(o["kind"], []).append(o)
    return render_template("admin/options.html", grouped=grouped, kinds=db.OPTION_KINDS)


def _back_to_options(kind=None):
    return redirect(url_for("admin.options") + (f"#{kind}" if kind else ""))


@bp.post("/options/add")
@admin_required
def option_add():
    kind = request.form.get("kind")
    try:
        db.add_option(kind, request.form.get("label"))
        flash("Value added.", "success")
    except db.ValidationError as e:
        flash(str(e), "error")
    return _back_to_options(kind)


@bp.post("/options/<int:option_id>/<action>")
@admin_required
def option_action(option_id, action):
    opt = db.get_option(option_id)
    if opt is None:
        flash("Value not found.", "error")
        return _back_to_options()
    try:
        if action == "rename":
            db.rename_option(option_id, request.form.get("label"))
            flash("Value renamed — existing entries show the new name.", "success")
        elif action == "toggle":
            db.set_option_active(option_id, not opt["is_active"])
            flash("Value is now " + ("hidden." if opt["is_active"] else "visible."), "success")
        elif action in ("up", "down"):
            db.move_option(option_id, action)
        elif action == "delete":
            db.delete_option(option_id)
            flash("Value deleted.", "success")
        else:
            flash("Unknown action.", "error")
    except db.ValidationError as e:
        flash(str(e), "error")
    return _back_to_options(opt["kind"])


# --- users --------------------------------------------------------------------

@bp.route("/users")
@admin_required
def users():
    return render_template("admin/users.html", users=db.list_users())


@bp.post("/users/<int:user_id>/<action>")
@admin_required
def user_action(user_id, action):
    user = db.get_user(user_id)
    if user is None:
        flash("User not found.", "error")
        return redirect(url_for("admin.users"))
    is_self = user_id == g.user["id"]
    last_admin = user["role"] == "admin" and user["is_active"] and db.count_admins() <= 1

    if action == "toggle-active":
        if is_self:
            flash("You can't deactivate your own account.", "error")
        elif last_admin:
            flash("You can't deactivate the last active admin.", "error")
        else:
            db.update_user(user_id, is_active=0 if user["is_active"] else 1)
            flash(f"{user['username']} is now {'inactive' if user['is_active'] else 'active'}.", "success")
    elif action == "role":
        new_role = "user" if user["role"] == "admin" else "admin"
        if is_self:
            flash("You can't change your own role.", "error")
        elif new_role == "user" and last_admin:
            flash("You can't demote the last active admin.", "error")
        else:
            db.update_user(user_id, role=new_role)
            flash(f"{user['username']} is now {'an admin' if new_role == 'admin' else 'a normal user'}.", "success")
    elif action == "reset-password":
        temp = secrets.token_urlsafe(9)
        db.update_user(user_id, password_hash=generate_password_hash(temp))
        flash(f"Temporary password for {user['username']}: {temp} — share it securely; "
              "it won't be shown again.", "success")
    else:
        flash("Unknown action.", "error")
    return redirect(url_for("admin.users"))


# --- settings -----------------------------------------------------------------

@bp.route("/settings", methods=("GET", "POST"))
@admin_required
def settings():
    if request.method == "POST":
        db.set_setting("signup_enabled", "1" if request.form.get("signup_enabled") else "0")
        flash("Settings saved.", "success")
        return redirect(url_for("admin.settings"))
    return render_template("admin/settings.html", signup_enabled=db.get_setting("signup_enabled") == "1")
