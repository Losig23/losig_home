"""Travel workout tracking: stats math, series aggregation, chart page."""
from datetime import date


def _log(client, day, pushups, situps, notes=None):
    payload = {"date": day.isoformat(), "pushups": pushups, "situps": situps}
    if notes is not None:
        payload["notes"] = notes
    resp = client.post("/api/travel", json=payload)
    assert resp.status_code == 201


def test_stats_math(client):
    _log(client, date(2026, 9, 1), 40, 30)
    _log(client, date(2026, 9, 2), 50, 40)
    _log(client, date(2026, 9, 2), 10, 20)  # dupe date -> aggregates to 60/60
    _log(client, date(2026, 9, 3), 30, None)  # null situps -> 0
    stats = client.get("/api/travel/stats").get_json()

    assert stats["total_pushups"] == 130
    assert stats["total_situps"] == 90
    assert stats["day_count"] == 3
    assert stats["avg_pushups_per_day"] == 43.3
    assert stats["avg_situps_per_day"] == 30.0
    assert stats["best_day"] == {
        "date": "2026-09-02",
        "pushups": 60,
        "situps": 60,
    }
    assert stats["first_date"] == "2026-09-01"
    assert stats["latest_date"] == "2026-09-03"


def test_series_aggregation_and_order(client):
    # log out of order on purpose; series must come back oldest-first
    _log(client, date(2026, 9, 3), 30, 25)
    _log(client, date(2026, 9, 1), 40, 30)
    _log(client, date(2026, 9, 2), 50, None)
    _log(client, date(2026, 9, 2), 10, 20)
    series = client.get("/api/travel/series").get_json()

    assert series == [
        {"date": "2026-09-01", "pushups": 40, "situps": 30},
        {"date": "2026-09-02", "pushups": 60, "situps": 20},
        {"date": "2026-09-03", "pushups": 30, "situps": 25},
    ]


def test_stats_empty(client):
    assert client.get("/api/travel/stats").get_json() == {
        "total_pushups": 0,
        "total_situps": 0,
        "day_count": 0,
        "best_day": None,
        "avg_pushups_per_day": None,
        "avg_situps_per_day": None,
        "first_date": None,
        "latest_date": None,
    }
    assert client.get("/api/travel/series").get_json() == []


def test_best_day_tie_goes_to_earliest(client):
    _log(client, date(2026, 9, 5), 50, 50)
    _log(client, date(2026, 9, 1), 50, 50)  # same total, earlier date
    stats = client.get("/api/travel/stats").get_json()
    assert stats["best_day"]["date"] == "2026-09-01"


def test_chart_page(client):
    _log(client, date(2026, 9, 1), 40, 30)
    _log(client, date(2026, 9, 2), 50, 40)
    resp = client.get("/travel")
    assert resp.status_code == 200
    page = resp.get_data(as_text=True)
    assert "<svg" in page
    assert "push-ups" in page
    assert "sit-ups" in page
    assert "2026-09-02" in page  # history table


def test_chart_page_empty_state(client):
    resp = client.get("/travel")
    assert resp.status_code == 200
    assert "No travel workouts yet" in resp.get_data(as_text=True)


def test_log_then_stats_round_trip(client):
    # date omitted -> defaults to today
    resp = client.post("/api/travel", json={"pushups": 25, "situps": 20})
    assert resp.status_code == 201
    stats = client.get("/api/travel/stats").get_json()
    assert stats["day_count"] == 1
    assert stats["total_pushups"] == 25
    assert stats["total_situps"] == 20
    assert stats["best_day"]["pushups"] == 25
    assert stats["best_day"]["date"] == stats["latest_date"]
