"""SQLite access and the journal's domain logic (options, tallies, weeks, validation)."""
import calendar
import json
import sqlite3
from datetime import date
from pathlib import Path

from flask import current_app, g

SCHEMA_PATH = Path(__file__).with_name("schema.sql")

# Dropdown kinds the admin manages. "used_by" says which entry type shows the dropdown.
OPTION_KINDS = {
    "category": {"title": "Category", "required": True, "used_by": "expense"},
    "driving_force": {"title": "Driving Force", "required": True, "used_by": "expense"},
    "emotion": {"title": "Emotion", "required": True, "used_by": "expense"},
    "payment_method": {"title": "Payment Method", "required": False, "used_by": "expense"},
    "income_source": {"title": "Income Source", "required": True, "used_by": "income"},
    "investment_type": {"title": "Investment Type", "required": True, "used_by": "investment"},
}
EXPENSE_KINDS = {k: v for k, v in OPTION_KINDS.items() if v["used_by"] == "expense"}

# Where each dropdown kind is stored: (table, column).
OPTION_COLUMNS = {
    "category": ("expenses", "category_id"),
    "driving_force": ("expenses", "driving_force_id"),
    "emotion": ("expenses", "emotion_id"),
    "payment_method": ("expenses", "payment_method_id"),
    "income_source": ("incomes", "source_id"),
    "investment_type": ("investments", "type_id"),
}

# Starting values. The first four are taken from the Personal Finance Journal PDF.
DEFAULT_OPTIONS = {
    "category": ["Needs", "Wants"],
    "driving_force": ["Needs", "Happiness", "FOMO", "External Pressure"],
    "emotion": ["Happy", "Normal", "Sad", "Overjoyed", "Regret"],
    "payment_method": ["Cash", "UPI", "Card", "Net Banking"],
    "income_source": ["Salary", "Freelance", "Business", "Interest", "Rental",
                      "Dividends", "Gift", "Refund", "Other"],
    "investment_type": ["Mutual Fund / SIP", "Stocks", "Fixed Deposit (FD)", "Recurring Deposit (RD)",
                        "PPF", "EPF / VPF", "NPS", "Gold", "Crypto", "Real Estate", "Other"],
}

INVESTMENT_ACTIONS = {"invest": "Invest", "withdraw": "Withdraw"}

DEFAULT_SETTINGS = {"signup_enabled": "1"}


class ValidationError(ValueError):
    pass


# --- connection -------------------------------------------------------------

def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(current_app.config["DATABASE"])
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


def close_db(_exc=None):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db():
    db = get_db()
    db.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    # Seed each dropdown the first time it exists (also covers kinds added in later versions).
    for kind, labels in DEFAULT_OPTIONS.items():
        if db.execute("SELECT COUNT(*) FROM options WHERE kind = ?", (kind,)).fetchone()[0] == 0:
            db.executemany(
                "INSERT INTO options (kind, label, sort_order) VALUES (?, ?, ?)",
                [(kind, label, i) for i, label in enumerate(labels)],
            )
    for key, value in DEFAULT_SETTINGS.items():
        db.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (key, value))
    _migrate_month_income(db)
    db.commit()


def _migrate_month_income(db):
    """Older versions stored one income figure per month; turn each into an income entry."""
    rows = db.execute("SELECT user_id, year, month, income FROM months WHERE income IS NOT NULL").fetchall()
    if not rows:
        return
    other = db.execute(
        "SELECT id FROM options WHERE kind = 'income_source' ORDER BY label = 'Other' DESC, sort_order LIMIT 1"
    ).fetchone()[0]
    for r in rows:
        if r["income"] > 0:
            db.execute(
                "INSERT INTO incomes (user_id, date, source_id, amount, notes) VALUES (?, ?, ?, ?, ?)",
                (r["user_id"], date(r["year"], r["month"], 1).isoformat(), other, r["income"],
                 "Monthly income (moved from the old income box)"),
            )
        db.execute("UPDATE months SET income = NULL WHERE user_id = ? AND year = ? AND month = ?",
                   (r["user_id"], r["year"], r["month"]))


