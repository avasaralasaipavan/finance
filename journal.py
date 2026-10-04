"""The user's journal: cover, year view, month page, portfolio, JSON API and CSV export."""
import csv
import io
from datetime import date

from flask import (Blueprint, Response, abort, flash, g, jsonify, redirect, render_template,
                   request, url_for)

import db
from auth import login_required

bp = Blueprint("journal", __name__)


def _check_month(year, month):
    if not (1900 <= year <= 2999 and 1 <= month <= 12):
        abort(404)


def month_payload(year, month):
    uid = g.user["id"]
    options_all = db.options_by_kind(active_only=False)
    expenses = db.list_expenses(uid, year, month)
    incomes = db.list_incomes(uid, year, month)
    investments = db.list_investments(uid, year, month)
    return {
        "year": year,
        "month": month,
        "plan": db.get_month(uid, year, month),
        "expenses": expenses,
        "incomes": incomes,
        "investments": investments,
        "holdings": db.holding_names(uid),
        "summary": db.summarize(expenses, incomes, investments, options_all),
        "options": {k: [o for o in v if o["active"]] for k, v in options_all.items()},
        "option_kinds": db.OPTION_KINDS,
    }


# --- pages ------------------------------------------------------------------

@bp.route("/")
def cover():
    return render_template("cover.html")


@bp.route("/journal")
@login_required
def home():
    return redirect(url_for("journal.year_view", year=date.today().year))


@bp.route("/year/<int:year>")
@login_required
def year_view(year):
    _check_month(year, 1)
    years = sorted(set(db.user_years(g.user["id"])) | {date.today().year, year})
    return render_template(
        "year.html", year=year, years=years,
        months=db.year_overview(g.user["id"], year), today=date.today(),
    )


@bp.route("/month/<int:year>/<int:month>")
@login_required
def month_view(year, month):
    _check_month(year, month)
    prev_y, prev_m = (year - 1, 12) if month == 1 else (year, month - 1)
    next_y, next_m = (year + 1, 1) if month == 12 else (year, month + 1)
    return render_template(
        "month.html", year=year, month=month,
        prev=(prev_y, prev_m), next=(next_y, next_m),
        payload=month_payload(year, month), today=date.today().isoformat(),
        tab=request.args.get("tab", "expenses"),
    )


@bp.route("/portfolio")
@login_required
def portfolio():
    data_year = db.get_db().execute(
        "SELECT CAST(substr(MAX(date), 1, 4) AS INTEGER) FROM investments WHERE user_id = ?",
        (g.user["id"],),
    ).fetchone()[0]
    year = request.args.get("year", data_year or date.today().year, type=int)
    _check_month(year, 1)
    return render_template("portfolio.html", data=db.portfolio(g.user["id"], year), year=year,
                           today=date.today())


@bp.post("/portfolio/value")
@login_required
def portfolio_value():
    name = request.form.get("name", "").strip()
    raw = request.form.get("current_value", "").strip()
    if not any(h["name"] == name for h in db.holding_names(g.user["id"])):
        flash("Investment not found.", "error")
        return redirect(url_for("journal.portfolio"))
    try:
        value = None if raw == "" else round(float(raw), 2)
        if value is not None and value < 0:
            raise ValueError
    except ValueError:
        flash("Current value must be a number of 0 or more.", "error")
        return redirect(url_for("journal.portfolio"))
    db.set_holding_value(g.user["id"], name, value)
    flash(f"Updated today's value for {name}." if value is not None
          else f"Cleared today's value for {name}.", "success")
    return redirect(url_for("journal.portfolio"))


# --- JSON API ---------------------------------------------------------------

def _bad_request(e):
    return jsonify(error=str(e)), 400


@bp.get("/api/month/<int:year>/<int:month>")
@login_required
def api_month(year, month):
    _check_month(year, month)
    return jsonify(month_payload(year, month))


@bp.post("/api/month/<int:year>/<int:month>")
@login_required
def api_save_month(year, month):
    _check_month(year, month)
    try:
        db.save_month(g.user["id"], year, month, request.get_json(silent=True))
    except db.ValidationError as e:
        return _bad_request(e)
    return jsonify(month_payload(year, month))


# Expenses, income and investments share the same create/update/delete shape.
ENTRY_TYPES = {
    "expenses": (db.parse_expense, db.get_expense, db.add_expense, db.update_expense, db.delete_expense),
    "incomes": (db.parse_income, db.get_income, db.add_income, db.update_income, db.delete_income),
    "investments": (db.parse_investment, db.get_investment, db.add_investment,
                    db.update_investment, db.delete_investment),
}


def _entry_type(kind):
    if kind not in ENTRY_TYPES:
        abort(404)
    return ENTRY_TYPES[kind]


@bp.post("/api/<kind>")
@login_required
def api_add_entry(kind):
    parse, get, add, _update, _delete = _entry_type(kind)
    try:
        entry = parse(request.get_json(silent=True))
    except db.ValidationError as e:
        return _bad_request(e)
    new_id = add(g.user["id"], entry)
    return jsonify(get(g.user["id"], new_id)), 201


@bp.put("/api/<kind>/<int:entry_id>")
@login_required
def api_update_entry(kind, entry_id):
    parse, get, _add, update, _delete = _entry_type(kind)
    if get(g.user["id"], entry_id) is None:
        return jsonify(error="Entry not found."), 404
    try:
        entry = parse(request.get_json(silent=True))
    except db.ValidationError as e:
        return _bad_request(e)
    update(g.user["id"], entry_id, entry)
    return jsonify(get(g.user["id"], entry_id))


@bp.delete("/api/<kind>/<int:entry_id>")
@login_required
def api_delete_entry(kind, entry_id):
    *_rest, delete = _entry_type(kind)
    if not delete(g.user["id"], entry_id):
        return jsonify(error="Entry not found."), 404
    return "", 204


# --- export -----------------------------------------------------------------

def _csv_response(filename, header, rows):
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(header)
    writer.writerows(rows)
    # Leading BOM so Excel detects UTF-8.
    return Response(
        "﻿" + buf.getvalue(), mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@bp.route("/export/<int:year>/<int:month>.csv")
@login_required
def export_csv(year, month):
    _check_month(year, month)
    return _csv_response(
        f"expenses-{year}-{month:02d}.csv",
        ["Date", "Week", "Expense", "Amount", "Category", "Driving Force", "Emotion",
         "Payment Method", "Notes"],
        [[e["date"], e["week"], e["item"], e["amount"], e["category"], e["driving_force"],
          e["emotion"], e["payment_method"] or "", e["notes"]]
         for e in db.list_expenses(g.user["id"], year, month)],
    )


@bp.route("/export/<int:year>/<int:month>/income.csv")
@login_required
def export_income_csv(year, month):
    _check_month(year, month)
    return _csv_response(
        f"income-{year}-{month:02d}.csv",
        ["Date", "Source", "Amount", "Notes"],
        [[i["date"], i["income_source"], i["amount"], i["notes"]]
         for i in db.list_incomes(g.user["id"], year, month)],
    )


@bp.route("/export/<int:year>/<int:month>/investments.csv")
@login_required
def export_investments_csv(year, month):
    _check_month(year, month)
    return _csv_response(
        f"investments-{year}-{month:02d}.csv",
        ["Date", "Investment", "Type", "Put in / Taken out", "Amount", "Notes"],
        [[v["date"], v["name"], v["investment_type"], db.INVESTMENT_ACTIONS[v["action"]],
          v["amount"], v["notes"]]
         for v in db.list_investments(g.user["id"], year, month)],
    )
