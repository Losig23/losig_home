"""Workout session + travel logging endpoints."""
import calendar as calendar_mod
from datetime import date

from flask import Blueprint, jsonify, make_response, request

from app import db
from app.lifting import is_pr_for_set
from app.models import PlannedSet, RoutineDay, SetLog, TravelSession, WorkoutSession

workout_bp = Blueprint("workout", __name__, url_prefix="/api")


def _parse_date(value):
    if not value:
        return date.today()
    return date.fromisoformat(value)


def _strict_date(value):
    """Parse a YYYY-MM-DD string; None on invalid (for 400 responses)."""
    try:
        return date.fromisoformat(value)
    except (ValueError, TypeError):
        return None


def _session_summary(session):
    """Compact session info for calendar/list views."""
    return {
        "id": session.id,
        "date": session.date.isoformat(),
        "day_number": session.day.day_number if session.day else None,
        "day_name": session.day.name if session.day else None,
        "travel_mode": session.travel_mode,
        "set_count": len(session.set_logs),
        "checked_count": sum(1 for log in session.set_logs if log.checked),
        "completion_pct": session.compute_completion_pct(),
    }


@workout_bp.post("/sessions")
def start_session():
    """Start a session: {"day_number": 1} or {"travel_mode": true, "date": "2026-09-23"}."""
    data = request.get_json(silent=True) or {}
    session_date = _parse_date(data.get("date"))

    if data.get("travel_mode"):
        session = WorkoutSession(date=session_date, travel_mode=True)
    else:
        day_number = data.get("day_number")
        day = RoutineDay.query.filter_by(day_number=day_number).first()
        if day is None:
            return jsonify({"error": "day_number must be 1-5"}), 400
        session = WorkoutSession(date=session_date, day_id=day.id)

    db.session.add(session)
    db.session.commit()
    return jsonify(session.to_dict()), 201


@workout_bp.get("/sessions")
def list_sessions():
    """Recent sessions, newest first. Optional filters: ?date=YYYY-MM-DD,
    or ?from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive)."""
    query = WorkoutSession.query

    single = request.args.get("date")
    if single:
        day = _strict_date(single)
        if day is None:
            return jsonify({"error": "date must be YYYY-MM-DD"}), 400
        query = query.filter(WorkoutSession.date == day)

    start = request.args.get("from")
    if start:
        start_date = _strict_date(start)
        if start_date is None:
            return jsonify({"error": "'from' must be YYYY-MM-DD"}), 400
        query = query.filter(WorkoutSession.date >= start_date)

    end = request.args.get("to")
    if end:
        end_date = _strict_date(end)
        if end_date is None:
            return jsonify({"error": "'to' must be YYYY-MM-DD"}), 400
        query = query.filter(WorkoutSession.date <= end_date)

    sessions = (
        query.order_by(WorkoutSession.date.desc(), WorkoutSession.id.desc())
        .limit(20)
        .all()
    )
    return jsonify([s.to_dict(include_routine=False) for s in sessions])


@workout_bp.get("/sessions/calendar")
def sessions_calendar():
    """Month view: {"YYYY-MM-DD": [session summaries]} for days with
    sessions. Query: ?year=YYYY&month=M (defaults to the current month)."""
    try:
        year = int(request.args.get("year", date.today().year))
        month = int(request.args.get("month", date.today().month))
    except (TypeError, ValueError):
        return jsonify({"error": "year and month must be integers"}), 400
    if not 1 <= month <= 12 or year < 1:
        return jsonify({"error": "month must be 1-12 and year positive"}), 400

    _, days_in_month = calendar_mod.monthrange(year, month)
    first = date(year, month, 1)
    last = date(year, month, days_in_month)

    sessions = (
        WorkoutSession.query.filter(
            WorkoutSession.date >= first, WorkoutSession.date <= last
        )
        .order_by(WorkoutSession.date.asc(), WorkoutSession.id.asc())
        .all()
    )
    out = {}
    for session in sessions:
        out.setdefault(session.date.isoformat(), []).append(
            _session_summary(session)
        )
    return jsonify(out)


