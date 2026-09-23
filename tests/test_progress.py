"""Progressive overload: Epley math, series aggregation, PR detection, pages."""
import pytest

from app import db, ensure_schema
from app.lifting import est_1rm
from app.models import Exercise, PlannedSet, RoutineDay, SetLog


def _exercise_id(client, app, day_number, name):
    with app.app_context():
        return (
            Exercise.query.join(RoutineDay)
            .filter(RoutineDay.day_number == day_number, Exercise.name == name)
            .first()
            .id
        )


def _log_session(client, app, day_number, exercise_id, iso_date, weights_reps):
    """Start a session and check off the exercise's first N planned sets
    with (weight_lb, reps) pairs. Returns (session_id, patch_response_json)."""
    resp = client.post(
        "/api/sessions", json={"day_number": day_number, "date": iso_date}
    )
    assert resp.status_code == 201
    session_id = resp.get_json()["id"]
    with app.app_context():
        ps_ids = [
            ps.id
            for ps in PlannedSet.query.filter_by(exercise_id=exercise_id)
            .order_by(PlannedSet.set_number)
            .all()
        ]
    checks = [
        {
            "planned_set_id": ps_ids[i],
            "checked": True,
            "actual_weight_lb": w,
            "actual_reps": r,
        }
        for i, (w, r) in enumerate(weights_reps)
    ]
    resp = client.patch(
        f"/api/sessions/{session_id}/check", json={"checks": checks}
    )
    assert resp.status_code == 200
    return session_id, resp.get_json()


def test_epley_math():
    assert est_1rm(100, 6) == 120.0
    assert est_1rm(200, 1) == 206.7
    assert est_1rm(45, None) == 45.0  # no reps -> the weight itself
    assert est_1rm(None, 6) is None


def test_progress_series_ordering_and_summary(client, app):
    ex_id = _exercise_id(client, app, 1, "Chest press")

    _log_session(client, app, 1, ex_id, "2026-09-01", [(45, 8), (45, 6)])
    _log_session(client, app, 1, ex_id, "2026-09-08", [(50, 8), (50, 5)])
    _log_session(client, app, 1, ex_id, "2026-09-15", [(50, 6), (55, 4)])

    resp = client.get(f"/api/exercises/{ex_id}/progress")
    assert resp.status_code == 200
    body = resp.get_json()

    series = body["series"]
    assert len(series) == 3
    assert [p["date"] for p in series] == [
        "2026-09-01",
        "2026-09-08",
        "2026-09-15",
    ]

    # Session 1: best set 45x8 -> 45*(1+8/30)=57.0; volume = 45*8+45*6=630
    assert series[0]["est_1rm_lb"] == 57.0
    assert series[0]["top_set"] == {"weight_lb": 45, "reps": 8}
    assert series[0]["top_weight_lb"] == 45
    assert series[0]["volume_lb"] == 630

    # Session 3: best set 55x4 -> 55*(1+4/30)=62.3
    assert series[2]["est_1rm_lb"] == 62.3

    summary = body["summary"]
    assert summary["session_count"] == 3
    assert summary["first_est_1rm_lb"] == 57.0
    # Best set overall: 50x8 on 2026-09-08 -> 63.3 (beats 55x4's 62.3).
    assert summary["current_est_1rm_lb"] == 62.3
    assert summary["delta_lb"] == 5.3
    assert summary["all_time_pr"] == {
        "weight_lb": 50,
        "reps": 8,
        "date": "2026-09-08",
    }
    # PRs set on session 1 (first set ever) and session 2 (50x8 -> 63.3 beats 57.0)
    assert body["pr_dates"] == ["2026-09-01", "2026-09-08"]


def test_pr_detection_first_stronger_weaker(client, app):
    ex_id = _exercise_id(client, app, 1, "Chest press")

    # First-ever logged set is a PR.
    _, patch1 = _log_session(client, app, 1, ex_id, "2026-09-01", [(45, 8)])
    assert patch1["sets"][0]["is_pr"] is True

    # Weaker set later is not a PR (45x6 -> 54.0 < 57.0).
    _, patch2 = _log_session(client, app, 1, ex_id, "2026-09-08", [(45, 6)])
    assert patch2["sets"][0]["is_pr"] is False

    # Stronger set is a PR (50x8 -> 63.3 > 57.0).
    _, patch3 = _log_session(client, app, 1, ex_id, "2026-09-15", [(50, 8)])
    assert patch3["sets"][0]["is_pr"] is True

    # Flags are persisted on the set_log rows.
    with app.app_context():
        flags = [
            log.is_pr
            for log in SetLog.query.join(PlannedSet)
            .filter(PlannedSet.exercise_id == ex_id)
            .order_by(SetLog.id)
            .all()
        ]
    assert flags == [True, False, True]


def test_pr_within_same_request_uses_earlier_sets(client, app):
    ex_id = _exercise_id(client, app, 1, "Chest press")
    _, patch = _log_session(
        client, app, 1, ex_id, "2026-09-01", [(45, 8), (50, 5)]
    )
    # 45x8 -> 57.0 is a PR (first ever); 50x5 -> 58.3 beats it -> also a PR.
    assert [s["is_pr"] for s in patch["sets"]] == [True, True]


def test_empty_exercise_progress(client, app):
    ex_id = _exercise_id(client, app, 2, "Pull-ups")  # nothing logged
    resp = client.get(f"/api/exercises/{ex_id}/progress")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["series"] == []
    assert body["pr_dates"] == []
    assert body["summary"] == {
        "current_est_1rm_lb": None,
        "all_time_pr": None,
        "first_est_1rm_lb": None,
        "delta_lb": None,
        "session_count": 0,
    }


def test_progress_missing_exercise_404(client):
    assert client.get("/api/exercises/99999/progress").status_code == 404
    assert client.get("/exercises/99999/progress").status_code == 404


def test_exercise_chart_page(client, app):
    ex_id = _exercise_id(client, app, 1, "Chest press")
    _log_session(client, app, 1, ex_id, "2026-09-01", [(45, 8)])
    _log_session(client, app, 1, ex_id, "2026-09-08", [(50, 8)])

    resp = client.get(f"/exercises/{ex_id}/progress")
    assert resp.status_code == 200
    html = resp.get_data(as_text=True)
    assert "<svg" in html
    assert "Chest press" in html
    assert "★" in html  # PR star markers


def test_progress_index_page(client, app):
    ex_id = _exercise_id(client, app, 1, "Chest press")
    _log_session(client, app, 1, ex_id, "2026-09-01", [(45, 8)])
    _log_session(client, app, 1, ex_id, "2026-09-08", [(50, 8)])

    resp = client.get("/progress")
    assert resp.status_code == 200
    html = resp.get_data(as_text=True)
    assert "Day 1" in html
    assert f'href="/exercises/{ex_id}/progress"' in html
    # Latest session logged 50x8 -> Epley 63.3.
    assert "63.3 lb est 1RM" in html
    assert "<svg" in html  # sparkline for the 2-session exercise


def test_ensure_schema_is_idempotent(client, app):
    with app.app_context():
        ensure_schema()
        ensure_schema()
        cols = {c["name"] for c in db.inspect(db.engine).get_columns("set_log")}
    assert "is_pr" in cols
