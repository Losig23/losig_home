"""Daily bodyweight tracking: upsert, stats math, chart page."""
from datetime import date, timedelta


def _seed_weights(client, start, days, step=0.5, base=190.0):
    for i in range(days):
        day = (start + timedelta(days=i)).isoformat()
        resp = client.post(
            "/api/bodyweight",
            json={"date": day, "weight_lb": base - step * i},
        )
        assert resp.status_code == 200


def test_upsert_same_date_updates(client):
    r1 = client.post(
        "/api/bodyweight",
        json={"date": "2026-09-20", "weight_lb": 185.2, "note": "morning"},
    )
    assert r1.status_code == 200
    r2 = client.post(
        "/api/bodyweight", json={"date": "2026-09-20", "weight_lb": 184.9}
    )
    assert r2.status_code == 200

    logs = client.get("/api/bodyweight").get_json()
    assert len(logs) == 1
    assert logs[0]["weight_lb"] == 184.9
    # note from the first post is preserved when the update omits it
    assert logs[0]["note"] == "morning"


def test_list_date_range(client):
    _seed_weights(client, date(2026, 9, 1), 10)
    logs = client.get(
        "/api/bodyweight?from=2026-09-03&to=2026-09-05"
    ).get_json()
    assert [l["date"] for l in logs] == [
        "2026-09-03",
        "2026-09-04",
        "2026-09-05",
    ]


def test_stats_math(client):
    # 40 days, declining exactly 0.5 lb/day from 190.0 on 2026-08-15.
    _seed_weights(client, date(2026, 8, 15), 40)
    stats = client.get("/api/bodyweight/stats").get_json()

    assert stats["latest"]["weight_lb"] == 170.5  # 190 - 0.5*39
    assert stats["latest"]["date"] == "2026-09-23"
    assert stats["avg_7_day"] == 172.0  # mean of the last 7 entries
    assert stats["delta_30_day"] == -15.0  # 170.5 - 185.5 (entry at -30d)
    assert stats["trend"] == "down"
    assert stats["log_count"] == 40


def test_stats_flat_trend(client):
    _seed_weights(client, date(2026, 9, 1), 14, step=0.0, base=180.0)
    stats = client.get("/api/bodyweight/stats").get_json()
    assert stats["trend"] == "flat"
    assert stats["avg_7_day"] == 180.0


def test_stats_insufficient_data(client):
    _seed_weights(client, date(2026, 9, 20), 5)
    stats = client.get("/api/bodyweight/stats").get_json()
    assert stats["log_count"] == 5
    assert stats["trend"] is None  # need 14 entries for a trend
    assert stats["delta_30_day"] is None  # need a log from ~30 days back


def test_stats_empty(client):
    stats = client.get("/api/bodyweight/stats").get_json()
    assert stats == {
        "latest": None,
        "avg_7_day": None,
        "delta_30_day": None,
        "trend": None,
        "log_count": 0,
    }


def test_chart_page_has_svg(client):
    _seed_weights(client, date(2026, 9, 1), 10)
    resp = client.get("/bodyweight")
    assert resp.status_code == 200
    html = resp.get_data(as_text=True)
    assert "<svg" in html
    assert "7-day avg" in html
    assert "2026-09-01" in html  # recent-entries table


def test_chart_page_empty_state(client):
    resp = client.get("/bodyweight")
    assert resp.status_code == 200
    assert "No weigh-ins yet" in resp.get_data(as_text=True)


def test_weight_validation(client):
    assert client.post("/api/bodyweight", json={}).status_code == 400
    assert (
        client.post("/api/bodyweight", json={"weight_lb": -5}).status_code
        == 400
    )
    assert (
        client.post("/api/bodyweight", json={"weight_lb": "heavy"}).status_code
        == 400
    )
    assert (
        client.post(
            "/api/bodyweight",
            json={"date": "not-a-date", "weight_lb": 180},
        ).status_code
        == 400
    )
