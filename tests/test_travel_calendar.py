"""Travel on the calendar: month bucketing, PATCH/DELETE, export, UI."""
from datetime import date


def _log(client, day, pushups=50, situps=40):
    resp = client.post(
        "/api/travel",
        json={"date": day, "pushups": pushups, "situps": situps},
    )
    assert resp.status_code == 201
    return resp.get_json()["id"]


# ---- month endpoint ----

def test_travel_calendar_buckets_by_month(client):
    today = date.today()
    prev_month = today.month - 1 or 12
    prev_year = today.year if today.month > 1 else today.year - 1
    tid = _log(client, today.isoformat())
    other = _log(
        client, f"{prev_year}-{prev_month:02d}-15", pushups=10, situps=10
    )

    data = client.get(
        f"/api/travel/calendar?year={today.year}&month={today.month}"
    ).get_json()
    assert data[today.isoformat()][0]["id"] == tid
    assert f"{prev_year}-{prev_month:02d}-15" not in data

    data = client.get(
        f"/api/travel/calendar?year={prev_year}&month={prev_month}"
    ).get_json()
    assert data[f"{prev_year}-{prev_month:02d}-15"][0]["id"] == other


def test_travel_calendar_rejects_bad_params(client):
    assert client.get("/api/travel/calendar?year=2026&month=13").status_code == 400
    assert client.get("/api/travel/calendar?month=abc").status_code == 400


# ---- modify / delete ----

def test_patch_travel_session(client):
    tid = _log(client, date.today().isoformat())
    resp = client.patch(
        f"/api/travel/{tid}", json={"pushups": 80, "situps": 70}
    )
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["pushups"] == 80 and body["situps"] == 70

    new_date = date.today().isoformat()
    resp = client.patch(f"/api/travel/{tid}", json={"date": new_date})
    assert resp.status_code == 200
    assert resp.get_json()["date"] == new_date


def test_patch_travel_session_validates(client):
    tid = _log(client, date.today().isoformat())
    assert client.patch(f"/api/travel/{tid}", json={}).status_code == 400
    r = client.patch(f"/api/travel/{tid}", json={"date": "not-a-date"})
    assert r.status_code == 400
    r = client.patch(f"/api/travel/{tid}", json={"pushups": -5})
    assert r.status_code == 400
    assert client.patch("/api/travel/99999",
                        json={"pushups": 5}).status_code == 404


def test_delete_travel_session_cascades_sets(client):
    tid = _log(client, date.today().isoformat())
    resp = client.post(
        f"/api/travel/{tid}/sets",
        json={"movement": "pushup", "reps": 20, "set_number": 1},
    )
    assert resp.status_code == 201

    resp = client.delete(f"/api/travel/{tid}")
    assert resp.status_code == 200
    assert resp.get_json() == {"deleted": tid}
    assert client.get(f"/api/travel/{tid}").status_code == 404
    assert client.delete("/api/travel/99999").status_code == 404


# ---- export ----

def test_export_travel_session(client):
    tid = _log(client, "2026-09-25", pushups=60, situps=55)
    client.post(
        f"/api/travel/{tid}/sets",
        json={"movement": "pushup", "reps": 20, "set_number": 1,
              "rest_seconds": 60},
    )
    resp = client.get(f"/api/travel/{tid}/export")
    assert resp.status_code == 200
    assert resp.headers["Content-Type"].startswith("text/plain")
    assert "travel-2026-09-25.txt" in resp.headers["Content-Disposition"]
    body = resp.get_data(as_text=True)
    assert "60 push-ups" in body
    assert "Set 1: 20 reps, rest 60s" in body


def test_export_travel_session_404(client):
    assert client.get("/api/travel/99999/export").status_code == 404


# ---- UI ----

def test_calendar_page_loads_travel_endpoints(client):
    html = client.get("/calendar").get_data(as_text=True)
    assert "/api/travel/calendar" in html
    assert "travelCard" in html
    assert "cal-badge travel" in html


def test_anonymous_travel_api_is_401(anon_client):
    assert anon_client.get("/api/travel/calendar").status_code == 401
    assert anon_client.delete("/api/travel/1").status_code == 401
    assert anon_client.get("/api/travel/1/export").status_code == 401
