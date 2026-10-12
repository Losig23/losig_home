"""Life log: manual gaming sessions, diary entries, and the calendar feeds.

The calendar is the unified timeline of the life hub: workouts and travel
days (their own blueprints) plus gaming sessions, meal summaries, and
diary markers from here. Everything is owner-scoped and login-gated by
the default-deny ``before_request`` hook — diary text in particular never
appears in any public payload.
"""
import calendar as calendar_mod
from datetime import date, datetime, timezone

from flask import Blueprint, jsonify, request
from sqlalchemy import func

from app import db
from app.auth import effective_user_id, get_owned
from app.models import (
    GAME_PLATFORMS,
    DiaryEntry,
    GameSession,
    MealLog,
    meal_logged_between,
)

life_bp = Blueprint("life", __name__, url_prefix="/api")


def _month_range():
    """Parse ?year=&month= into (first, last) dates, or a 400 response."""
    try:
        year = int(request.args.get("year", date.today().year))
        month = int(request.args.get("month", date.today().month))
    except (TypeError, ValueError):
        return None, (jsonify({"error": "year and month must be integers"}), 400)
    if not 1 <= month <= 12 or year < 1:
        return None, (jsonify({"error": "month must be 1-12 and year positive"}), 400)
    _, days_in_month = calendar_mod.monthrange(year, month)
    return (date(year, month, 1), date(year, month, days_in_month)), None


def _parse_date(value, field="date"):
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------------------
# Gaming
# ---------------------------------------------------------------------------

@life_bp.get("/gaming/calendar")
def gaming_calendar():
    """Month view: {"YYYY-MM-DD": [game summaries]} for days with plays."""
    (bounds, err) = _month_range()
    if err:
        return err
    first, last = bounds
    sessions = (
        GameSession.query.filter(
            GameSession.user_id == effective_user_id(),
            GameSession.played_on >= first,
            GameSession.played_on <= last,
        )
        .order_by(GameSession.played_on.asc(), GameSession.id.asc())
        .all()
    )
    out = {}
    for s in sessions:
        d = s.to_dict()
        d["kind"] = "gaming"
        out.setdefault(s.played_on.isoformat(), []).append(d)
    return jsonify(out)


@life_bp.get("/gaming")
def gaming_list():
    """Latest 50 game sessions, newest first."""
    sessions = (
        GameSession.query.filter(GameSession.user_id == effective_user_id())
        .order_by(GameSession.played_on.desc(), GameSession.id.desc())
        .limit(50)
        .all()
    )
    return jsonify([s.to_dict() for s in sessions])


@life_bp.post("/gaming")
def gaming_create():
    """Quick-add a played game. ``title`` and ``played_on`` required."""
    data = request.get_json(force=True, silent=True) or {}
    title = (data.get("title") or "").strip()
    if not title:
        return jsonify({"error": "title is required"}), 400
    platform = data.get("platform") or "PS5"
    if platform not in GAME_PLATFORMS:
        return jsonify({"error": f"platform must be one of {', '.join(GAME_PLATFORMS)}"}), 400
    played_on = _parse_date(data.get("played_on") or date.today().isoformat())
    if played_on is None:
        return jsonify({"error": "played_on must be YYYY-MM-DD"}), 400
    duration = data.get("duration_minutes")
    if duration is not None:
        try:
            duration = int(duration)
            if duration < 0:
                raise ValueError
        except (TypeError, ValueError):
            return jsonify({"error": "duration_minutes must be a non-negative integer"}), 400
    session = GameSession(
        title=title[:200],
        platform=platform,
        played_on=played_on,
        duration_minutes=duration,
        notes=(data.get("notes") or "").strip() or None,
        user_id=effective_user_id(),
    )
    db.session.add(session)
    db.session.commit()
    return jsonify(session.to_dict()), 201


@life_bp.delete("/gaming/<int:session_id>")
def gaming_delete(session_id):
    session = get_owned(GameSession, session_id)
    if session is None:
        return jsonify({"error": "not found"}), 404
    db.session.delete(session)
    db.session.commit()
    return jsonify({"deleted": session_id})


