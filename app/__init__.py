"""losig_home backend — personal life-hub API (backend-first, no frontend yet)."""
import os

from flask import Flask
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


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
        return  # create_all() will build it with the new column
    cols = {
        row[1] for row in db.session.execute(text("PRAGMA table_info(set_log)"))
    }
    if "is_pr" not in cols:
        db.session.execute(
            text("ALTER TABLE set_log ADD COLUMN is_pr BOOLEAN NOT NULL DEFAULT 0")
        )
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
    from app.routes.meals import meals_bp
    from app.routes.progress import progress_bp
    from app.routes.routine import routine_bp
    from app.routes.travel import travel_bp
    from app.routes.workout import workout_bp

    app.register_blueprint(bodyweight_bp)
    app.register_blueprint(meals_bp)
    app.register_blueprint(progress_bp)
    app.register_blueprint(routine_bp)
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

    @app.route("/")
    def index():
        return {
            "name": "losig_home",
            "status": "backend-first: API only, no frontend yet",
            "docs": "/api/routine",
        }

    return app
