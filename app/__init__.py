"""losig_home backend — personal life-hub API (backend-first, no frontend yet)."""
import os

from flask import Flask
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


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

    from app.routes.routine import routine_bp
    from app.routes.workout import workout_bp

    app.register_blueprint(routine_bp)
    app.register_blueprint(workout_bp)

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
