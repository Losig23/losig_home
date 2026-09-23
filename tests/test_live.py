"""Live set logging, rest timer data, and the progress analyzer."""
from sqlalchemy import text

from app import db, ensure_schema
from app.lifting import est_1rm
from app.models import Exercise, RoutineDay
from app.routes.analysis import analyze_exercise


def _exercise_id(app, day_number, name):
    with app.app_context():
        return (
            Exercise.query.join(RoutineDay)
            .filter(RoutineDay.day_number == day_number, Exercise.name == name)
            .first()
            .id
        )


def _freeform_session(client, day_number, exercise_id, iso_date, sets):
    """Start a session and log free-form sets: [(weight, reps, rest), ...]."""
    resp = client.post(
        "/api/sessions", json={"day_number": day_number, "date": iso_date}
    )
    assert resp.status_code == 201
    session_id = resp.get_json()["id"]
    out = []
    for weight, reps, rest in sets:
        resp = client.post(
            f"/api/sessions/{session_id}/sets",
            json={
                "exercise_id": exercise_id,
                "weight_lb": weight,
                "reps": reps,
                "rest_seconds": rest,
            },
        )
        assert resp.status_code == 201, resp.get_json()
        out.append(resp.get_json())
    return session_id, out


def test_ensure_schema_idempotent_and_nullable(app):
    with app.app_context():
        ensure_schema()  # second run on the fresh schema: no-op
        ensure_schema()
        cols = {
            row[1]: row
            for row in db.session.execute(text("PRAGMA table_info(set_log)"))
        }
        for col in ("rest_seconds", "exercise_id", "set_number", "is_pr"):
            assert col in cols, col
        assert cols["planned_set_id"][3] == 0  # notnull flag cleared


def test_ensure_schema_migrates_legacy_table(app, client):
    """Simulate a pre-feature DB: legacy set_log (NOT NULL planned_set_id,
    none of the new columns), then ensure_schema() must upgrade it in place
    without losing rows."""
    ex_id = _exercise_id(app, 1, "Chest press")
    with app.app_context():
        db.session.execute(text("DROP TABLE set_log"))
        db.session.execute(
            text(
                """
                CREATE TABLE set_log (
                    id INTEGER NOT NULL PRIMARY KEY,
                    session_id INTEGER NOT NULL,
                    planned_set_id INTEGER NOT NULL,
                    checked BOOLEAN NOT NULL DEFAULT 0,
                    actual_reps INTEGER,
                    actual_weight_lb REAL,
                    is_pr BOOLEAN NOT NULL DEFAULT 0,
                    CONSTRAINT uq_session_set UNIQUE (session_id, planned_set_id)
                )
                """
            )
        )
        db.session.execute(
            text(
                "INSERT INTO set_log (session_id, planned_set_id, checked, "
                "actual_reps, actual_weight_lb, is_pr) "
                "VALUES (1, 1, 1, 8, 45.0, 1)"
            )
        )
        db.session.commit()

        ensure_schema()

        rows = db.session.execute(
            text("SELECT actual_weight_lb, checked, is_pr FROM set_log")
        ).all()
        assert len(rows) == 1
        assert rows[0][0] == 45.0  # actual_weight_lb preserved
        assert rows[0][1] == 1 and rows[0][2] == 1  # flags preserved
        cols = {
            row[1]: row
            for row in db.session.execute(text("PRAGMA table_info(set_log)"))
        }
        assert cols["planned_set_id"][3] == 0
        assert "rest_seconds" in cols and "exercise_id" in cols

        # Free-form insert with NULL planned_set_id now works.
        db.session.execute(
            text(
                "INSERT INTO set_log (session_id, planned_set_id, exercise_id,"
                " set_number, checked, actual_reps, actual_weight_lb,"
                " rest_seconds, is_pr) VALUES (1, NULL, %d, 1, 1, 8, 50.0,"
                " 90, 0)" % ex_id
            )
        )
        db.session.commit()
        count = db.session.execute(text("SELECT COUNT(*) FROM set_log")).scalar()
        assert count == 2


