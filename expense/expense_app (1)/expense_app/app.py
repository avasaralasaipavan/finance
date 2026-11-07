"""
Expense dashboard - Flask + SQLite.

Works with the expense-tracker database schema you uploaded
(tables: users, options, expenses, incomes, investments).

Run:
    pip install -r requirements.txt
    python app.py
Open http://127.0.0.1:5000

Database location (first match wins):
    1. DB_PATH environment variable
    2. data/latest.db   (created by the Upload button in the page)
    3. any *.db file inside data/

The app only ever writes to the `expenses` table (the "Add expense" form).
Your fixed-bill names and trip keywords live in data/dashboard_config.json,
not in your database.
"""

import glob
import json
import os
import re
import sqlite3

import pandas as pd
from flask import Flask, jsonify, render_template, request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
UPLOADED_DB = os.path.join(DATA_DIR, "latest.db")
CONFIG_PATH = os.path.join(DATA_DIR, "dashboard_config.json")

DEFAULT_CONFIG = {
    "fixed": ["home loan", "home expenses", "home", "loan"],
    "trip": ["boat", "bhadrachalam", "train tickets"],
}
JOYFUL = {"Happy", "Overjoyed"}  # emotions counted as joyful spending
NEEDED_TABLES = {"users", "options", "expenses", "incomes", "investments"}

app = Flask(__name__)
os.makedirs(DATA_DIR, exist_ok=True)


# ---------------------------------------------------------------- database
def active_db():
    env = os.environ.get("DB_PATH")
    if env and os.path.exists(env):
        return env
    if os.path.exists(UPLOADED_DB):
        return UPLOADED_DB
    found = sorted(glob.glob(os.path.join(DATA_DIR, "*.db")))
    return found[0] if found else None


