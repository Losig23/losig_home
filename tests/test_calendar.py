"""Calendar view: month buckets, date filters, modify/delete/export sessions."""
from datetime import date

from app import db
from app.models import Exercise, RoutineDay, SetLog


def _start(client, day_number=1, session_date="2026-09-10", travel_mode=False):
    payload = {"date": session_date}
    if travel_mode:
        payload["travel_mode"] = True
    else:
        payload["day_number"] = day_number
    resp = client.post("/api/sessions", json=payload)
    assert resp.status_code == 201
    return resp.get_json()["id"]


def _check_some(client, app, session_id, n=3):
    with app.app_context():
        ids = [
            s.id
            for e in Exercise.query.join(RoutineDay)
            .filter(RoutineDay.day_number == 1)
            .order_by(Exercise.position)
            for s in e.planned_sets
        ][:n]
    checks = [
        {
            "planned_set_id": i,
            "checked": True,
            "actual_reps": 10,
            "actual_weight_lb": 45,
        }
        for i in ids
    ]
    resp = client.patch(
        f"/api/sessions/{session_id}/check", json={"checks": checks}
    )
    assert resp.status_code == 200


def test_calendar_month_buckets(client, app):
    s1 = _start(client, day_number=1, session_date="2026-09-10")
    s2 = _start(client, day_number=2, session_date="2026-09-15")
    _start(client, day_number=1, session_date="2026-10-01")
    _check_some(client, app, s1, n=3)

    resp = client.get("/api/sessions/calendar?year=2026&month=9")
    assert resp.status_code == 200
    data = resp.get_json()
    assert set(data) == {"2026-09-10", "2026-09-15"}

    entry = data["2026-09-10"][0]
    assert entry["id"] == s1
    assert entry["day_name"] == "Push"
    assert entry["day_number"] == 1
    assert entry["travel_mode"] is False
    assert entry["set_count"] == 3
    assert entry["checked_count"] == 3
    assert entry["completion_pct"] > 0

    assert data["2026-09-15"][0]["id"] == s2
    assert data["2026-09-15"][0]["day_name"] == "Pull"

    oct_data = client.get("/api/sessions/calendar?year=2026&month=10").get_json()
    assert set(oct_data) == {"2026-10-01"}


def test_calendar_empty_month(client):
    data = client.get("/api/sessions/calendar?year=2030&month=1").get_json()
    assert data == {}


def test_calendar_bad_input(client):
    assert client.get("/api/sessions/calendar?year=2026&month=13").status_code == 400
    assert client.get("/api/sessions/calendar?year=2026&month=abc").status_code == 400
    assert client.get("/api/sessions/calendar?year=0&month=5").status_code == 400


def test_calendar_defaults_to_current_month(client):
    sid = _start(client, session_date=date.today().isoformat())
    data = client.get("/api/sessions/calendar").get_json()
    today = date.today().isoformat()
    assert today in data
    assert any(s["id"] == sid for s in data[today])


def test_sessions_date_filters(client):
    _start(client, session_date="2026-09-10")
    _start(client, session_date="2026-09-15")
    _start(client, session_date="2026-10-01")

    one = client.get("/api/sessions?date=2026-09-10").get_json()
    assert len(one) == 1
    assert one[0]["date"] == "2026-09-10"

    ranged = client.get("/api/sessions?from=2026-09-10&to=2026-09-15").get_json()
    assert {s["date"] for s in ranged} == {"2026-09-10", "2026-09-15"}

    assert client.get("/api/sessions?date=not-a-date").status_code == 400
    assert client.get("/api/sessions?from=2026-13-01").status_code == 400

    # No filters: old behavior preserved.
    assert client.get("/api/sessions").status_code == 200