@workout_bp.delete("/sessions/<int:session_id>")
def delete_session(session_id):
    """Delete a session and its set logs (relationship cascade)."""
    session = db.session.get(WorkoutSession, session_id)
    if session is None:
        return jsonify({"error": "Session not found"}), 404
    db.session.delete(session)
    db.session.commit()
    return jsonify({"deleted": session_id})


@workout_bp.patch("/sessions/<int:session_id>")
def update_session(session_id):
    """Modify a session: {"date": "YYYY-MM-DD", "day_number": 2} and/or
    {"routine_day_id": <id> | null}. completion_pct is recomputed."""
    session = db.session.get(WorkoutSession, session_id)
    if session is None:
        return jsonify({"error": "Session not found"}), 404

    data = request.get_json(silent=True) or {}
    changed = False

    if "date" in data:
        new_date = _strict_date(data["date"])
        if new_date is None:
            return jsonify({"error": "date must be YYYY-MM-DD"}), 400
        session.date = new_date
        changed = True

    if "day_number" in data:
        day = RoutineDay.query.filter_by(
            day_number=data["day_number"]
        ).first()
        if day is None:
            return jsonify({"error": "day_number must be 1-5"}), 400
        session.day_id = day.id
        changed = True
    elif "routine_day_id" in data:
        day_id = data["routine_day_id"]
        if day_id is None:
            session.day_id = None
        else:
            day = db.session.get(RoutineDay, day_id)
            if day is None:
                return jsonify({"error": "routine_day_id not found"}), 400
            session.day_id = day.id
        changed = True

    if not changed:
        return (
            jsonify({"error": "provide date, day_number, or routine_day_id"}),
            400,
        )

    session.completed_pct = session.compute_completion_pct()
    db.session.commit()
    return jsonify(session.to_dict(include_routine=False))


def _num(value):
    return "—" if value is None else f"{value:g}"


@workout_bp.get("/sessions/<int:session_id>/export")
def export_session(session_id):
    """Download a human-readable .txt summary of the session."""
    session = db.session.get(WorkoutSession, session_id)
    if session is None:
        return jsonify({"error": "Session not found"}), 404

    lines = [f"Workout session #{session.id} — {session.date.isoformat()}"]
    if session.day:
        lines.append(
            f"Routine day: Day {session.day.day_number} — {session.day.name}"
        )
    elif session.travel_mode:
        lines.append("Travel mode session")
    else:
        lines.append("No routine day attached")
    lines.append("")

    if session.travel_mode:
        for entry in TravelSession.query.filter_by(
            date=session.date
        ).order_by(TravelSession.id):
            pushups = _num(entry.pushups)
            situps = _num(entry.situps)
            lines.append(f"Travel log: {pushups} push-ups, {situps} sit-ups")
            if entry.notes:
                lines.append(f"  notes: {entry.notes}")
        if not lines[-1].startswith("Travel log"):
            lines.append("No travel logs for this date yet.")

    total = checked = 0
    for group in session.sets_by_exercise():
        lines.append(group["exercise_name"])
        logged_by_planned = {
            log["planned_set_id"]: log
            for log in group["logged"]
            if log["planned_set_id"] is not None
        }
        for planned in group["planned"]:
            total += 1
            log = logged_by_planned.get(planned["id"])
            is_checked = bool(log and log["checked"])
            checked += 1 if is_checked else 0
            weight = (
                log["actual_weight_lb"]
                if log and log.get("actual_weight_lb") is not None
                else planned["weight_lb"]
            )
            reps = (
                log["actual_reps"]
                if log and log.get("actual_reps") is not None
                else planned["target_reps"]
            )
            mark = "x" if is_checked else " "
            lines.append(
                f"  [{mark}] Set {planned['set_number']}: "
                f"{_num(weight)} lb x {_num(reps)} reps"
            )
        for log in group["logged"]:
            if log["planned_set_id"] is not None:
                continue
            total += 1
            checked += 1 if log["checked"] else 0
            mark = "x" if log["checked"] else " "
            extra_n = log.get("set_number") or ""
            lines.append(
                f"  [{mark}] Extra set {extra_n}: "
                f"{_num(log.get('actual_weight_lb'))} lb x "
                f"{_num(log.get('actual_reps'))} reps".rstrip()
            )

    pct = session.compute_completion_pct()
    pct_text = f", {pct}% complete" if pct is not None else ""
    lines += ["", f"Totals: {total} sets, {checked} checked{pct_text}"]
    body = "\n".join(lines) + "\n"

    resp = make_response(body)
    resp.headers["Content-Type"] = "text/plain"
    resp.headers["Content-Disposition"] = (
        f"attachment; filename=session-{session.date.isoformat()}.txt"
    )
    return resp


