"""Workout session + travel logging endpoints."""
from datetime import date

from flask import Blueprint, jsonify, request

from app import db
from app.models import PlannedSet, RoutineDay, SetLog, TravelSession, WorkoutSession

workout_bp = Blueprint("workout", __name__, url_prefix="/api")


def _parse_date(value):
    if not value:
        return date.today()
    return date.fromisoformat(value)


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
    sessions = (
        WorkoutSession.query.order_by(WorkoutSession.date.desc(),
                                      WorkoutSession.id.desc())
        .limit(20)
        .all()
    )
    return jsonify([s.to_dict(include_routine=False) for s in sessions])


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
        updated += 1

    session.completed_pct = session.compute_completion_pct()
    db.session.commit()
    return jsonify({
        "session_id": session.id,
        "updated": updated,
        "completed_pct": session.completed_pct,
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
