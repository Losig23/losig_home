"""losig_home backend — personal life-hub API + basic localhost frontend."""
import os

from flask import Flask
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


def _rebuild_set_log_nullable():
    """Rebuild set_log so planned_set_id is nullable.

    SQLite can't ALTER a column's nullability, so: create the new table,
    copy every row, drop the old one, rename. Keeps the uq_session_set
    unique constraint (SQLite allows multiple NULLs in it, so free-form
    rows with NULL planned_set_id never collide).
    """
    from sqlalchemy import text

    db.session.execute(
        text(
            """
            CREATE TABLE set_log_new (
                id INTEGER NOT NULL PRIMARY KEY,
                session_id INTEGER NOT NULL REFERENCES workout_session(id),
                planned_set_id INTEGER REFERENCES planned_set(id),
                exercise_id INTEGER REFERENCES exercise(id),
                set_number INTEGER,
                checked BOOLEAN NOT NULL DEFAULT 0,
                actual_reps INTEGER,
                actual_weight_lb REAL,
                rest_seconds INTEGER,
                is_pr BOOLEAN NOT NULL DEFAULT 0,
                CONSTRAINT uq_session_set UNIQUE (session_id, planned_set_id)
            )
            """
        )
    )
    db.session.execute(
        text(
            """
            INSERT INTO set_log_new
                (id, session_id, planned_set_id, exercise_id, set_number,
                 checked, actual_reps, actual_weight_lb, rest_seconds, is_pr)
            SELECT id, session_id, planned_set_id, exercise_id, set_number,
                   checked, actual_reps, actual_weight_lb, rest_seconds, is_pr
            FROM set_log
            """
        )
    )
    db.session.execute(text("DROP TABLE set_log"))
    db.session.execute(text("ALTER TABLE set_log_new RENAME TO set_log"))


def ensure_schema():
    """Add columns to pre-existing DBs (no migration framework here).

    Idempotent and safe to run on every startup: skipped entirely on fresh
    DBs (db.create_all() builds the full schema) and on non-SQLite engines.
    """
    if db.engine.dialect.name != "sqlite":
        return
    from sqlalchemy import text

    tables = {
        row[0]
        for row in db.session.execute(
            text("SELECT name FROM sqlite_master WHERE type='table'")
        )
    }
    if "set_log" not in tables:
        return  # create_all() will build it with the new columns

    for col, ddl in [
        ("is_pr", "ALTER TABLE set_log ADD COLUMN is_pr BOOLEAN NOT NULL DEFAULT 0"),
        ("rest_seconds", "ALTER TABLE set_log ADD COLUMN rest_seconds INTEGER"),
        ("exercise_id", "ALTER TABLE set_log ADD COLUMN exercise_id INTEGER"),
        ("set_number", "ALTER TABLE set_log ADD COLUMN set_number INTEGER"),
    ]:
        cols = {
            row[1]
            for row in db.session.execute(text("PRAGMA table_info(set_log)"))
        }
        if col not in cols:
            db.session.execute(text(ddl))

    # Free-form live logs have no planned set -> planned_set_id must be
    # nullable. PRAGMA row: (cid, name, type, notnull, default, pk).
    info = {
        row[1]: row
        for row in db.session.execute(text("PRAGMA table_info(set_log)"))
    }
    if info["planned_set_id"][3] == 1:
        _rebuild_set_log_nullable()

    db.session.commit()


def create_app(config_overrides=None):
    app = Flask(__name__)
    app.config.from_object("config.Config")
    if config_overrides:
        app.config.update(config_overrides)

    # Load optional .env for local dev (real env vars take precedence).
    try:
        from dotenv import load_dotenv

        load_dotenv()
    except ImportError:
        pass

    db.init_app(app)

    from app.routes.bodyweight import bodyweight_bp
    from app.routes.frontend import frontend_bp
    from app.routes.live import live_bp
    from app.routes.meals import meals_bp
    from app.routes.progress import progress_bp
    from app.routes.routine import routine_bp
    from app.routes.sets import sets_bp
    from app.routes.analysis import analysis_bp
    from app.routes.travel import travel_bp
    from app.routes.workout import workout_bp

    app.register_blueprint(bodyweight_bp)
    app.register_blueprint(frontend_bp)
    app.register_blueprint(live_bp)
    app.register_blueprint(meals_bp)
    app.register_blueprint(progress_bp)
    app.register_blueprint(routine_bp)
    app.register_blueprint(sets_bp)
    app.register_blueprint(analysis_bp)
    app.register_blueprint(travel_bp)
    app.register_blueprint(workout_bp)

    with app.app_context():
        ensure_schema()

    @app.cli.command("seed")
    def seed_command():
        """Create tables and seed the 5-day workout routine (idempotent)."""
        from app.seed import seed_db

        with app.app_context():
            db.create_all()
            inserted = seed_db()
        if inserted:
            print("Seeded the 5-day workout routine.")
        else:
            print("Routine already seeded; nothing to do.")

    @app.route("/api")
    def api_index():
        return {
            "name": "losig_home",
            "status": "ok",
            "docs": "/api/routine",
        }

    return app