def connect(path, write=False):
    if write:
        conn = sqlite3.connect(path)
        conn.execute("PRAGMA foreign_keys = ON")
    else:
        conn = sqlite3.connect("file:%s?mode=ro" % path, uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def check_schema(path):
    conn = connect(path)
    try:
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    finally:
        conn.close()
    missing = NEEDED_TABLES - tables
    if missing:
        raise ValueError("This database is missing tables: " + ", ".join(sorted(missing)))


def require_db():
    path = active_db()
    if not path:
        raise LookupError("No database found. Use the Upload database button.")
    return path


# ------------------------------------------------------------------ config
def load_config():
    try:
        with open(CONFIG_PATH) as f:
            data = json.load(f)
        return {
            "fixed": [str(x).strip().lower() for x in data.get("fixed", []) if str(x).strip()],
            "trip": [str(x).strip().lower() for x in data.get("trip", []) if str(x).strip()],
        }
    except (OSError, ValueError):
        return dict(DEFAULT_CONFIG)


def save_config(fixed, trip):
    clean = lambda items: [s.strip().lower() for s in items if s.strip()]
    with open(CONFIG_PATH, "w") as f:
        json.dump({"fixed": clean(fixed), "trip": clean(trip)}, f, indent=2)


# -------------------------------------------------------------------- data
EXPENSE_SQL = """
SELECT e.id, e.date, e.item, e.amount, e.notes,
       c.label  AS category,
       d.label  AS driving_force,
       em.label AS emotion,
       COALESCE(p.label, 'Unspecified') AS payment_method
FROM expenses e
JOIN options c  ON c.id  = e.category_id
JOIN options d  ON d.id  = e.driving_force_id
JOIN options em ON em.id = e.emotion_id
LEFT JOIN options p ON p.id = e.payment_method_id
WHERE e.user_id = ?
"""


def load_expenses(conn, user_id, month):
    df = pd.read_sql_query(EXPENSE_SQL, conn, params=(user_id,))
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df.dropna(subset=["date"])
    if month != "all":
        df = df[df["date"].dt.strftime("%Y-%m") == month]
    cfg = load_config()
    names = df["item"].str.strip().str.lower()
    is_fixed = names.isin(cfg["fixed"])
    is_trip = names.apply(lambda n: any(k in n for k in cfg["trip"])).astype(bool) & ~is_fixed
    df["group"] = "Other"
    df.loc[is_trip, "group"] = "Trip"
    df.loc[is_fixed, "group"] = "Fixed"
    return df


def in_range(frame, month):
    frame = frame.copy()
    frame["date"] = pd.to_datetime(frame["date"], errors="coerce")
    if month != "all":
        frame = frame[frame["date"].dt.strftime("%Y-%m") == month]
    return frame


def ranked(df, column):
    s = df.groupby(column)["amount"].sum().sort_values(ascending=False)
    return [{"label": str(k), "value": float(v)} for k, v in s.items()]


def build_payload(conn, user_id, month):
    df = load_expenses(conn, user_id, month)
    flex = df[df["group"] != "Fixed"]
    joyful = df[df["emotion"].isin(JOYFUL)]
    regret = df[df["emotion"] == "Regret"]
    trip = df[df["group"] == "Trip"]

    incomes = in_range(pd.read_sql_query(
        "SELECT i.date, i.amount, i.notes, o.label AS source FROM incomes i "
        "JOIN options o ON o.id = i.source_id WHERE i.user_id = ?", conn, params=(user_id,)), month)
    invest = in_range(pd.read_sql_query(
        "SELECT i.date, i.name, i.action, i.amount, o.label AS type FROM investments i "
        "JOIN options o ON o.id = i.type_id WHERE i.user_id = ?", conn, params=(user_id,)), month)
    invested = float(invest.loc[invest["action"] == "invest", "amount"].sum()
                     - invest.loc[invest["action"] == "withdraw", "amount"].sum())

    total = float(df["amount"].sum())
    income_total = float(incomes["amount"].sum())

    if month == "all":
        grouped = flex.groupby(flex["date"].dt.strftime("%Y-%m"))["amount"].sum().sort_index()
        period = {"title": "Flexible spending by month", "labels": list(grouped.index)}
    else:
        week = ((flex["date"].dt.day - 1) // 7 + 1).clip(upper=4)
        grouped = flex.groupby(week)["amount"].sum().sort_index()
        period = {"title": "Flexible spending by week", "labels": ["Week %d" % w for w in grouped.index]}
    period["values"] = [float(v) for v in grouped.values]

    daily = flex.groupby(flex["date"].dt.strftime("%Y-%m-%d"))["amount"].sum().sort_index()

    joy_split = joyful.groupby("group")["amount"].sum()
    top = (flex.groupby("item")
           .agg(value=("amount", "sum"), force=("driving_force", lambda s: s.mode().iat[0]))
           .sort_values("value", ascending=False).head(8).reset_index())

    details = df.sort_values(["date", "id"], ascending=False)
    return {
        "kpis": {
            "total": total,
            "fixed": float(df.loc[df["group"] == "Fixed", "amount"].sum()),
            "flexible": float(flex["amount"].sum()),
            "joyful": float(joyful["amount"].sum()),
            "joyful_real": float(joyful.loc[joyful["group"] != "Fixed", "amount"].sum()),
            "trip": float(trip["amount"].sum()),
            "regret": float(regret["amount"].sum()),
            "income": income_total,
            "invested": invested,
            "left": income_total - total - invested,
            "entries": int(len(df)),
        },
        "emotion": ranked(df, "emotion"),
        "joy_split": {
            "Fixed bills": float(joy_split.get("Fixed", 0)),
            "Trip": float(joy_split.get("Trip", 0)),
            "Other joyful spends": float(joy_split.get("Other", 0)),
        },
        "joy_items": [
            {"date": r.date.strftime("%d %b"), "item": r.item, "amount": float(r.amount),
             "group": r.group, "force": r.driving_force, "emotion": r.emotion}
            for r in joyful.sort_values("amount", ascending=False).itertuples()
        ],
        "trip_items": [
            {"item": r.item, "amount": float(r.amount), "emotion": r.emotion}
            for r in trip.sort_values("amount", ascending=False).itertuples()
        ],
        "period": period,
        "daily": {"labels": list(daily.index), "values": [float(v) for v in daily.values]},
        "top": [{"label": r.item, "value": float(r.value), "force": r.force} for r in top.itertuples()],
        "regret_items": [{"label": r.item, "value": float(r.amount)}
                         for r in regret.sort_values("amount", ascending=False).itertuples()],
        "category": ranked(df, "category"),
        "force": ranked(df, "driving_force"),
        "payment": ranked(df, "payment_method"),
        "income_sources": ranked(incomes.rename(columns={"source": "src"}), "src") if len(incomes) else [],
        "investments": [{"date": r.date.strftime("%d %b"), "name": r.name, "type": r.type,
                         "action": r.action, "amount": float(r.amount)} for r in invest.itertuples()],
        "details": [{"id": int(r.id), "date": r.date.strftime("%Y-%m-%d"), "item": r.item,
                     "amount": float(r.amount), "category": r.category, "force": r.driving_force,
                     "emotion": r.emotion, "payment": r.payment_method, "notes": r.notes or "",
                     "group": r.group} for r in details.itertuples()],
    }


# ------------------------------------------------------------------ routes
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/meta")
def api_meta():
    try:
        path = require_db()
        conn = connect(path)
    except Exception as exc:
        return jsonify({"error": str(exc), "needs_db": True}), 400
    try:
        users = [dict(r) for r in conn.execute(
            "SELECT u.id, u.username, COUNT(e.id) AS expenses FROM users u "
            "LEFT JOIN expenses e ON e.user_id = u.id WHERE u.is_active = 1 "
            "GROUP BY u.id ORDER BY expenses DESC, u.username")]
        user_id = request.args.get("user_id", type=int) or (users[0]["id"] if users else None)
        months = [r[0] for r in conn.execute(
            "SELECT DISTINCT substr(date, 1, 7) FROM expenses WHERE user_id = ? ORDER BY 1 DESC", (user_id,))]
        options = {}
        for r in conn.execute("SELECT id, kind, label FROM options WHERE is_active = 1 ORDER BY kind, sort_order"):
            options.setdefault(r["kind"], []).append({"id": r["id"], "label": r["label"]})
        cfg = load_config()
        return jsonify({"db": os.path.basename(path), "users": users, "user_id": user_id,
                        "months": months, "options": options, "config": cfg})
    finally:
        conn.close()


@app.route("/api/data")
def api_data():
    user_id = request.args.get("user_id", type=int)
    month = request.args.get("month", "all")
    if user_id is None:
        return jsonify({"error": "Pick a user."}), 400
    if month != "all" and not re.fullmatch(r"\d{4}-\d{2}", month):
        return jsonify({"error": "Month must look like 2026-10 or 'all'."}), 400
    try:
        conn = connect(require_db())
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400
    try:
        return jsonify(build_payload(conn, user_id, month))
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400
    finally:
        conn.close()


@app.route("/api/expenses", methods=["POST"])
def add_expense():
    body = request.get_json(silent=True) or {}
    try:
        user_id = int(body["user_id"])
        item = str(body.get("item", "")).strip()
        amount = float(body["amount"])
        day = pd.to_datetime(body["date"], format="%Y-%m-%d").strftime("%Y-%m-%d")
        ids = {k: int(body[k]) for k in ("category_id", "driving_force_id", "emotion_id")}
        payment_id = int(body["payment_method_id"]) if body.get("payment_method_id") else None
    except (KeyError, ValueError, TypeError):
        return jsonify({"error": "Fill in date, item, amount, category, driving force and emotion."}), 400
    if not item or amount <= 0:
        return jsonify({"error": "Item is required and amount must be above 0."}), 400

    kinds = {"category_id": "category", "driving_force_id": "driving_force", "emotion_id": "emotion"}
    if payment_id is not None:
        kinds["payment_method_id"] = "payment_method"
        ids["payment_method_id"] = payment_id
    conn = connect(require_db(), write=True)
    try:
        if not conn.execute("SELECT 1 FROM users WHERE id = ?", (user_id,)).fetchone():
            return jsonify({"error": "Unknown user."}), 400
        for key, kind in kinds.items():
            ok = conn.execute("SELECT 1 FROM options WHERE id = ? AND kind = ?", (ids[key], kind)).fetchone()
            if not ok:
                return jsonify({"error": "Invalid choice for " + kind.replace("_", " ") + "."}), 400
        conn.execute(
            "INSERT INTO expenses (user_id, date, item, amount, category_id, driving_force_id, "
            "emotion_id, payment_method_id, notes) VALUES (?,?,?,?,?,?,?,?,?)",
            (user_id, day, item, amount, ids["category_id"], ids["driving_force_id"], ids["emotion_id"],
             payment_id, str(body.get("notes", "")).strip()))
        conn.commit()
        return jsonify({"ok": True})
    except sqlite3.Error as exc:
        return jsonify({"error": "Database error: %s" % exc}), 400
    finally:
        conn.close()


@app.route("/api/config", methods=["POST"])
def set_config():
    body = request.get_json(silent=True) or {}
    save_config(list(body.get("fixed", [])), list(body.get("trip", [])))
    return jsonify({"ok": True})


@app.route("/upload", methods=["POST"])
def upload():
    file = request.files.get("file")
    if not file or not file.filename.lower().endswith((".db", ".sqlite", ".sqlite3")):
        return jsonify({"error": "Choose a .db file."}), 400
    tmp = UPLOADED_DB + ".tmp"
    file.save(tmp)
    try:
        check_schema(tmp)
    except Exception as exc:
        os.remove(tmp)
        return jsonify({"error": str(exc) if isinstance(exc, ValueError) else "That is not a valid SQLite database."}), 400
    os.replace(tmp, UPLOADED_DB)
    return jsonify({"ok": True})


if __name__ == "__main__":
    # 127.0.0.1 keeps the dashboard private to your own computer.
    app.run(host="127.0.0.1", port=5000, debug=False)
