"""Eisenhower time matrix: log 20 waking hours a day and review 10-day cycles."""
from datetime import date, datetime, timedelta

from flask import (Blueprint, abort, flash, g, jsonify, redirect, render_template, request,
                   url_for)

import db
from auth import login_required

bp = Blueprint("time_tracker", __name__, url_prefix="/time-tracker")
api_bp = Blueprint("time_tracker_api", __name__, url_prefix="/api/time-tracker")


def _day(value):
    try:
        day = date.fromisoformat(str(value))
    except ValueError:
        abort(404)
    if not 1900 <= day.year <= 2999:
        abort(404)
    return day


def _summary(log):
    """Quadrant counts and percentages for one day's log."""
    hours = {q: 0 for q in db.QUADRANTS}
    for slot in log["slots"]:
        if slot["logged"]:
            hours[slot["classification"]] += 1
    logged = sum(hours.values())
    return {
        "logged": logged,
        "hours": hours,
        "pct": {q: (hours[q] / logged if logged else 0.0) for q in db.QUADRANTS},
    }


def _day_page(day):
    """Shared context for the daily logging page."""
    today = date.today()
    log = db.get_time_log(g.user["id"], day.isoformat())
    summary = _summary(log)
    now = datetime.now()
    now_slot = None
    if 4 <= now.hour <= 23:
        now_slot = db.TIME_SLOTS[now.hour - 4]["key"]
    return {
        "log": log,
        "log_date": day,
        "today": today,
        "hours": summary["hours"],
        "pct": summary["pct"],
        "logged_hours": summary["logged"],
        "slot_count": len(db.TIME_SLOTS),
        "quadrants": db.QUADRANTS,
        "prev_day": (day - timedelta(days=1)).isoformat(),
        "next_day": (day + timedelta(days=1)).isoformat(),
        "is_today": day == today,
        "is_future": day > today,
        "api_url": url_for("time_tracker_api.save_log", day=day.isoformat()),
        "now_slot": now_slot,
        "now_label": now.strftime("%H:%M"),
        "now_hour": now.hour,
        "is_new": log["id"] is None,
        "cycle_days": db.cycle_strip(g.user["id"], day.isoformat(), today),
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


@bp.route("/analysis")
@login_required
def analysis():
    today = date.today()
    return render_template(
        "time/analysis.html",
        data=db.time_analysis(g.user["id"], today),
        today=today,
        quadrants=db.QUADRANTS,
    )


# --- autosave -----------------------------------------------------------------

@api_bp.route("/log/<day>", methods=("POST",))
@login_required
def save_log(day):
    """Autosave one day's hours; the page still works without JavaScript."""
    d = _day(day)
    if d > date.today():
        return jsonify(error="You can't log hours that haven't happened yet."), 400
    try:
        db.save_time_log_json(g.user["id"], d.isoformat(), request.get_json(silent=True))
    except db.ValidationError as e:
        return jsonify(error=str(e)), 400
    log = db.get_time_log(g.user["id"], d.isoformat())
    summary = _summary(log)
    return jsonify(
        ok=True,
        date=d.isoformat(),
        day_number=log["day_number"],
        saved_at=datetime.now().strftime("%H:%M:%S"),
        is_happy=log["happy"],
        slots={slot["key"]: {"logged": slot["logged"], "classification": slot["classification"]}
               for slot in log["slots"]},
        **summary,
    )
