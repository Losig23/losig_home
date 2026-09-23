"""Read-only routine endpoints."""
from flask import Blueprint, jsonify
from app.models import RoutineDay

routine_bp = Blueprint("routine", __name__, url_prefix="/api")


@routine_bp.get("/health")
def health():
    return jsonify({"status": "ok", "service": "losig_home"})


@routine_bp.get("/routine")
def get_routine():
    days = RoutineDay.query.order_by(RoutineDay.day_number).all()
    return jsonify([d.to_dict() for d in days])


@routine_bp.get("/routine/<int:day_number>")
def get_routine_day(day_number):
    day = RoutineDay.query.filter_by(day_number=day_number).first()
    if day is None:
        return jsonify({"error": f"No routine day {day_number}"}), 404
    return jsonify(day.to_dict())
