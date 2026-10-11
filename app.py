"""Personal Finance Journal — the Flask app.

Run:  python app.py           (development server on http://127.0.0.1:5000)
WSGI: from app import app as application
CLI:  flask --app app create-admin
      flask --app app seed-june <username>
"""
import calendar
import hmac
import os
import secrets
from pathlib import Path

import click
from flask import Flask, abort, render_template, request, session
from werkzeug.security import generate_password_hash

import admin
import auth
import db
import journal
import seed_june_2024

BASE_DIR = Path(__file__).resolve().parent


def load_dotenv(path=BASE_DIR / ".env"):
    """Minimal .env reader (KEY=VALUE lines); real environment variables win."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


def _env_flag(name, default):
    return os.environ.get(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


def _secret_key(instance_path):
    if os.environ.get("SECRET_KEY"):
        return os.environ["SECRET_KEY"]
    key_file = Path(instance_path) / "secret_key"
    if not key_file.exists():
        key_file.write_text(secrets.token_hex(32), encoding="utf-8")
    return key_file.read_text(encoding="utf-8").strip()


def format_inr(value, symbol=True):
    """Indian digit grouping: 1234567.5 -> ₹12,34,567.50"""
    if value is None:
        return "—"
    neg = value < 0
    value = abs(round(float(value), 2))
    whole, frac = divmod(round(value * 100), 100)
    s = str(int(whole))
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        s = ",".join(groups + [tail])
    out = s + (f".{int(frac):02d}" if frac else "")
    return ("-" if neg else "") + ("₹" if symbol else "") + out


# --- app ------------------------------------------------------------------------

load_dotenv()
app = Flask(__name__, instance_relative_config=True)
Path(app.instance_path).mkdir(parents=True, exist_ok=True)
app.config.update(
    SECRET_KEY=_secret_key(app.instance_path),
    DATABASE=os.environ.get("DATABASE", str(Path(app.instance_path) / "journal.db")),
    ADMIN_SIGNUP_ENABLED=_env_flag("ADMIN_SIGNUP_ENABLED", True),
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=_env_flag("SESSION_COOKIE_SECURE", False),
)

db.init_app(app)
app.register_blueprint(auth.bp)
app.register_blueprint(journal.bp)
app.register_blueprint(admin.bp)


# --- CSRF: one token per session, sent as a form field or X-CSRF-Token header.
def csrf_token():
    if "csrf" not in session:
        session["csrf"] = secrets.token_urlsafe(32)
    return session["csrf"]


@app.before_request
def check_csrf():
    if request.method in ("POST", "PUT", "PATCH", "DELETE"):
        sent = request.form.get("csrf_token") or request.headers.get("X-CSRF-Token", "")
        if not hmac.compare_digest(sent, session.get("csrf", "")):
            abort(400, description="Your session expired. Please reload the page and try again.")


@app.context_processor
def inject_globals():
    return {"csrf_token": csrf_token, "month_name": calendar.month_name,
            "month_abbr": calendar.month_abbr}


app.add_template_filter(format_inr, "inr")


@app.errorhandler(404)
def not_found(_e):
    return render_template("errors/404.html"), 404


@app.errorhandler(400)
def bad_request(e):
    if request.path.startswith("/api/"):
        return {"error": e.description}, 400
    return render_template("errors/400.html", message=e.description), 400


# --- CLI ------------------------------------------------------------------------

@app.cli.command("create-admin")
@click.option("--username", prompt=True)
@click.option("--email", prompt=True)
@click.password_option()
def create_admin(username, email, password):
    """Create an admin account."""
    try:
        db.create_user(username.strip(), email.strip().lower(),
                       generate_password_hash(password), "admin")
    except db.ValidationError as e:
        raise click.ClickException(str(e))
    click.echo(f"Admin '{username}' created.")


@app.cli.command("seed-june")
@click.argument("username")
def seed_june(username):
    """Load the June 2024 entries from the PDF into USERNAME's journal."""
    user = db.find_user(username)
    if user is None:
        raise click.ClickException(f"No user named '{username}'. Sign up first.")
    n, total = seed_june_2024.seed(user["id"])
    click.echo(f"Loaded {n} June 2024 expenses ({format_inr(total)}) for {username}.")


if __name__ == "__main__":
    app.run(debug=_env_flag("FLASK_DEBUG", True))
