"""API behaviour: routine reads, session lifecycle, completion %, travel logging."""
from app.models import Exercise, PlannedSet, RoutineDay


def test_get_full_routine(client):
    resp = client.get("/api/routine")
    assert resp.status_code == 200
    days = resp.get_json()
    assert len(days) == 5
    day1 = days[0]
    assert day1["day_number"] == 1
    assert len(day1["exercises"]) == 7
    assert sum(len(e["sets"]) for e in day1["exercises"]) == 22


def test_get_single_day(client):
    resp = client.get("/api/routine/5")
    assert resp.status_code == 200
    day = resp.get_json()
    assert day["day_number"] == 5
    assert len(day["exercises"]) == 8


def test_get_missing_day_404(client):
    assert client.get("/api/routine/9").status_code == 404


def test_start_session_and_check_sets(client, app):
    resp = client.post("/api/sessions", json={"day_number": 1})
    assert resp.status_code == 201
    session_id = resp.get_json()["id"]

    with app.app_context():
        # grab the first 11 planned sets of day 1, in routine order
        ids = [
            s.id
            for e in Exercise.query.join(RoutineDay)
            .filter(RoutineDay.day_number == 1)
            .order_by(Exercise.position)
            for s in e.planned_sets
        ][:11]

    checks = [{"planned_set_id": i, "checked": True} for i in ids]
    resp = client.patch(f"/api/sessions/{session_id}/check", json={"checks": checks})
    assert resp.status_code == 200
    assert resp.get_json()["completed_pct"] == 50.0  # 11 of 22 sets

    resp = client.get(f"/api/sessions/{session_id}")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["completed_pct"] == 50.0
    assert len(body["set_logs"]) == 11
    assert body["routine"]["day_number"] == 1


def test_check_set_from_wrong_day_rejected(client):
    s1 = client.post("/api/sessions", json={"day_number": 1}).get_json()["id"]
    other = client.get("/api/routine/2").get_json()
    foreign_set_id = other["exercises"][0]["sets"][0]["id"]

    resp = client.patch(
        f"/api/sessions/{s1}/check",
        json={"checks": [{"planned_set_id": foreign_set_id, "checked": True}]},
    )
    assert resp.status_code == 400


def test_invalid_day_rejected(client):
    assert client.post("/api/sessions", json={"day_number": 9}).status_code == 400


def test_travel_flow(client):
    resp = client.post(
        "/api/travel",
        json={"date": "2026-09-23", "pushups": 60, "situps": 50, "notes": "hotel"},
    )
    assert resp.status_code == 201
    body = resp.get_json()
    assert body["pushups"] == 60 and body["situps"] == 50

    resp = client.get("/api/travel")
    assert resp.status_code == 200
    assert len(resp.get_json()) == 1

    # a travel-mode session for the same date completes at 100%
    s = client.post(
        "/api/sessions", json={"travel_mode": True, "date": "2026-09-23"}
    ).get_json()
    assert s["travel_mode"] is True
    got = client.get(f"/api/sessions/{s['id']}").get_json()
    assert got["completed_pct"] == 100.0


def test_travel_session_without_log_has_no_pct(client):
    s = client.post(
        "/api/sessions", json={"travel_mode": True, "date": "2026-09-24"}
    ).get_json()
    got = client.get(f"/api/sessions/{s['id']}").get_json()
    assert got["completed_pct"] is None


def test_health(client):
    assert client.get("/api/health").get_json()["status"] == "ok"