def init_app(app):
    app.teardown_appcontext(close_db)
    with app.app_context():
        init_db()


# --- settings -----------------------------------------------------------------

def get_setting(key):
    row = get_db().execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else DEFAULT_SETTINGS.get(key)


def set_setting(key, value):
    db = get_db()
    db.execute(
        "INSERT INTO settings (key, value) VALUES (?, ?)"
        " ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, str(value)),
    )
    db.commit()


# --- users --------------------------------------------------------------------

def get_user(user_id):
    row = get_db().execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return dict(row) if row else None


def find_user(login):
    """Look a user up by username or email."""
    row = get_db().execute(
        "SELECT * FROM users WHERE username = ? OR email = ?", (login, login)
    ).fetchone()
    return dict(row) if row else None


def create_user(username, email, password_hash, role="user"):
    db = get_db()
    try:
        cur = db.execute(
            "INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)",
            (username, email, password_hash, role),
        )
    except sqlite3.IntegrityError:
        raise ValidationError("That username or email is already registered.")
    db.commit()
    return cur.lastrowid


def touch_login(user_id):
    db = get_db()
    db.execute("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?", (user_id,))
    db.commit()


def list_users():
    rows = get_db().execute(
        "SELECT u.*, COUNT(e.id) AS entries, MAX(e.date) AS last_entry"
        " FROM users u LEFT JOIN expenses e ON e.user_id = u.id"
        " GROUP BY u.id ORDER BY u.created_at"
    ).fetchall()
    return [dict(r) for r in rows]


def update_user(user_id, **fields):
    allowed = {"role", "is_active", "password_hash"}
    sets = {k: v for k, v in fields.items() if k in allowed}
    if not sets:
        return
    db = get_db()
    db.execute(
        f"UPDATE users SET {', '.join(f'{k} = ?' for k in sets)} WHERE id = ?",
        (*sets.values(), user_id),
    )
    db.commit()


def count_admins(active_only=True):
    sql = "SELECT COUNT(*) FROM users WHERE role = 'admin'"
    if active_only:
        sql += " AND is_active = 1"
    return get_db().execute(sql).fetchone()[0]


# --- options (dynamic dropdowns) ---------------------------------------------

def list_options(kind=None, active_only=False):
    uses = " + ".join(
        f"(SELECT COUNT(*) FROM {table} t WHERE t.{column} = o.id)"
        for table, column in OPTION_COLUMNS.values()
    )
    sql = f"SELECT o.*, ({uses}) AS uses FROM options o"
    where, params = [], []
    if kind:
        where.append("o.kind = ?")
        params.append(kind)
    if active_only:
        where.append("o.is_active = 1")
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY o.kind, o.sort_order, o.id"
    return [dict(r) for r in get_db().execute(sql, params)]


def options_by_kind(active_only=True):
    grouped = {kind: [] for kind in OPTION_KINDS}
    for o in list_options(active_only=active_only):
        grouped.setdefault(o["kind"], []).append(
            {"id": o["id"], "label": o["label"], "active": bool(o["is_active"])}
        )
    return grouped


def get_option(option_id):
    row = get_db().execute("SELECT * FROM options WHERE id = ?", (option_id,)).fetchone()
    return dict(row) if row else None


def _clean_label(label):
    label = str(label or "").strip()
    if not label or len(label) > 40:
        raise ValidationError("A value must be 1–40 characters.")
    return label


def add_option(kind, label):
    if kind not in OPTION_KINDS:
        raise ValidationError("Unknown dropdown.")
    label = _clean_label(label)
    db = get_db()
    next_order = db.execute(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM options WHERE kind = ?", (kind,)
    ).fetchone()[0]
    try:
        db.execute(
            "INSERT INTO options (kind, label, sort_order) VALUES (?, ?, ?)",
            (kind, label, next_order),
        )
    except sqlite3.IntegrityError:
        raise ValidationError(f"“{label}” already exists in this dropdown.")
    db.commit()


def rename_option(option_id, label):
    label = _clean_label(label)
    db = get_db()
    try:
        db.execute("UPDATE options SET label = ? WHERE id = ?", (label, option_id))
    except sqlite3.IntegrityError:
        raise ValidationError(f"“{label}” already exists in this dropdown.")
    db.commit()