@workout_bp.get("/sessions/<int:session_id>")
def get_session(session_id):
    session = db.session.get(WorkoutSession, session_id)
    if session is None:
        return jsonify({"error": "Session not found"}), 404
    session.completed_pct = session.compute_completion_pct()
    db.session.commit()
    return jsonify(session.to_dict())


@workout_bp.patch("/sessions/<int:session_id>/check")
def check_sets(session_id):
    """Check off sets: {"checks": [{"planned_set_id": 3, "checked": true,
    "actual_reps": 12, "actual_weight_lb": 45}, ...]}"""
    session = db.session.get(WorkoutSession, session_id)
    if session is None:
        return jsonify({"error": "Session not found"}), 404
    if session.travel_mode:
        return jsonify({"error": "Travel sessions have no planned sets"}), 400

    valid_ids = set(session.planned_set_ids())
    data = request.get_json(silent=True) or {}
    checks = data.get("checks", [])
    if not isinstance(checks, list):
        return jsonify({"error": "'checks' must be a list"}), 400

    updated = 0
    set_results = []
    for item in checks:
        planned_set_id = item.get("planned_set_id")
        if planned_set_id not in valid_ids:
            return (
                jsonify({"error": f"planned_set_id {planned_set_id} "
                                  f"is not part of this session's day"}),
                400,
            )
        log = SetLog.query.filter_by(
            session_id=session.id, planned_set_id=planned_set_id
        ).first()
        if log is None:
            log = SetLog(session_id=session.id, planned_set_id=planned_set_id)
            db.session.add(log)
        log.checked = bool(item.get("checked", False))
        if "actual_reps" in item:
            log.actual_reps = item["actual_reps"]
        if "actual_weight_lb" in item:
            log.actual_weight_lb = item["actual_weight_lb"]
        # Flush so the row has an id before PR comparison, and so sets
        # earlier in this same request count as "prior" for later ones.
        db.session.flush()
        planned_set = db.session.get(PlannedSet, planned_set_id)
        if log.checked:
            log.is_pr = is_pr_for_set(
                log, planned_set.exercise_id, exclude_id=log.id
            )
        else:
            log.is_pr = False
        set_results.append(
            {"planned_set_id": planned_set_id, "is_pr": bool(log.is_pr)}
        )
        updated += 1

    session.completed_pct = session.compute_completion_pct()
    db.session.commit()
    return jsonify({
        "session_id": session.id,
        "updated": updated,
        "completed_pct": session.completed_pct,
        "sets": set_results,
    })


@workout_bp.post("/travel")
def log_travel():
    """Log a travel workout: {"date": "2026-09-23", "pushups": 60,
    "situps": 50, "notes": "..."}."""
    data = request.get_json(silent=True) or {}
    entry = TravelSession(
        date=_parse_date(data.get("date")),
        pushups=data.get("pushups"),
        situps=data.get("situps"),
        notes=data.get("notes"),
    )
    db.session.add(entry)
    db.session.commit()
    return jsonify(entry.to_dict()), 201


@workout_bp.get("/travel")
def list_travel():
    entries = (
        TravelSession.query.order_by(TravelSession.date.desc(),
                                     TravelSession.id.desc())
        .limit(20)
        .all()
    )
    return jsonify([e.to_dict() for e in entries])
