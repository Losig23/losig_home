"""Life log: gaming sessions, diary entries, calendar feeds, /api/gaming/recent."""
from datetime import date

from app import db
from app.models import DiaryEntry, GameSession, MealLog, User


def _log_game(client, title="Elden Ring", platform="PS5", day=None, minutes=90):
    payload = {
        "title": title,
        "platform": platform,
        "played_on": (day or date.today()).isoformat(),
    }
    if minutes is not None:
        payload["duration_minutes"] = minutes
    resp = client.post("/api/gaming", json=payload)
    assert resp.status_code == 201, resp.get_data(as_text=True)
    return resp.get_json()


# ---- gaming CRUD ----

def test_gaming_create_and_list(client):
    entry = _log_game(client)
    assert entry["title"] == "Elden Ring"
    assert entry["platform"] == "PS5"
    assert entry["duration_minutes"] == 90

    data = client.get("/api/gaming").get_json()
    assert len(data) == 1
    assert data[0]["title"] == "Elden Ring"


def test_gaming_requires_title(client):
    resp = client.post("/api/gaming", json={"title": "  "})
    assert resp.status_code == 400


def test_gaming_rejects_bad_platform(client):
    resp = client.post(
        "/api/gaming",
        json={"title": "X", "platform": "Atari", "played_on": date.today().isoformat()},
    )
    assert resp.status_code == 400


def test_gaming_rejects_bad_date(client):
    resp = client.post(
        "/api/gaming", json={"title": "X", "played_on": "not-a-date"}
    )
    assert resp.status_code == 400


def test_gaming_rejects_negative_minutes(client):
    resp = client.post(
        "/api/gaming",
        json={"title": "X", "played_on": date.today().isoformat(),
              "duration_minutes": -5},
    )
    assert resp.status_code == 400


def test_gaming_delete(client):
    entry = _log_game(client)
    resp = client.delete(f"/api/gaming/{entry['id']}")
    assert resp.status_code == 200
    assert client.get("/api/gaming").get_json() == []


def test_gaming_delete_missing(client):
    assert client.delete("/api/gaming/9999").status_code == 404


# ---- /api/gaming/recent (the Unity feed) ----

def test_gaming_recent_aggregates_by_title(client):
    today = date.today().isoformat()
    _log_game(client, title="Elden Ring", minutes=90, day=date.today())
    _log_game(client, title="Elden Ring", minutes=60, day=date.today())
    _log_game(client, title="Stardew Valley", platform="PC", minutes=30,
              day=date.today())

    data = client.get("/api/gaming/recent").get_json()
    assert len(data) == 2
    ring = next(g for g in data if g["title"] == "Elden Ring")
    assert ring["total_minutes"] == 150
    assert ring["session_count"] == 2
    assert ring["platform"] == "PS5"
    assert ring["last_played"] == today


def test_gaming_recent_empty(client):
    assert client.get("/api/gaming/recent").get_json() == []


# ---- gaming on the calendar ----

def test_gaming_calendar_buckets_by_month(client):
    today = date.today()
    _log_game(client, day=today)
    data = client.get(
        f"/api/gaming/calendar?year={today.year}&month={today.month}"
    ).get_json()
    entries = data[today.isoformat()]
    assert len(entries) == 1
    assert entries[0]["kind"] == "gaming"
    assert entries[0]["title"] == "Elden Ring"


def test_gaming_calendar_bad_month(client):
    assert client.get("/api/gaming/calendar?year=2026&month=13").status_code == 400


# ---- diary ----

def test_diary_upsert_get_roundtrip(client):
    day = date.today().isoformat()
    assert client.get(f"/api/diary/{day}").get_json() is None

    resp = client.put(f"/api/diary/{day}", json={"text": "Shipped the calendar."})
    assert resp.status_code == 200
    assert resp.get_json()["text"] == "Shipped the calendar."

    # upsert replaces
    client.put(f"/api/diary/{day}", json={"text": "Second draft."})
    assert client.get(f"/api/diary/{day}").get_json()["text"] == "Second draft."

    # empty text clears
    client.put(f"/api/diary/{day}", json={"text": "   "})
    assert client.get(f"/api/diary/{day}").get_json() is None


