"""SQLAlchemy models for the losig_home workout tracker."""
from app import db


class RoutineDay(db.Model):
    __tablename__ = "routine_day"

    id = db.Column(db.Integer, primary_key=True)
    day_number = db.Column(db.Integer, unique=True, nullable=False)
    name = db.Column(db.String(80), nullable=False)

    exercises = db.relationship(
        "Exercise",
        backref="day",
        cascade="all, delete-orphan",
        order_by="Exercise.position",
    )

    def to_dict(self, include_exercises=True):
        data = {"day_number": self.day_number, "name": self.name}
        if include_exercises:
            data["exercises"] = [e.to_dict() for e in self.exercises]
        return data


class Exercise(db.Model):
    __tablename__ = "exercise"

    id = db.Column(db.Integer, primary_key=True)
    day_id = db.Column(db.Integer, db.ForeignKey("routine_day.id"), nullable=False)
    name = db.Column(db.String(120), nullable=False)
    raw_label = db.Column(db.String(120), nullable=True)  # his original abbreviation
    position = db.Column(db.Integer, nullable=False)
    intensity = db.Column(db.String(8), nullable=False)  # H / M / L / VL / VH / M-H
    illustration_key = db.Column(db.String(80), nullable=True)  # future SVG lookup

    planned_sets = db.relationship(
        "PlannedSet",
        backref="exercise",
        cascade="all, delete-orphan",
        order_by="PlannedSet.set_number",
    )

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "raw_label": self.raw_label,
            "position": self.position,
            "intensity": self.intensity,
            "illustration_key": self.illustration_key,
            "sets": [s.to_dict() for s in self.planned_sets],
        }


class PlannedSet(db.Model):
    __tablename__ = "planned_set"

    id = db.Column(db.Integer, primary_key=True)
    exercise_id = db.Column(db.Integer, db.ForeignKey("exercise.id"), nullable=False)
    set_number = db.Column(db.Integer, nullable=False)
    weight_lb = db.Column(db.REAL, nullable=True)
    target_reps = db.Column(db.Integer, nullable=True)
    note = db.Column(db.Text, nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "set_number": self.set_number,
            "weight_lb": self.weight_lb,
            "target_reps": self.target_reps,
            "note": self.note,
        }


class WorkoutSession(db.Model):
    __tablename__ = "workout_session"

    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.Date, nullable=False)
    day_id = db.Column(db.Integer, db.ForeignKey("routine_day.id"), nullable=True)
    travel_mode = db.Column(db.Boolean, default=False, nullable=False)
    completed_pct = db.Column(db.REAL, nullable=True)

    day = db.relationship("RoutineDay")
    set_logs = db.relationship(
        "SetLog", backref="session", cascade="all, delete-orphan"
    )

    def planned_set_ids(self):
        if self.day is None:
            return []
        return [
            s.id for e in self.day.exercises for s in e.planned_sets
        ]

    def compute_completion_pct(self):
        """checked sets / planned sets * 100. Travel sessions: 100 if a travel
        log exists for the date, else None."""
        if self.travel_mode:
            has_log = (
                TravelSession.query.filter_by(date=self.date).first() is not None
            )
            return 100.0 if has_log else None
        planned = self.planned_set_ids()
        if not planned:
            return None
        checked = sum(1 for log in self.set_logs if log.checked)
        return round(checked / len(planned) * 100, 1)

    def to_dict(self, include_routine=True):
        data = {
            "id": self.id,
            "date": self.date.isoformat(),
            "day_number": self.day.day_number if self.day else None,
            "day_name": self.day.name if self.day else None,
            "travel_mode": self.travel_mode,
            "completed_pct": self.completed_pct,
            "set_logs": [log.to_dict() for log in self.set_logs],
        }
        if include_routine and self.day:
            data["routine"] = self.day.to_dict()
        return data


class SetLog(db.Model):
    __tablename__ = "set_log"
    __table_args__ = (
        db.UniqueConstraint("session_id", "planned_set_id", name="uq_session_set"),
    )

    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(
        db.Integer, db.ForeignKey("workout_session.id"), nullable=False
    )
    planned_set_id = db.Column(
        db.Integer, db.ForeignKey("planned_set.id"), nullable=False
    )
    checked = db.Column(db.Boolean, default=False, nullable=False)
    actual_reps = db.Column(db.Integer, nullable=True)
    actual_weight_lb = db.Column(db.REAL, nullable=True)

    planned_set = db.relationship("PlannedSet")

    def to_dict(self):
        return {
            "id": self.id,
            "planned_set_id": self.planned_set_id,
            "checked": self.checked,
            "actual_reps": self.actual_reps,
            "actual_weight_lb": self.actual_weight_lb,
        }


class TravelSession(db.Model):
    __tablename__ = "travel_session"

    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.Date, nullable=False)
    pushups = db.Column(db.Integer, nullable=True)
    situps = db.Column(db.Integer, nullable=True)
    notes = db.Column(db.Text, nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "date": self.date.isoformat(),
            "pushups": self.pushups,
            "situps": self.situps,
            "notes": self.notes,
        }


class BodyWeightLog(db.Model):
    """Daily scale weigh-ins (body weight in lb — not lift weights)."""

    __tablename__ = "body_weight_log"

    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.Date, unique=True, nullable=False)
    weight_lb = db.Column(db.REAL, nullable=False)
    note = db.Column(db.Text, nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "date": self.date.isoformat(),
            "weight_lb": self.weight_lb,
            "note": self.note,
        }


class MealLog(db.Model):
    """Food log: photo + description + calorie/macro estimate."""

    __tablename__ = "meal_log"

    id = db.Column(db.Integer, primary_key=True)
    photo_path = db.Column(db.String(255), nullable=True)  # relative to instance/
    description = db.Column(db.Text, nullable=False)
    calories = db.Column(db.REAL, nullable=True)
    protein_g = db.Column(db.REAL, nullable=True)
    carbs_g = db.Column(db.REAL, nullable=True)
    fat_g = db.Column(db.REAL, nullable=True)
    logged_at = db.Column(db.DateTime, nullable=False)
    source = db.Column(db.String(20), nullable=False, default="manual")

    def to_dict(self):
        return {
            "id": self.id,
            "photo_url": (
                f"/api/meals/{self.id}/photo" if self.photo_path else None
            ),
            "description": self.description,
            "calories": self.calories,
            "protein_g": self.protein_g,
            "carbs_g": self.carbs_g,
            "fat_g": self.fat_g,
            "logged_at": self.logged_at.isoformat(),
            "source": self.source,
        }