def test_log_set_round_trip(app, client):
    ex_id = _exercise_id(app, 1, "Chest press")
    sid, (first, second) = _freeform_session(
        client, 1, ex_id, "2026-09-20", [(45, 8, 90), (45, 6, 120)]
    )
    assert first["set_number"] == 1
    assert second["set_number"] == 2  # auto-increment
    assert first["rest_seconds"] == 90
    assert first["est_1rm_lb"] == est_1rm(45, 8)
    assert first["is_pr"] is True  # first-ever set counts as PR
    assert second["is_pr"] is False  # 45x6 < 45x8 est-1RM

    # Explicit set_number is respected.
    resp = client.post(
        f"/api/sessions/{sid}/sets",
        json={"exercise_id": ex_id, "weight_lb": 50, "reps": 5,
              "set_number": 10},
    )
    assert resp.get_json()["set_number"] == 10

    # Bad input rejected.
    resp = client.post(
        f"/api/sessions/{sid}/sets",
        json={"exercise_id": ex_id, "weight_lb": "heavy"},
    )
    assert resp.status_code == 400
    resp = client.post(f"/api/sessions/{sid}/sets", json={})
    assert resp.status_code == 400
    resp = client.post("/api/sessions/9999/sets",
                       json={"exercise_id": ex_id})
    assert resp.status_code == 404


def test_patch_and_delete_set(app, client):
    ex_id = _exercise_id(app, 1, "Chest press")
    sid, (first,) = _freeform_session(
        client, 1, ex_id, "2026-09-20", [(45, 8, 90)]
    )
    set_id = first["id"]

    resp = client.patch(
        f"/api/sessions/{sid}/sets/{set_id}",
        json={"weight_lb": 55, "rest_seconds": 150},
    )
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["actual_weight_lb"] == 55.0
    assert body["rest_seconds"] == 150
    assert body["est_1rm_lb"] == est_1rm(55, 8)

    resp = client.delete(f"/api/sessions/{sid}/sets/{set_id}")
    assert resp.status_code == 200
    assert resp.get_json() == {"deleted": set_id}
    resp = client.patch(
        f"/api/sessions/{sid}/sets/{set_id}", json={"reps": 5}
    )
    assert resp.status_code == 404


def test_session_detail_groups_sets_by_exercise(app, client):
    ex_id = _exercise_id(app, 1, "Chest press")
    sid, _ = _freeform_session(
        client, 1, ex_id, "2026-09-20", [(45, 8, 90)]
    )
    resp = client.get(f"/api/sessions/{sid}")
    assert resp.status_code == 200
    body = resp.get_json()
    groups = {g["exercise_id"]: g for g in body["sets_by_exercise"]}
    assert ex_id in groups
    assert groups[ex_id]["exercise_name"] == "Chest press"
    assert len(groups[ex_id]["logged"]) == 1
    assert groups[ex_id]["logged"][0]["rest_seconds"] == 90
    # Free-form sets don't inflate the planned-routine completion %.
    assert body["completed_pct"] == 0.0


def test_analyzer_progressing_plateau_regressing(app, client):
    rising = _exercise_id(app, 1, "Chest press")
    flat = _exercise_id(app, 1, "Incline press")
    falling = _exercise_id(app, 1, "Dips")

    for i, w in enumerate([100, 105, 110, 115]):
        _freeform_session(
            client, 1, rising, f"2026-09-{10 + i}", [(w, 5, 90)]
        )
    for i in range(3):
        _freeform_session(
            client, 1, flat, f"2026-09-{10 + i}", [(100, 8, 90)]
        )
    for i, w in enumerate([115, 110, 105, 100]):
        _freeform_session(
            client, 1, falling, f"2026-09-{10 + i}", [(w, 5, 90)]
        )

    with app.app_context():
        by_id = {e.id: e for e in Exercise.query.all()}
        verdicts = {
            by_id[eid].name: analyze_exercise(by_id[eid])["verdict"]
            for eid in (rising, flat, falling)
        }
    assert verdicts["Chest press"] == "progressing"
    assert verdicts["Incline press"] == "plateau"
    assert verdicts["Dips"] == "regressing"

    with app.app_context():
        rising_data = analyze_exercise(by_id[rising])
    assert rising_data["sessions_used"] == 4
    assert rising_data["slope_lb_per_session"] > 1.0
    assert rising_data["latest_est_1rm"] == est_1rm(115, 5)
    assert rising_data["last_session_date"] == "2026-09-13"
    assert rising_data["rest"]["avg_rest_seconds"] == 90.0


