"""Travel per-set logging + rest timer + analyzer verdicts."""
from datetime import date


def _day(client, day, pushups=None, situps=None):
    resp = client.post(
        "/api/travel",
        json={"date": day.isoformat(), "pushups": pushups, "situps": situps},
    )
    assert resp.status_code == 201, resp.get_json()
    return resp.get_json()["id"]


def _set(client, session_id, movement, reps, rest=None, set_number=None):
    body = {"movement": movement, "reps": reps}
    if rest is not None:
        body["rest_seconds"] = rest
    if set_number is not None:
        body["set_number"] = set_number
    resp = client.post(f"/api/travel/{session_id}/sets", json=body)
    assert resp.status_code == 201, resp.get_json()
    return resp.get_json()


def _analysis(client, movement):
    body = client.get("/api/travel/analysis").get_json()
    by_mv = {a["movement"]: a for a in body}
    return by_mv[movement]


def test_set_crud_and_numbering(client):
    sid = _day(client, date(2026, 9, 1))
    s1 = _set(client, sid, "pushup", 20, rest=60)
    assert s1["set_number"] == 1
    assert s1["movement"] == "pushup"
    s2 = _set(client, sid, "pushup", 18)
    assert s2["set_number"] == 2
    # numbering is per movement: first sit-up is #1, not #3
    s3 = _set(client, sid, "situp", 15)
    assert s3["set_number"] == 1
    # explicit set_number is respected
    s4 = _set(client, sid, "pushup", 16, set_number=9)
    assert s4["set_number"] == 9

    # PATCH
    patched = client.patch(
        f"/api/travel/sets/{s1['id']}", json={"reps": 22, "rest_seconds": 75}
    ).get_json()
    assert patched["reps"] == 22
    assert patched["rest_seconds"] == 75

    # DELETE
    assert (
        client.delete(f"/api/travel/sets/{s4['id']}").get_json()
        == {"deleted": s4["id"]}
    )
    assert client.delete("/api/travel/sets/99999").status_code == 404

    # 404s
    assert client.post("/api/travel/99999/sets",
                       json={"movement": "pushup", "reps": 5}).status_code == 404
    assert client.patch("/api/travel/sets/99999",
                        json={"reps": 5}).status_code == 404


def test_set_validation(client):
    sid = _day(client, date(2026, 9, 1))
    assert client.post(
        f"/api/travel/{sid}/sets", json={"movement": "burpee", "reps": 5}
    ).status_code == 400
    assert client.post(
        f"/api/travel/{sid}/sets", json={"movement": "pushup"}
    ).status_code == 400  # reps required
    assert client.post(
        f"/api/travel/{sid}/sets", json={"movement": "pushup", "reps": -1}
    ).status_code == 400
    assert client.post(
        f"/api/travel/{sid}/sets",
        json={"movement": "pushup", "reps": 5, "rest_seconds": -10},
    ).status_code == 400
    assert client.post(
        f"/api/travel/{sid}/sets",
        json={"movement": "pushup", "reps": "many"},
    ).status_code == 400

    sid2 = _day(client, date(2026, 9, 2))
    s = _set(client, sid2, "situp", 10)
    assert client.patch(
        f"/api/travel/sets/{s['id']}", json={"movement": "burpee"}
    ).status_code == 400
    assert client.patch(
        f"/api/travel/sets/{s['id']}", json={"rest_seconds": -5}
    ).status_code == 400


def test_session_detail_grouping(client):
    sid = _day(client, date(2026, 9, 1))
    _set(client, sid, "pushup", 20, rest=60)
    _set(client, sid, "pushup", 18)
    _set(client, sid, "situp", 15, rest=45)

    data = client.get(f"/api/travel/{sid}").get_json()
    assert data["date"] == "2026-09-01"
    assert len(data["sets_by_movement"]["pushup"]) == 2
    assert len(data["sets_by_movement"]["situp"]) == 1
    assert data["sets_by_movement"]["pushup"][0]["rest_seconds"] == 60
    assert data["sets_by_movement"]["pushup"][1]["rest_seconds"] is None
    assert client.get("/api/travel/99999").status_code == 404


def test_analysis_progressing_regressing_plateau(client):
    # push-ups rising, sit-ups falling, over 3 days (per-set rows)
    d1 = _day(client, date(2026, 9, 1))
    _set(client, d1, "pushup", 20)
    _set(client, d1, "pushup", 20)  # day total 40
    _set(client, d1, "situp", 30)
    _set(client, d1, "situp", 20)  # day total 50

    d2 = _day(client, date(2026, 9, 2))
    _set(client, d2, "pushup", 45)  # 45
    _set(client, d2, "situp", 45)  # 45

    d3 = _day(client, date(2026, 9, 3))
    _set(client, d3, "pushup", 50)  # 50
    _set(client, d3, "situp", 40)  # 40

    pushup = _analysis(client, "pushup")
    assert pushup["verdict"] == "progressing"
    assert pushup["days_used"] == 3
    assert pushup["first_day_total"] == 40
    assert pushup["latest_day_total"] == 50
    assert pushup["last_date"] == "2026-09-03"
    assert pushup["slope_reps_per_day"] == 5.0

    situp = _analysis(client, "situp")
    assert situp["verdict"] == "regressing"
    assert situp["slope_reps_per_day"] == -5.0