def test_diary_rejects_bad_date(client):
    assert client.put("/api/diary/nope", json={"text": "x"}).status_code == 400
    assert client.get("/api/diary/nope").status_code == 400


def test_diary_calendar_marks_days(client):
    day = date.today()
    client.put(f"/api/diary/{day.isoformat()}", json={"text": "hi"})
    data = client.get(
        f"/api/diary/calendar?year={day.year}&month={day.month}"
    ).get_json()
    assert data[day.isoformat()] is True


def test_diary_never_in_public_week(app, anon_client):
    with app.app_context():
        user = User(username="d")
        user.set_password("pw")
        db.session.add(user)
        db.session.commit()
        db.session.add(DiaryEntry(
            user_id=user.id, date=date.today(), text="deeply personal"))
        db.session.commit()
    import json
    assert "deeply personal" not in json.dumps(
        anon_client.get("/api/public/week").get_json())
    assert "deeply personal" not in anon_client.get("/").get_data(as_text=True)


# ---- meals on the calendar ----

def test_meals_calendar_summarizes(app, client):
    with app.app_context():
        user = User.query.filter_by(username="test").first()
        db.session.add(MealLog(
            user_id=user.id, description="oats", calories=300,
            logged_at=date.today()))
        db.session.add(MealLog(
            user_id=user.id, description="eggs", calories=200,
            logged_at=date.today()))
        db.session.commit()
    today = date.today()
    data = client.get(
        f"/api/meals/calendar?year={today.year}&month={today.month}"
    ).get_json()
    day = data[today.isoformat()]
    assert day["kind"] == "meal"
    assert day["meal_count"] == 2
    assert day["calories"] == 500
    assert "photo" not in str(day).lower()


# ---- owner isolation ----

def test_users_cannot_see_each_others_games(app, client):
    with app.app_context():
        other = User(username="other")
        other.set_password("pw")
        db.session.add(other)
        db.session.commit()
        db.session.add(GameSession(
            user_id=other.id, title="Secret Game", platform="PS5",
            played_on=date.today()))
        db.session.add(DiaryEntry(
            user_id=other.id, date=date.today(), text="not yours"))
        db.session.commit()
        other_game_id = GameSession.query.filter_by(
            title="Secret Game").first().id

    titles = [g["title"] for g in client.get("/api/gaming").get_json()]
    assert "Secret Game" not in titles
    assert client.get(
        f"/api/diary/{date.today().isoformat()}").get_json() is None
    assert client.delete(f"/api/gaming/{other_game_id}").status_code == 404


# ---- anonymous access ----

def test_life_endpoints_require_login(anon_client):
    day = date.today().isoformat()
    assert anon_client.get("/api/gaming").status_code == 401
    assert anon_client.post("/api/gaming", json={}).status_code == 401
    assert anon_client.delete("/api/gaming/1").status_code == 401
    assert anon_client.get("/api/gaming/recent").status_code == 401
    assert anon_client.get("/api/gaming/calendar").status_code == 401
    assert anon_client.get(f"/api/diary/{day}").status_code == 401
    assert anon_client.put(f"/api/diary/{day}", json={}).status_code == 401
    assert anon_client.get("/api/diary/calendar").status_code == 401
    assert anon_client.get("/api/meals/calendar").status_code == 401
    assert anon_client.get("/gaming").status_code == 302
    assert anon_client.get("/diary").status_code == 302


# ---- pages render ----

def test_gaming_and_diary_pages_render(client):
    assert b"Gaming Log" in client.get("/gaming").data
    assert b"Diary" in client.get("/diary").data
    assert b"Gaming" in client.get("/calendar").data  # nav present