def set_option_active(option_id, active):
    opt = get_option(option_id)
    if opt is None:
        raise ValidationError("Value not found.")
    if not active and OPTION_KINDS[opt["kind"]]["required"]:
        remaining = get_db().execute(
            "SELECT COUNT(*) FROM options WHERE kind = ? AND is_active = 1 AND id != ?",
            (opt["kind"], option_id),
        ).fetchone()[0]
        if remaining == 0:
            raise ValidationError("A required dropdown needs at least one visible value.")
    db = get_db()
    db.execute("UPDATE options SET is_active = ? WHERE id = ?", (1 if active else 0, option_id))
    db.commit()


def move_option(option_id, direction):
    opt = get_option(option_id)
    if opt is None:
        return
    siblings = [o["id"] for o in list_options(opt["kind"])]
    i = siblings.index(option_id)
    j = i - 1 if direction == "up" else i + 1
    if not 0 <= j < len(siblings):
        return
    siblings[i], siblings[j] = siblings[j], siblings[i]
    db = get_db()
    db.executemany(
        "UPDATE options SET sort_order = ? WHERE id = ?",
        [(n, oid) for n, oid in enumerate(siblings)],
    )
    db.commit()


def delete_option(option_id):
    opt = next((o for o in list_options() if o["id"] == option_id), None)
    if opt is None:
        raise ValidationError("Value not found.")
    if opt["uses"]:
        raise ValidationError("This value is used by existing expenses — hide it instead.")
    if opt["is_active"]:
        set_option_active(option_id, False)  # reuses the "at least one visible" guard
    db = get_db()
    db.execute("DELETE FROM options WHERE id = ?", (option_id,))
    db.commit()


# --- dates ------------------------------------------------------------------

def month_bounds(year, month):
    last = calendar.monthrange(year, month)[1]
    return date(year, month, 1).isoformat(), date(year, month, last).isoformat()


