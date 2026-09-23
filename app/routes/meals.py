"""Food log: photo upload, nutrition estimates, daily totals."""
import os
import uuid
from datetime import datetime

from flask import Blueprint, current_app, jsonify, request, send_file

from app import db
from app.models import MealLog
from app.nutrition import estimate_nutrition

meals_bp = Blueprint("meals", __name__, url_prefix="/api")

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
MAX_PHOTO_BYTES = 10 * 1024 * 1024


def _upload_dir():
    path = os.path.join(current_app.instance_path, "uploads", "meals")
    os.makedirs(path, exist_ok=True)
    return path


def _parse_float(value):
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _save_photo(file_storage):
    """Validate and store an uploaded image; returns the instance-relative path."""
    filename = file_storage.filename or ""
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        return None, f"photo must be one of {sorted(ALLOWED_EXTENSIONS)}"
    if not (file_storage.mimetype or "").startswith("image/"):
        return None, "photo must be an image upload"

    data = file_storage.read()
    if len(data) > MAX_PHOTO_BYTES:
        return None, "photo must be under 10MB"
    if not data:
        return None, "photo is empty"

    stored = f"{uuid.uuid4().hex}{ext}"
    full_path = os.path.join(_upload_dir(), stored)
    with open(full_path, "wb") as f:
        f.write(data)
    return os.path.join("uploads", "meals", stored), None


def _estimate_macros(description, manual):
    """Nutritionix when keys are configured, else manual values.

    Returns (macros_dict, source). Never raises for API problems — falls
    back to manual with source="manual".
    """
    app_id = os.environ.get("NUTRITIONIX_APP_ID")
    api_key = os.environ.get("NUTRITIONIX_API_KEY")
    if app_id and api_key:
        result = estimate_nutrition(description, app_id, api_key)
        if result is not None:
            return result, "nutritionix"
    return manual, "manual"


@meals_bp.post("/meals")
def log_meal():
    """Log a meal. multipart/form-data: `description` (required), `photo`
    (optional image ≤10MB), optional manual macros: calories, protein_g,
    carbs_g, fat_g."""
    description = (request.form.get("description") or "").strip()
    if not description:
        return jsonify({"error": "description is required"}), 400

    photo_path = None
    photo = request.files.get("photo")
    if photo and photo.filename:
        photo_path, err = _save_photo(photo)
        if err:
            return jsonify({"error": err}), 400

    manual = {
        "calories": _parse_float(request.form.get("calories")),
        "protein_g": _parse_float(request.form.get("protein_g")),
        "carbs_g": _parse_float(request.form.get("carbs_g")),
        "fat_g": _parse_float(request.form.get("fat_g")),
    }
    macros, source = _estimate_macros(description, manual)

    meal = MealLog(
        photo_path=photo_path,
        description=description,
        calories=macros.get("calories"),
        protein_g=macros.get("protein_g"),
        carbs_g=macros.get("carbs_g"),
        fat_g=macros.get("fat_g"),
        logged_at=datetime.now(),
        source=source,
    )
    db.session.add(meal)
    db.session.commit()
    return jsonify(meal.to_dict()), 201


@meals_bp.get("/meals")
def list_meals():
    """Meals for ?date=YYYY-MM-DD (defaults to today), oldest first."""
    day = request.args.get("date") or datetime.now().date().isoformat()
    try:
        datetime.strptime(day, "%Y-%m-%d")
    except ValueError:
        return jsonify({"error": "date must be YYYY-MM-DD"}), 400
    meals = (
        MealLog.query.filter(db.func.date(MealLog.logged_at) == day)
        .order_by(MealLog.logged_at.asc())
        .all()
    )
    return jsonify([m.to_dict() for m in meals])


@meals_bp.get("/meals/daily")
def daily_totals():
    """Macro totals for ?date=YYYY-MM-DD (defaults to today)."""
    day = request.args.get("date") or datetime.now().date().isoformat()
    try:
        datetime.strptime(day, "%Y-%m-%d")
    except ValueError:
        return jsonify({"error": "date must be YYYY-MM-DD"}), 400
    meals = MealLog.query.filter(db.func.date(MealLog.logged_at) == day).all()

    def total(attr):
        return round(sum(getattr(m, attr) or 0 for m in meals), 1)

    return jsonify(
        {
            "date": day,
            "calories": total("calories"),
            "protein_g": total("protein_g"),
            "carbs_g": total("carbs_g"),
            "fat_g": total("fat_g"),
            "meal_count": len(meals),
        }
    )


@meals_bp.get("/meals/<int:meal_id>/photo")
def serve_photo(meal_id):
    meal = db.session.get(MealLog, meal_id)
    if meal is None or not meal.photo_path:
        return jsonify({"error": "Photo not found"}), 404
    full_path = os.path.join(current_app.instance_path, meal.photo_path)
    if not os.path.isfile(full_path):
        return jsonify({"error": "Photo not found"}), 404
    return send_file(full_path)