@life_bp.get("/gaming/recent")
def gaming_recent():
    """Normalized recent-games feed for the Unity apartment game.

    One entry per game title: most recent play date, total logged minutes,
    platform of the latest session. The game consumes this and never needs
    to know where entries came from (today: all manual).
    """
    uid = effective_user_id()
    rows = (
        db.session.query(
            GameSession.title,
            func.max(GameSession.played_on).label("last_played"),
            func.coalesce(func.sum(GameSession.duration_minutes), 0).label("total_minutes"),
            func.count(GameSession.id).label("session_count"),
        )
        .filter(GameSession.user_id == uid)
        .group_by(GameSession.title)
        .order_by(func.max(GameSession.played_on).desc())
        .limit(20)
        .all()
    )
    out = []
    for title, last_played, total_minutes, session_count in rows:
        latest = (
            GameSession.query.filter(
                GameSession.user_id == uid, GameSession.title == title
            )
            .order_by(GameSession.played_on.desc(), GameSession.id.desc())
            .first()
        )
        out.append(
            {
                "title": title,
                "platform": latest.platform,
                "last_played": last_played.isoformat(),
                "total_minutes": int(total_minutes),
                "session_count": session_count,
            }
        )
    return jsonify(out)


# ---------------------------------------------------------------------------
# Diary
# ---------------------------------------------------------------------------

@life_bp.get("/diary/<day>")
def diary_get(day):
    """Fetch the diary entry for a YYYY-MM-DD date (200 with null if none)."""
    day = _parse_date(day)
    if day is None:
        return jsonify({"error": "date must be YYYY-MM-DD"}), 400
    entry = DiaryEntry.query.filter(
        DiaryEntry.user_id == effective_user_id(), DiaryEntry.date == day
    ).first()
    return jsonify(entry.to_dict() if entry else None)


@life_bp.put("/diary/<day>")
def diary_upsert(day):
    """Create or replace the diary entry for a date. Empty text deletes it."""
    day = _parse_date(day)
    if day is None:
        return jsonify({"error": "date must be YYYY-MM-DD"}), 400
    data = request.get_json(force=True, silent=True) or {}
    text = (data.get("text") or "").strip()
    entry = DiaryEntry.query.filter(
        DiaryEntry.user_id == effective_user_id(), DiaryEntry.date == day
    ).first()
    if not text:
        if entry:
            db.session.delete(entry)
            db.session.commit()
        return jsonify(None)
    if entry:
        entry.text = text
        entry.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    else:
        entry = DiaryEntry(
            date=day, text=text, updated_at=datetime.now(timezone.utc).replace(tzinfo=None),
            user_id=effective_user_id(),
        )
        db.session.add(entry)
    db.session.commit()
    return jsonify(entry.to_dict())


@life_bp.get("/diary/calendar")
def diary_calendar():
    """Month view: {"YYYY-MM-DD": true} for days that have an entry."""
    (bounds, err) = _month_range()
    if err:
        return err
    first, last = bounds
    days = (
        db.session.query(DiaryEntry.date)
        .filter(
            DiaryEntry.user_id == effective_user_id(),
            DiaryEntry.date >= first,
            DiaryEntry.date <= last,
        )
        .all()
    )
    return jsonify({d.isoformat(): True for (d,) in days})


# ---------------------------------------------------------------------------
# Meals on the calendar (display-only; /food owns the real CRUD)
# ---------------------------------------------------------------------------

@life_bp.get("/meals/calendar")
def meals_calendar():
    """Month view: per-day meal counts and calorie totals (no photo URLs)."""
    (bounds, err) = _month_range()
    if err:
        return err
    first, last = bounds
    rows = (
        db.session.query(
            func.date(MealLog.logged_at).label("day"),
            func.count(MealLog.id).label("count"),
            func.coalesce(func.sum(MealLog.calories), 0).label("calories"),
        )
        .filter(
            MealLog.user_id == effective_user_id(),
            meal_logged_between(first, last),
        )
        .group_by(func.date(MealLog.logged_at))
        .all()
    )
    out = {}
    for day, count, calories in rows:
        day_iso = day.isoformat() if isinstance(day, date) else str(day)
        out[day_iso] = {
            "kind": "meal",
            "meal_count": count,
            "calories": round(float(calories)),
        }
    return jsonify(out)