def test_delete_session_removes_set_logs(client, app):
    sid = _start(client, session_date="2026-09-10")
    _check_some(client, app, sid, n=3)

    resp = client.delete(f"/api/sessions/{sid}")
    assert resp.status_code == 200
    assert resp.get_json() == {"deleted": sid}

    assert client.get(f"/api/sessions/{sid}").status_code == 404
    with app.app_context():
        assert SetLog.query.filter_by(session_id=sid).count() == 0

    assert client.delete(f"/api/sessions/{sid}").status_code == 404
    assert client.delete("/api/sessions/99999").status_code == 404


def test_patch_session_moves_month_bucket(client):
    sid = _start(client, day_number=1, session_date="2026-09-10")

    resp = client.patch(f"/api/sessions/{sid}", json={"date": "2026-10-05"})
    assert resp.status_code == 200
    assert resp.get_json()["date"] == "2026-10-05"

    sept = client.get("/api/sessions/calendar?year=2026&month=9").get_json()
    assert "2026-09-10" not in sept
    oct_data = client.get("/api/sessions/calendar?year=2026&month=10").get_json()
    assert any(s["id"] == sid for s in oct_data["2026-10-05"])


def test_patch_session_change_day(client):
    sid = _start(client, day_number=1, session_date="2026-09-10")

    resp = client.patch(f"/api/sessions/{sid}", json={"day_number": 2})
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["day_number"] == 2
    assert body["day_name"] == "Pull"

    # Detach the routine day entirely.
    resp = client.patch(f"/api/sessions/{sid}", json={"routine_day_id": None})
    assert resp.status_code == 200
    assert resp.get_json()["day_name"] is None

    # Reattach by id.
    with client.application.app_context():
        day_id = RoutineDay.query.filter_by(day_number=3).first().id
    resp = client.patch(f"/api/sessions/{sid}", json={"routine_day_id": day_id})
    assert resp.status_code == 200
    assert resp.get_json()["day_name"] == "Legs + Core"


def test_patch_session_invalid(client):
    sid = _start(client, session_date="2026-09-10")
    assert client.patch(f"/api/sessions/{sid}", json={"date": "nope"}).status_code == 400
    assert client.patch(f"/api/sessions/{sid}", json={"day_number": 9}).status_code == 400
    assert (
        client.patch(f"/api/sessions/{sid}", json={"routine_day_id": 99999}).status_code
        == 400
    )
    assert client.patch(f"/api/sessions/{sid}", json={}).status_code == 400
    assert client.patch("/api/sessions/99999", json={"date": "2026-09-11"}).status_code == 404


def test_export_session_txt(client, app):
    sid = _start(client, day_number=1, session_date="2026-09-10")
    _check_some(client, app, sid, n=3)

    resp = client.get(f"/api/sessions/{sid}/export")
    assert resp.status_code == 200
    assert "text/plain" in resp.headers["Content-Type"]
    assert "attachment" in resp.headers["Content-Disposition"]
    assert "session-2026-09-10.txt" in resp.headers["Content-Disposition"]

    text = resp.get_data(as_text=True)
    assert "2026-09-10" in text
    assert "Push" in text
    assert "Chest press" in text
    assert "[x] Set 1: 45 lb x 10 reps" in text
    assert "Totals: 22 sets, 3 checked" in text

    assert client.get("/api/sessions/99999/export").status_code == 404


def test_export_travel_session(client):
    sid = _start(client, session_date="2026-09-10", travel_mode=True)
    client.post(
        "/api/travel",
        json={"date": "2026-09-10", "pushups": 60, "situps": 50},
    )
    resp = client.get(f"/api/sessions/{sid}/export")
    assert resp.status_code == 200
    text = resp.get_data(as_text=True)
    assert "Travel mode session" in text
    assert "60 push-ups" in text


def test_calendar_page_renders(client):
    resp = client.get("/calendar")
    assert resp.status_code == 200
    html = resp.get_data(as_text=True)
    assert "Workout Calendar" in html
    assert 'href="/calendar"' in html
    assert "/api/sessions/calendar" in html
    assert "topnav" in html