def test_analyzer_insufficient_data(app, client):
    ex_id = _exercise_id(app, 2, "Pull-ups")
    for i in range(2):
        _freeform_session(
            client, 2, ex_id, f"2026-09-{10 + i}", [(0, 8, 60)]
        )
    with app.app_context():
        ex = db.session.get(Exercise, ex_id)
        data = analyze_exercise(ex)
    assert data["verdict"] == "insufficient_data"
    assert data["sessions_used"] == 2
    assert data["slope_lb_per_session"] is None


def test_analyzer_rest_insight(app, client):
    ex_id = _exercise_id(app, 3, "Squats")
    # 3 PR sets with long rests, then 3 weaker non-PR sets with short rests.
    for i, w in enumerate([100, 105, 110]):
        _freeform_session(
            client, 3, ex_id, f"2026-09-{10 + i}", [(w, 5, 120)]
        )
    for i in range(3):
        _freeform_session(
            client, 3, ex_id, f"2026-09-{14 + i}", [(90, 5, 60)]
        )

    with app.app_context():
        ex = db.session.get(Exercise, ex_id)
        data = analyze_exercise(ex)
    rest = data["rest"]
    assert rest["pr_avg_rest_seconds"] == 120.0
    assert rest["non_pr_avg_rest_seconds"] == 60.0
    assert rest["insight"] is not None
    assert "longer" in rest["insight"]
    assert "60s" in rest["insight"]


def test_analyzer_rest_insight_needs_samples(app, client):
    ex_id = _exercise_id(app, 3, "Leg press")
    for i, w in enumerate([100, 105]):  # only 2 PR sets
        _freeform_session(
            client, 3, ex_id, f"2026-09-{10 + i}", [(w, 5, 120)]
        )
    for i in range(2):  # only 2 non-PR sets
        _freeform_session(
            client, 3, ex_id, f"2026-09-{12 + i}", [(90, 5, 60)]
        )
    with app.app_context():
        ex = db.session.get(Exercise, ex_id)
        data = analyze_exercise(ex)
    assert data["rest"]["insight"] is None


def test_analysis_api_and_page(app, client):
    ex_id = _exercise_id(app, 1, "Chest press")
    for i, w in enumerate([100, 105, 110]):
        _freeform_session(
            client, 1, ex_id, f"2026-09-{10 + i}", [(w, 5, 90)]
        )

    resp = client.get("/api/analysis")
    assert resp.status_code == 200
    rows = {r["name"]: r for r in resp.get_json()}
    assert rows["Chest press"]["verdict"] == "progressing"
    assert rows["Chest press"]["day_number"] == 1
    assert "_series_values" not in rows["Chest press"]

    resp = client.get("/analysis")
    assert resp.status_code == 200
    page = resp.get_data(as_text=True)
    assert "<svg" in page  # sparkline
    assert "progressing" in page


def test_log_pages_and_end_to_end_flow(app, client):
    resp = client.get("/log")
    assert resp.status_code == 200
    assert "Start live session" in resp.get_data(as_text=True)

    ex_id = _exercise_id(app, 1, "Chest press")
    resp = client.post(
        "/api/sessions", json={"day_number": 1, "date": "2026-09-23"}
    )
    sid = resp.get_json()["id"]

    resp = client.get(f"/sessions/{sid}/log")
    assert resp.status_code == 200
    page = resp.get_data(as_text=True)
    assert "Start rest" in page
    assert "Log set" in page

    resp = client.post(
        f"/api/sessions/{sid}/sets",
        json={"exercise_id": ex_id, "weight_lb": 45,
              "reps": 8, "rest_seconds": 75},
    )
    assert resp.status_code == 201

    resp = client.get(f"/api/sessions/{sid}")
    groups = {g["exercise_id"]: g for g in
              resp.get_json()["sets_by_exercise"]}
    assert groups[ex_id]["logged"][0]["rest_seconds"] == 75


def test_travel_log_page(app, client):
    resp = client.post(
        "/api/sessions", json={"travel_mode": True, "date": "2026-09-23"}
    )
    sid = resp.get_json()["id"]
    resp = client.get(f"/sessions/{sid}/log")
    assert resp.status_code == 200
    assert "push-ups" in resp.get_data(as_text=True)