def test_analysis_plateau(client):
    d1 = _day(client, date(2026, 9, 1), pushups=40)  # aggregate fallback
    assert _analysis(client, "pushup")["verdict"] == "insufficient_data"
    _day(client, date(2026, 9, 2), pushups=40)
    _day(client, date(2026, 9, 3), pushups=40)
    a = _analysis(client, "pushup")
    assert a["verdict"] == "plateau"
    assert a["slope_reps_per_day"] == 0.0
    assert a["days_used"] == 3


def test_analysis_insufficient_and_empty(client):
    assert _analysis(client, "pushup")["verdict"] == "insufficient_data"
    assert _analysis(client, "pushup")["days_used"] == 0
    _day(client, date(2026, 9, 1), pushups=40, situps=20)
    _day(client, date(2026, 9, 2), pushups=50, situps=25)
    assert _analysis(client, "pushup")["verdict"] == "insufficient_data"
    assert _analysis(client, "pushup")["days_used"] == 2


def test_analysis_aggregate_days_still_count(client):
    # days logged before the per-set feature (aggregates only) feed the
    # analyzer — no per-set rows anywhere
    _day(client, date(2026, 9, 1), pushups=30, situps=20)
    _day(client, date(2026, 9, 2), pushups=40, situps=20)
    _day(client, date(2026, 9, 3), pushups=50, situps=20)
    pushup = _analysis(client, "pushup")
    assert pushup["verdict"] == "progressing"
    assert pushup["latest_day_total"] == 50
    situp = _analysis(client, "situp")
    assert situp["verdict"] == "plateau"


def test_analysis_per_set_takes_precedence(client):
    # same day has both an aggregate (50) and per-set rows (20+20): the
    # per-set sum (40) wins for that movement on that day
    sid = _day(client, date(2026, 9, 1), pushups=50, situps=10)
    _set(client, sid, "pushup", 20)
    _set(client, sid, "pushup", 20)
    _day(client, date(2026, 9, 2), pushups=40, situps=10)
    _day(client, date(2026, 9, 3), pushups=40, situps=10)
    pushup = _analysis(client, "pushup")
    assert pushup["first_day_total"] == 40  # per-set sum, not 50
    # sit-ups had no per-set rows: aggregates still apply
    assert _analysis(client, "situp")["verdict"] == "plateau"


def test_rest_insight_quartile_gap(client):
    # high-rep sets rest longer: insight should fire
    sid = _day(client, date(2026, 9, 1))
    _set(client, sid, "pushup", 10, rest=30)
    _set(client, sid, "pushup", 12, rest=30)
    _set(client, sid, "pushup", 14, rest=90)
    _set(client, sid, "pushup", 16, rest=90)
    a = _analysis(client, "pushup")
    assert a["rest"]["avg_rest_seconds"] == 60.0
    assert a["rest"]["sets_with_rest"] == 4
    assert a["rest"]["insight"] is not None
    assert "longer" in a["rest"]["insight"]

    # short rests on high-rep sets -> "shorter"
    sid2 = _day(client, date(2026, 9, 2))
    _set(client, sid2, "situp", 10, rest=90)
    _set(client, sid2, "situp", 12, rest=90)
    _set(client, sid2, "situp", 14, rest=30)
    _set(client, sid2, "situp", 16, rest=30)
    assert "shorter" in _analysis(client, "situp")["rest"]["insight"]


def test_rest_insight_thresholds(client):
    # fewer than 4 sets with rests -> no insight
    sid = _day(client, date(2026, 9, 1))
    _set(client, sid, "pushup", 10, rest=30)
    _set(client, sid, "pushup", 16, rest=120)
    _set(client, sid, "pushup", 12)  # no rest recorded
    a = _analysis(client, "pushup")
    assert a["rest"]["insight"] is None

    # 4+ sets but < 15s quartile gap -> no insight
    sid2 = _day(client, date(2026, 9, 2))
    _set(client, sid2, "situp", 10, rest=60)
    _set(client, sid2, "situp", 12, rest=60)
    _set(client, sid2, "situp", 14, rest=65)
    _set(client, sid2, "situp", 16, rest=65)
    assert _analysis(client, "situp")["rest"]["insight"] is None
    assert _analysis(client, "situp")["rest"]["avg_rest_seconds"] == 62.5


def test_travel_page_has_verdict_markup(client):
    sid = _day(client, date(2026, 9, 1))
    _set(client, sid, "pushup", 20)
    sid2 = _day(client, date(2026, 9, 2))
    _set(client, sid2, "pushup", 25)
    sid3 = _day(client, date(2026, 9, 3))
    _set(client, sid3, "pushup", 30)

    html = client.get("/travel").data.decode()
    assert "<svg" in html
    assert "badge progressing" in html
    assert "pushup" in html
    assert "badge insufficient_data" in html  # sit-ups have no days


def test_travel_page_empty_state(client):
    html = client.get("/travel").data.decode()
    assert "<svg" not in html or "No travel workouts yet" in html
    assert "badge insufficient_data" in html