def week_of(iso_date):
    """Weeks follow the PDF's four tracker pages: 1-7, 8-14, 15-21, 22-end."""
    day = int(iso_date[8:10])
    return min((day - 1) // 7, 3) + 1


def _parse_common(data):
    """Date, amount and notes are shared by expenses, income and investments."""
    if not isinstance(data, dict):
        raise ValidationError("Expected a JSON object.")
    try:
        d = date.fromisoformat(str(data.get("date", "")))
    except ValueError:
        raise ValidationError("Date must be in YYYY-MM-DD format.")
    try:
        amount = round(float(data.get("amount")), 2)
    except (TypeError, ValueError):
        raise ValidationError("Amount must be a number.")
    if amount <= 0:
        raise ValidationError("Amount must be greater than zero.")
    return {"date": d.isoformat(), "amount": amount,
            "notes": str(data.get("notes") or "").strip()[:300]}


def _parse_option(data, kind):
    meta = OPTION_KINDS[kind]
    raw = data.get(f"{kind}_id")
    if raw in (None, ""):
        if meta["required"]:
            raise ValidationError(f"Please choose a {meta['title']}.")
        return None
    try:
        opt = get_option(int(raw))
    except (TypeError, ValueError):
        opt = None
    if opt is None or opt["kind"] != kind:
        raise ValidationError(f"Invalid {meta['title']}.")
    return opt["id"]


def _parse_text(data, field, label, max_len=100):
    value = str(data.get(field, "")).strip()
    if not value or len(value) > max_len:
        raise ValidationError(f"{label} is required (max {max_len} characters).")
    return value


def parse_expense(data):
    """Validate an incoming expense payload; option fields are option ids."""
    clean = _parse_common(data)
    clean["item"] = _parse_text(data, "item", "Expense name")
    for kind in EXPENSE_KINDS:
        clean[f"{kind}_id"] = _parse_option(data, kind)
    return clean


def parse_income(data):
    clean = _parse_common(data)
    clean["income_source_id"] = _parse_option(data, "income_source")
    return clean


def parse_investment(data):
    clean = _parse_common(data)
    clean["investment_type_id"] = _parse_option(data, "investment_type")
    clean["name"] = _parse_text(data, "name", "Investment name", 80)
    action = data.get("action")
    if action not in INVESTMENT_ACTIONS:
        raise ValidationError("Choose whether you put money in or took money out.")
    clean["action"] = action
    return clean


def _delete_row(table, user_id, row_id):
    db = get_db()
    cur = db.execute(f"DELETE FROM {table} WHERE id = ? AND user_id = ?", (row_id, user_id))
    db.commit()
    return cur.rowcount > 0


# --- expenses ---------------------------------------------------------------

_EXPENSE_SELECT = (
    "SELECT e.*, c.label AS category, df.label AS driving_force, em.label AS emotion,"
    " pm.label AS payment_method"
    " FROM expenses e"
    " JOIN options c ON c.id = e.category_id"
    " JOIN options df ON df.id = e.driving_force_id"
    " JOIN options em ON em.id = e.emotion_id"
    " LEFT JOIN options pm ON pm.id = e.payment_method_id"
)


def list_expenses(user_id, year, month):
    start, end = month_bounds(year, month)
    rows = get_db().execute(
        _EXPENSE_SELECT + " WHERE e.user_id = ? AND e.date BETWEEN ? AND ? ORDER BY e.date, e.id",
        (user_id, start, end),
    ).fetchall()
    return [dict(r, week=week_of(r["date"])) for r in rows]


def get_expense(user_id, expense_id):
    row = get_db().execute(
        _EXPENSE_SELECT + " WHERE e.user_id = ? AND e.id = ?", (user_id, expense_id)
    ).fetchone()
    return dict(row) if row else None


def add_expense(user_id, e):
    db = get_db()
    cur = db.execute(
        "INSERT INTO expenses (user_id, date, item, amount, category_id, driving_force_id,"
        " emotion_id, payment_method_id, notes) VALUES (:user_id, :date, :item, :amount,"
        " :category_id, :driving_force_id, :emotion_id, :payment_method_id, :notes)",
        {**e, "user_id": user_id},
    )
    db.commit()
    return cur.lastrowid


def update_expense(user_id, expense_id, e):
    db = get_db()
    cur = db.execute(
        "UPDATE expenses SET date=:date, item=:item, amount=:amount, category_id=:category_id,"
        " driving_force_id=:driving_force_id, emotion_id=:emotion_id,"
        " payment_method_id=:payment_method_id, notes=:notes"
        " WHERE id=:id AND user_id=:user_id",
        {**e, "id": expense_id, "user_id": user_id},
    )
    db.commit()
    return cur.rowcount > 0


def delete_expense(user_id, expense_id):
    return _delete_row("expenses", user_id, expense_id)


# --- income -------------------------------------------------------------------
# Rows expose the option id as income_source_id so the form code can treat every
# dropdown the same way ("<kind>_id").

_INCOME_SELECT = (
    "SELECT i.id, i.user_id, i.date, i.amount, i.notes, i.source_id AS income_source_id,"
    " o.label AS income_source FROM incomes i JOIN options o ON o.id = i.source_id"
)


def list_incomes(user_id, year, month):
    start, end = month_bounds(year, month)
    rows = get_db().execute(
        _INCOME_SELECT + " WHERE i.user_id = ? AND i.date BETWEEN ? AND ? ORDER BY i.date, i.id",
        (user_id, start, end),
    ).fetchall()
    return [dict(r) for r in rows]


def get_income(user_id, income_id):
    row = get_db().execute(
        _INCOME_SELECT + " WHERE i.user_id = ? AND i.id = ?", (user_id, income_id)
    ).fetchone()
    return dict(row) if row else None


def add_income(user_id, i):
    db = get_db()
    cur = db.execute(
        "INSERT INTO incomes (user_id, date, source_id, amount, notes)"
        " VALUES (:user_id, :date, :income_source_id, :amount, :notes)",
        {**i, "user_id": user_id},
    )
    db.commit()
    return cur.lastrowid


def update_income(user_id, income_id, i):
    db = get_db()
    cur = db.execute(
        "UPDATE incomes SET date=:date, source_id=:income_source_id, amount=:amount, notes=:notes"
        " WHERE id=:id AND user_id=:user_id",
        {**i, "id": income_id, "user_id": user_id},
    )
    db.commit()
    return cur.rowcount > 0


def delete_income(user_id, income_id):
    return _delete_row("incomes", user_id, income_id)


# --- investments ----------------------------------------------------------------

_INVESTMENT_SELECT = (
    "SELECT v.id, v.user_id, v.date, v.name, v.action, v.amount, v.notes,"
    " v.type_id AS investment_type_id, o.label AS investment_type"
    " FROM investments v JOIN options o ON o.id = v.type_id"
)


def _canonical_name(user_id, name):
    """Reuse the existing spelling of a holding so "sbi fd" and "SBI FD" stay one holding."""
    row = get_db().execute(
        "SELECT name FROM investments WHERE user_id = ? AND name = ? COLLATE NOCASE"
        " ORDER BY id LIMIT 1", (user_id, name),
    ).fetchone()
    return row["name"] if row else name


def list_investments(user_id, year, month):
    start, end = month_bounds(year, month)
    rows = get_db().execute(
        _INVESTMENT_SELECT + " WHERE v.user_id = ? AND v.date BETWEEN ? AND ? ORDER BY v.date, v.id",
        (user_id, start, end),
    ).fetchall()
    return [dict(r) for r in rows]


def get_investment(user_id, investment_id):
    row = get_db().execute(
        _INVESTMENT_SELECT + " WHERE v.user_id = ? AND v.id = ?", (user_id, investment_id)
    ).fetchone()
    return dict(row) if row else None


def add_investment(user_id, v):
    v = {**v, "name": _canonical_name(user_id, v["name"]), "user_id": user_id}
    db = get_db()
    cur = db.execute(
        "INSERT INTO investments (user_id, date, type_id, name, action, amount, notes)"
        " VALUES (:user_id, :date, :investment_type_id, :name, :action, :amount, :notes)", v,
    )
    db.commit()
    return cur.lastrowid


def update_investment(user_id, investment_id, v):
    v = {**v, "name": _canonical_name(user_id, v["name"]), "id": investment_id, "user_id": user_id}
    db = get_db()
    cur = db.execute(
        "UPDATE investments SET date=:date, type_id=:investment_type_id, name=:name, action=:action,"
        " amount=:amount, notes=:notes WHERE id=:id AND user_id=:user_id", v,
    )
    db.commit()
    return cur.rowcount > 0


def delete_investment(user_id, investment_id):
    return _delete_row("investments", user_id, investment_id)


def holding_names(user_id):
    """Each holding the user has, with its most recent type, used to prefill the form."""
    rows = get_db().execute(
        "SELECT v.name, v.type_id AS investment_type_id FROM investments v"
        " WHERE v.user_id = ? AND v.id = (SELECT v2.id FROM investments v2"
        "   WHERE v2.user_id = v.user_id AND v2.name = v.name COLLATE NOCASE"
        "   ORDER BY v2.date DESC, v2.id DESC LIMIT 1)"
        " ORDER BY v.name COLLATE NOCASE", (user_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def set_holding_value(user_id, name, value):
    """Store (or clear, when value is None) what a holding is worth today."""
    db = get_db()
    if value is None:
        db.execute("DELETE FROM holding_values WHERE user_id = ? AND name = ?", (user_id, name))
    else:
        db.execute(
            "INSERT INTO holding_values (user_id, name, current_value) VALUES (?, ?, ?)"
            " ON CONFLICT(user_id, name) DO UPDATE SET current_value = excluded.current_value,"
            " updated_at = CURRENT_TIMESTAMP",
            (user_id, name, value),
        )
    db.commit()


def _fold_allocation(by_type, total, max_slices=8):
    """Largest types first; anything past the 7th is grouped as "Other" (8 chart colours)."""
    items = sorted(((k, v) for k, v in by_type.items() if v > 0), key=lambda kv: -kv[1])
    if len(items) > max_slices:
        rest = sum(v for _, v in items[max_slices - 1:])
        items = items[:max_slices - 1] + [("Other", rest)]
    return [{"label": k, "amount": v, "share": v / total if total else 0} for k, v in items]


def portfolio(user_id, year):
    """Every holding with money put in / taken out, today's value and gain."""
    db = get_db()
    rows = db.execute(
        "SELECT v.name,"
        " (SELECT o.label FROM investments v2 JOIN options o ON o.id = v2.type_id"
        "   WHERE v2.user_id = v.user_id AND v2.name = v.name COLLATE NOCASE"
        "   ORDER BY v2.date DESC, v2.id DESC LIMIT 1) AS type,"
        " SUM(CASE WHEN v.action = 'invest' THEN v.amount ELSE 0 END) AS put_in,"
        " SUM(CASE WHEN v.action = 'withdraw' THEN v.amount ELSE 0 END) AS taken_out,"
        " MIN(v.date) AS first_date, MAX(v.date) AS last_date, COUNT(*) AS entries,"
        " hv.current_value, hv.updated_at AS value_updated"
        " FROM investments v"
        " LEFT JOIN holding_values hv ON hv.user_id = v.user_id AND hv.name = v.name"
        " WHERE v.user_id = ? GROUP BY v.name COLLATE NOCASE ORDER BY put_in DESC",
        (user_id,),
    ).fetchall()
    holdings = []
    for r in rows:
        h = dict(r)
        h["net"] = h["put_in"] - h["taken_out"]
        h["value"] = h["current_value"] if h["current_value"] is not None else max(h["net"], 0)
        if h["current_value"] is not None:
            h["gain"] = h["current_value"] - h["net"]
            h["gain_pct"] = h["gain"] / h["net"] if h["net"] > 0 else None
        else:
            h["gain"] = h["gain_pct"] = None
        holdings.append(h)

    by_type = {}
    for h in holdings:
        by_type[h["type"]] = by_type.get(h["type"], 0) + h["value"]
    total_value = sum(by_type.values())
    valued = [h for h in holdings if h["current_value"] is not None]

    start, end = f"{year:04d}-01-01", f"{year:04d}-12-31"
    monthly = {m: 0.0 for m in range(1, 13)}
    for r in db.execute(
        "SELECT CAST(substr(date, 6, 2) AS INTEGER) AS m,"
        " SUM(CASE WHEN action = 'invest' THEN amount ELSE -amount END) AS net"
        " FROM investments WHERE user_id = ? AND date BETWEEN ? AND ? GROUP BY m",
        (user_id, start, end),
    ):
        monthly[r["m"]] = r["net"]

    return {
        "holdings": holdings,
        "totals": {
            "put_in": sum(h["put_in"] for h in holdings),
            "taken_out": sum(h["taken_out"] for h in holdings),
            "net": sum(h["net"] for h in holdings),
            "value": total_value,
            "gain": sum(h["gain"] for h in valued) if valued else None,
            "valued_count": len(valued),
        },
        "allocation": _fold_allocation(by_type, total_value),
        "monthly": [{"month": m, "label": calendar.month_abbr[m], "net": monthly[m]} for m in monthly],
    }


# --- month plan / reflection --------------------------------------------------

MONTH_TEXT_FIELDS = ("vision", "achievements", "notes")


def get_month(user_id, year, month):
    row = get_db().execute(
        "SELECT * FROM months WHERE user_id = ? AND year = ? AND month = ?",
        (user_id, year, month),
    ).fetchone()
    if row is None:
        return {"vision": "", "tasks": [], "achievements": "", "notes": ""}
    return {
        "vision": row["vision"],
        "tasks": json.loads(row["tasks"] or "[]"),
        "achievements": row["achievements"],
        "notes": row["notes"],
    }


def save_month(user_id, year, month, data):
    """Merge the given fields into the month's plan/reflection."""
    if not isinstance(data, dict):
        raise ValidationError("Expected a JSON object.")
    current = get_month(user_id, year, month)
    for field in MONTH_TEXT_FIELDS:
        if field in data:
            current[field] = str(data[field] or "").strip()[:5000]
    if "tasks" in data:
        tasks = data["tasks"] if isinstance(data["tasks"], list) else []
        current["tasks"] = [
            {"text": str(t.get("text", "")).strip()[:200], "done": bool(t.get("done"))}
            for t in tasks
            if isinstance(t, dict) and str(t.get("text", "")).strip()
        ][:50]

    db = get_db()
    db.execute(
        "INSERT INTO months (user_id, year, month, vision, tasks, achievements, notes)"
        " VALUES (?, ?, ?, ?, ?, ?, ?)"
        " ON CONFLICT(user_id, year, month) DO UPDATE SET vision=excluded.vision,"
        " tasks=excluded.tasks, achievements=excluded.achievements, notes=excluded.notes",
        (user_id, year, month, current["vision"], json.dumps(current["tasks"]),
         current["achievements"], current["notes"]),
    )
    db.commit()
    return current


# --- reflection tallies -------------------------------------------------------

def _tally(rows, key, options, amount=lambda r: r["amount"]):
    """Count + sum per option; active options always appear, hidden ones only if used."""
    buckets = {o["label"]: {"count": 0, "amount": 0.0} for o in options if o["active"]}
    for r in rows:
        label = r[key] or "Not set"
        b = buckets.setdefault(label, {"count": 0, "amount": 0.0})
        b["count"] += 1
        b["amount"] += amount(r)
    return [{"label": k, **v} for k, v in buckets.items()]


def _signed(v):
    return v["amount"] if v["action"] == "invest" else -v["amount"]


def summarize(expenses, incomes, investments, options):
    """The month in one formula: Income - Spent - Invested = Left over."""
    spent = sum(e["amount"] for e in expenses)
    income = sum(i["amount"] for i in incomes)
    put_in = sum(v["amount"] for v in investments if v["action"] == "invest")
    taken_out = sum(v["amount"] for v in investments if v["action"] == "withdraw")
    invested = put_in - taken_out
    kept = income - spent                       # what wasn't spent: invested + left over
    clamp = lambda x: max(0.0, min(1.0, x))  # noqa: E731
    weeks = [
        {"week": n,
         "total": sum(e["amount"] for e in expenses if e["week"] == n),
         "count": sum(1 for e in expenses if e["week"] == n)}
        for n in range(1, 5)
    ]
    tallies = {kind: _tally(expenses, kind, options.get(kind, [])) for kind in EXPENSE_KINDS}
    tallies["income_source"] = _tally(incomes, "income_source", options.get("income_source", []))
    tallies["investment_type"] = _tally(investments, "investment_type",
                                        options.get("investment_type", []), _signed)
    return {
        "total": spent,
        "count": len(expenses),
        "income": income,
        "income_count": len(incomes),
        "put_in": put_in,
        "taken_out": taken_out,
        "invested": invested,
        "left_over": income - spent - invested,
        "kept": kept,
        "savings_ratio": clamp(kept / income) if income else 0.0,
        "invested_ratio": clamp(invested / income) if income else 0.0,
        "overspent": spent > income > 0,
        "weeks": weeks,
        "tallies": tallies,
    }


def _monthly_sums(sql, user_id, year):
    start, end = f"{year:04d}-01-01", f"{year:04d}-12-31"
    return {r[0]: r[1] for r in get_db().execute(sql, (user_id, start, end))}


def year_overview(user_id, year):
    """Per-month totals, with a per-category split in the admin's category order."""
    start, end = f"{year:04d}-01-01", f"{year:04d}-12-31"
    by_month = {m: {"total": 0.0, "count": 0, "categories": {}} for m in range(1, 13)}
    for r in get_db().execute(
        "SELECT CAST(substr(e.date, 6, 2) AS INTEGER) AS m, c.label AS category,"
        " SUM(e.amount) AS amount, COUNT(*) AS n"
        " FROM expenses e JOIN options c ON c.id = e.category_id"
        " WHERE e.user_id = ? AND e.date BETWEEN ? AND ?"
        " GROUP BY m, c.id ORDER BY m, c.sort_order",
        (user_id, start, end),
    ):
        bucket = by_month[r["m"]]
        bucket["total"] += r["amount"]
        bucket["count"] += r["n"]
        bucket["categories"][r["category"]] = r["amount"]
    income = _monthly_sums(
        "SELECT CAST(substr(date, 6, 2) AS INTEGER), SUM(amount) FROM incomes"
        " WHERE user_id = ? AND date BETWEEN ? AND ? GROUP BY 1", user_id, year)
    invested = _monthly_sums(
        "SELECT CAST(substr(date, 6, 2) AS INTEGER),"
        " SUM(CASE WHEN action = 'invest' THEN amount ELSE -amount END) FROM investments"
        " WHERE user_id = ? AND date BETWEEN ? AND ? GROUP BY 1", user_id, year)
    months = []
    for m, s in by_month.items():
        inc = income.get(m, 0.0)
        inv = invested.get(m, 0.0)
        months.append({
            "month": m,
            "name": calendar.month_name[m],
            "total": s["total"],
            "count": s["count"],
            "categories": [
                {"label": k, "amount": v, "share": v / s["total"]}
                for k, v in s["categories"].items()
            ] if s["total"] else [],
            "income": inc,
            "invested": inv,
            "left_over": inc - s["total"] - inv,
            "has_data": bool(s["count"] or m in income or m in invested),
        })
    return months


def user_years(user_id):
    rows = get_db().execute(
        "SELECT DISTINCT CAST(substr(date, 1, 4) AS INTEGER) FROM expenses WHERE user_id = :u"
        " UNION SELECT DISTINCT CAST(substr(date, 1, 4) AS INTEGER) FROM incomes WHERE user_id = :u"
        " UNION SELECT DISTINCT CAST(substr(date, 1, 4) AS INTEGER) FROM investments WHERE user_id = :u"
        " UNION SELECT DISTINCT year FROM months WHERE user_id = :u ORDER BY 1",
        {"u": user_id},
    ).fetchall()
    return [r[0] for r in rows]


# --- admin dashboard (aggregates only, no individual amounts) ----------------

def admin_stats(today):
    db = get_db()
    month_start, month_end = month_bounds(today.year, today.month)
    one = lambda sql, *p: db.execute(sql, p).fetchone()[0]  # noqa: E731
    stats = {
        "users": one("SELECT COUNT(*) FROM users"),
        "admins": one("SELECT COUNT(*) FROM users WHERE role = 'admin'"),
        "inactive": one("SELECT COUNT(*) FROM users WHERE is_active = 0"),
        "active_this_month": one(
            "SELECT COUNT(*) FROM (SELECT user_id FROM expenses WHERE date BETWEEN ?1 AND ?2"
            " UNION SELECT user_id FROM incomes WHERE date BETWEEN ?1 AND ?2"
            " UNION SELECT user_id FROM investments WHERE date BETWEEN ?1 AND ?2)",
            month_start, month_end),
        "expenses_total": one("SELECT COUNT(*) FROM expenses"),
        "expenses_this_month": one(
            "SELECT COUNT(*) FROM expenses WHERE date BETWEEN ? AND ?", month_start, month_end),
        "incomes_total": one("SELECT COUNT(*) FROM incomes"),
        "investments_total": one("SELECT COUNT(*) FROM investments"),
    }
    stats["entries_per_day"] = [
        dict(r) for r in db.execute(
            "SELECT date(created_at) AS day, COUNT(*) AS n FROM expenses"
            " WHERE created_at >= date('now', '-29 days') GROUP BY day ORDER BY day")
    ]
    stats["signups_per_month"] = [
        dict(r) for r in db.execute(
            "SELECT substr(created_at, 1, 7) AS month, COUNT(*) AS n FROM users"
            " GROUP BY month ORDER BY month DESC LIMIT 12")
    ][::-1]
    stats["option_usage"] = {}
    for kind in ("driving_force", "emotion", "income_source", "investment_type"):
        table, column = OPTION_COLUMNS[kind]
        stats["option_usage"][kind] = [
            {"label": r["label"], "n": r["n"]}
            for r in db.execute(
                f"SELECT o.label, COUNT(t.id) AS n FROM options o"
                f" LEFT JOIN {table} t ON t.{column} = o.id"
                f" WHERE o.kind = ? GROUP BY o.id ORDER BY n DESC, o.sort_order", (kind,))
        ]
    return stats
