"""Eisenhower time matrix: log 20 waking hours a day and review 10-day cycles."""
from datetime import date, timedelta

from flask import Blueprint, abort, flash, g, redirect, render_template, request, url_for

import db
from auth import login_required

bp = Blueprint("time_tracker", __name__, url_prefix="/time-tracker")


def _day(value):
    try:
        day = date.fromisoformat(str(value))
    except ValueError:
        abort(404)
    if not 1900 <= day.year <= 2999:
        abort(404)
    return day


def _day_page(day):
    """Shared context for the daily logging page."""
    today = date.today()
    log = db.get_time_log(g.user["id"], day.isoformat())
    hours = {q: 0 for q in db.QUADRANTS}
    for slot in log["slots"]:
        if slot["logged"]:
            hours[slot["classification"]] += 1
    logged = sum(hours.values())
    return {
        "log": log,
        "log_date": day,
        "today": today,
        "hours": hours,
        "pct": {q: (hours[q] / logged if logged else 0.0) for q in db.QUADRANTS},
        "logged_hours": logged,
        "slot_count": len(db.TIME_SLOTS),
        "quadrants": db.QUADRANTS,
        "prev_day": (day - timedelta(days=1)).isoformat(),
        "next_day": (day + timedelta(days=1)).isoformat(),
        "is_today": day == today,
        "is_future": day > today,
    }


@bp.route("/")
@login_required
def home():
    return redirect(url_for("time_tracker.log_day", day=date.today().isoformat()))


@bp.route("/log")
@login_required
def log_jump():
    return redirect(url_for("time_tracker.log_day",
                            day=request.args.get("day") or date.today().isoformat()))


@bp.route("/log/<day>", methods=("GET", "POST"))
@login_required
def log_day(day):
    d = _day(day)
    today = date.today()
    if d > today:
        flash("You can't log hours that haven't happened yet.", "error")
        return redirect(url_for("time_tracker.log_day", day=today.isoformat()))

    if request.method == "POST":
        try:
            db.save_time_log(g.user["id"], d.isoformat(), request.form)
        except db.ValidationError as e:
            flash(str(e), "error")
        else:
            flash(f"Saved your time log for {d.strftime('%d %b %Y')}.", "success")
        return redirect(url_for("time_tracker.log_day", day=d.isoformat()))

    return render_template("time/log.html", **_day_page(d))


@bp.route("/dashboard")
@login_required
def dashboard():
    today = date.today()
    end = request.args.get("end")
    if end:
        d = _day(end)
        if d > today:
            d = today
    else:
        d = date.fromisoformat(db.time_default_date(g.user["id"], today))
    return render_template(
        "time/dashboard.html",
        data=db.cycle_data(g.user["id"], d.isoformat(), today),
        selected=d,
        today=today,
        quadrants=db.QUADRANTS,
    )
