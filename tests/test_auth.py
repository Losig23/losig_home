"""Auth: login/logout flow, protected-vs-public surface, two-user isolation."""
import io
from datetime import date, timedelta

from conftest import TEST_PASSWORD, TEST_USERNAME

from app import db
from app.models import User


def _second_client(app):
    """Separate logged-in client for user 'two'."""
    with app.app_context():
        u = User(username="two")
        u.set_password("pw2")
        db.session.add(u)
        db.session.commit()
    c = app.test_client()
    r = c.post("/login", data={"username": "two", "password": "pw2"})
    assert r.status_code == 302
    return c


# ---- login flow ----

def test_login_page_renders_form(anon_client):
    resp = anon_client.get("/login")
    assert resp.status_code == 200
    html = resp.get_data(as_text=True)
    assert "<form" in html and 'name="username"' in html


def test_wrong_password_rejected(anon_client, owner):
    resp = anon_client.post(
        "/login", data={"username": TEST_USERNAME, "password": "nope"}
    )
    assert resp.status_code == 401
    assert "Wrong username or password" in resp.get_data(as_text=True)


def test_correct_login_grants_access(anon_client, owner):
    assert anon_client.get("/api/sessions").status_code == 401
    resp = anon_client.post(
        "/login",
        data={"username": TEST_USERNAME, "password": TEST_PASSWORD},
    )
    assert resp.status_code == 302
    assert anon_client.get("/api/sessions").status_code == 200


def test_login_next_redirect_is_same_site_only(anon_client, owner):
    resp = anon_client.post(
        "/login",
        data={
            "username": TEST_USERNAME,
            "password": TEST_PASSWORD,
            "next": "//evil.example.com",
        },
    )
    assert resp.status_code == 302
    assert resp.headers["Location"] == "/"


def test_anonymous_page_redirects_to_login(anon_client):
    resp = anon_client.get("/food")
    assert resp.status_code == 302
    assert resp.headers["Location"].startswith("/login")


def test_logout_revokes_access(client):
    assert client.get("/api/sessions").status_code == 200
    resp = client.post("/logout")
    assert resp.status_code == 302
    assert client.get("/api/sessions").status_code == 401
    page = client.get("/food")
    assert page.status_code == 302
    assert page.headers["Location"].startswith("/login")


def test_public_paths_stay_open(anon_client):
    assert anon_client.get("/api").status_code == 200
    assert anon_client.get("/api/health").status_code == 200
    assert anon_client.get("/api/public/week").status_code == 200
    assert anon_client.get("/").status_code == 200
    assert anon_client.get("/static/css/app.css").status_code == 200


# ---- public week privacy ----

PNG_1X1 = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc```\x00\x00\x00"
    b"\x04\x00\x01\xf6\x178U\x00\x00\x00\x00IEND\xaeB`\x82"
)


def _seed_public_week(client):
    """One session with a weighted set, a weigh-in, and a meal with a
    photo — all within the last 7 days."""
    today = date.today().isoformat()
    resp = client.post(
        "/api/sessions", json={"date": today, "day_number": 1}
    )
    assert resp.status_code == 201
    sid = resp.get_json()["id"]
    # Free-form weighed set via the live set endpoint.
    routine = client.get("/api/routine").get_json()
    exercise_id = routine[0]["exercises"][0]["id"]
    resp = client.post(
        f"/api/sessions/{sid}/sets",
        json={"exercise_id": exercise_id, "weight_lb": 135, "reps": 8},
    )
    assert resp.status_code == 201

    resp = client.post(
        "/api/bodyweight", json={"date": today, "weight_lb": 170.5}
    )
    assert resp.status_code in (200, 201)

    resp = client.post(
        "/api/meals",
        data={
            "description": "chicken and rice",
            "photo": (io.BytesIO(PNG_1X1), "meal.png"),
            "calories": "600",
            "protein_g": "40",
            "carbs_g": "60",
            "fat_g": "15",
        },
        content_type="multipart/form-data",
    )
    assert resp.status_code == 201


def test_public_week_exposes_last_seven_days_no_photos(client, anon_client):
    _seed_public_week(client)

    data = anon_client.get("/api/public/week").get_json()
    today = date.today()
    assert data["start_date"] == (today - timedelta(days=6)).isoformat()
    assert data["end_date"] == today.isoformat()
    assert data["session_count"] == 1

    session = data["sessions"][0]
    weighed = [e for e in session["exercises"] if e["top_weight_lb"]]
    assert weighed and weighed[0]["top_weight_lb"] == 135

    assert len(data["bodyweight"]) == 1
    assert data["bodyweight"][0]["weight_lb"] == 170.5

    assert len(data["meals"]) == 1
    meal = data["meals"][0]
    assert meal["description"] == "chicken and rice"
    assert meal["calories"] == 600 and meal["protein_g"] == 40
    # Photo URLs/paths must never leak through the public surface.
    assert "photo_url" not in meal and "photo_path" not in meal
    assert "meal.png" not in str(meal)

    # Logged-out home page renders the same whitelisted view.
    html = anon_client.get("/").get_data(as_text=True)
    assert "170.5 lb" in html
    assert "chicken and rice" in html
    assert "meal.png" not in html


def test_public_week_excludes_older_data(client, anon_client):
    old = (date.today() - timedelta(days=30)).isoformat()
    resp = client.post(
        "/api/sessions", json={"date": old, "day_number": 2}
    )
    assert resp.status_code == 201
    resp = client.post(
        "/api/bodyweight", json={"date": old, "weight_lb": 175.0}
    )
    assert resp.status_code in (200, 201)

    data = anon_client.get("/api/public/week").get_json()
    assert data["session_count"] == 0
    assert data["bodyweight"] == []


# ---- two-user isolation ----

def test_users_cannot_see_each_others_sessions(client, app):
    resp = client.post(
        "/api/sessions", json={"date": date.today().isoformat(),
                               "day_number": 1}
    )
    sid = resp.get_json()["id"]

    other = _second_client(app)
    assert other.get("/api/sessions").get_json() == []
    assert other.get(f"/api/sessions/{sid}").status_code == 404
    assert other.patch(f"/api/sessions/{sid}",
                       json={"date": "2026-01-01"}).status_code == 404
    assert other.delete(f"/api/sessions/{sid}").status_code == 404
    # Owner's session still intact.
    assert client.get(f"/api/sessions/{sid}").status_code == 200


def test_users_cannot_touch_each_others_travel(app, client):
    resp = client.post(
        "/api/travel", json={"date": date.today().isoformat(),
                             "pushups": 50}
    )
    assert resp.status_code == 201
    tid = resp.get_json()["id"]

    other = _second_client(app)
    assert other.get(f"/api/travel/{tid}").status_code == 404
    assert other.delete(f"/api/travel/{tid}").status_code == 404
    assert client.get(f"/api/travel/{tid}").status_code == 200


def test_cli_list_users_never_prints_hashes(app, owner, capsys):
    runner = app.test_cli_runner()
    res = runner.invoke(args=["list-users"])
    assert res.exit_code == 0
    assert TEST_USERNAME in res.output
    assert "pbkdf2" not in res.output
    assert "scrypt" not in res.output
