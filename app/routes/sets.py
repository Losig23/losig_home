"""Free-form set logging for live gym use.

Unlike PATCH /api/sessions/<id>/check (which checks off planned sets),
these endpoints log sets as they happen: weight, reps, and the rest taken
before the set. They write SetLog rows with exercise_id set directly and
planned_set_id NULL.
"""
from flask import Blueprint, jsonify, request

from app import db
from app.lifting import est_1rm, is_pr_for_set
from app.models import Exercise, SetLog, WorkoutSession

sets_bp = Blueprint("sets", __name__, url_prefix="/api")


def _number(value, kind, field):
    if value is None:
        return None
    try:
        return kind(value)
    except (TypeError, ValueError):
        raise ValueError(f"'{field}' must be a number")


@sets_bp.post("/sessions/<int:session_id>/sets")
def log_set(session_id):
    """Log one set live: {"exercise_id": 3, "weight_lb": 45, "reps": 8,
    "rest_seconds": 90, "set_number": 2}.

    set_number defaults to max existing + 1 for this exercise+session.
    Returns the set with its est_1rm and is_pr flag.
    """
    session = db.session.get(WorkoutSession, session_id)
    if session is None:
        return jsonify({"error": "Session not found"}), 404

    data = request.get_json(silent=True) or {}
    exercise_id = data.get("exercise_id")
    exercise = db.session.get(Exercise, exercise_id) if exercise_id else None
    if exercise is None:
        return jsonify({"error": "exercise_id is required and must exist"}), 400

    try:
        weight = _number(data.get("weight_lb"), float, "weight_lb")
        reps = _number(data.get("reps"), int, "reps")
        rest = _number(data.get("rest_seconds"), int, "rest_seconds")
        set_number = _number(data.get("set_number"), int, "set_number")
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    if rest is not None and rest < 0:
        return jsonify({"error": "'rest_seconds' must be >= 0"}), 400

    if set_number is None:
        existing = [
            log.set_number
            for log in session.set_logs
            if log.resolved_exercise_id() == exercise.id
            and log.set_number is not None
        ]
        set_number = (max(existing) if existing else 0) + 1

    log = SetLog(
        session_id=session.id,
        exercise_id=exercise.id,
        planned_set_id=None,
        set_number=set_number,
        checked=True,
        actual_weight_lb=weight,
        actual_reps=reps,
        rest_seconds=rest,
    )
    db.session.add(log)
    # Flush so the row has an id before PR comparison.
    db.session.flush()
    log.is_pr = is_pr_for_set(log, exercise.id, exclude_id=log.id)
    db.session.commit()

    payload = log.to_dict()
    payload["est_1rm_lb"] = est_1rm(weight, reps)
    return jsonify(payload), 201


@sets_bp.patch("/sessions/<int:session_id>/sets/<int:set_id>")
def edit_set(session_id, set_id):
    """Fix a logged set: {"weight_lb": 50, "reps": 6, "rest_seconds": 120}."""
    log = SetLog.query.filter_by(id=set_id, session_id=session_id).first()
    if log is None:
        return jsonify({"error": "Set not found"}), 404

    data = request.get_json(silent=True) or {}
    try:
        for field, attr, kind in [
            ("weight_lb", "actual_weight_lb", float),
            ("reps", "actual_reps", int),
            ("rest_seconds", "rest_seconds", int),
        ]:
            if field in data:
                setattr(log, attr, _number(data[field], kind, field))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    if log.rest_seconds is not None and log.rest_seconds < 0:
        return jsonify({"error": "'rest_seconds' must be >= 0"}), 400

    db.session.flush()
    exercise_id = log.resolved_exercise_id()
    if log.checked and exercise_id is not None:
        log.is_pr = is_pr_for_set(log, exercise_id, exclude_id=log.id)
    db.session.commit()

    payload = log.to_dict()
    payload["est_1rm_lb"] = est_1rm(log.actual_weight_lb, log.actual_reps)
    return jsonify(payload)


@sets_bp.delete("/sessions/<int:session_id>/sets/<int:set_id>")
def delete_set(session_id, set_id):
    """Remove a logged set (fat-fingered entry). PR flags on other sets
    are point-in-time and are not recomputed."""
    log = SetLog.query.filter_by(id=set_id, session_id=session_id).first()
    if log is None:
        return jsonify({"error": "Set not found"}), 404
    db.session.delete(log)
    db.session.commit()
    return jsonify({"deleted": set_id})
