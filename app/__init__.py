"""losig_home backend — personal life-hub API + basic localhost frontend."""
import os

from flask import Flask, jsonify, redirect, request, url_for
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
    """Bring pre-existing DBs up to the current schema (no migrations here).

    Idempotent and safe to run on every startup; skipped entirely on
    non-SQLite engines. Two passes:

    1. ``create_all(checkfirst=True)`` creates tables missing from the DB
       (e.g. body_weight_log/meal_log on DBs created before those
       features) without touching existing tables.
    2. ``ALTER TABLE`` adds columns missing from existing tables
       (user_id, plus the legacy set_log columns).
    """
    if db.engine.dialect.name != "sqlite":
        return
    from sqlalchemy import text

    import app.models  # noqa: F401 -- register every model table

    # Pass 1: missing tables (fresh and legacy DBs alike).
    db.Model.metadata.create_all(db.engine, checkfirst=True)

    # Pass 2: missing columns on tables that already existed.
    for table in (
        "workout_session",
        "travel_session",
        "body_weight_log",
        "meal_log",
    ):
        cols = {
            row[1]
            for row in db.session.execute(text(f"PRAGMA table_info({table})"))
        }
        if "user_id" not in cols:
            db.session.execute(
                text(f"ALTER TABLE {table} ADD COLUMN user_id INTEGER")
            )
    db.session.commit()

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
    # Load .env BEFORE config: config.py reads os.environ at import time,
    # so SECRET_KEY / DATABASE_URL from .env must be present already.
    try:
        from dotenv import load_dotenv

        load_dotenv()
    except ImportError:
        pass

    app = Flask(__name__)
    app.config.from_object("config.Config")
    if config_overrides:
        app.config.update(config_overrides)

    # Sessions sign login cookies: fail fast without a real secret, except
    # in tests (fixed dummy key) — never ship a hardcoded production key.
    if app.config.get("TESTING"):
        app.secret_key = "test-secret-key-not-for-production"
    elif not app.config.get("SECRET_KEY"):
        raise RuntimeError(
            "SECRET_KEY is not set. Add it to your environment or a local "
            ".env file (see .env.example) and restart."
        )

    db.init_app(app)

    from app.auth import auth_bp, login_manager

    login_manager.init_app(app)

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

    app.register_blueprint(auth_bp)
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

    @app.before_request
    def _require_login():
        """Default-deny auth gate: everything needs a login except the
        explicit public surface (home page, login/logout, API index,
        health check, public week feed, static assets)."""
        from flask_login import current_user

        path = request.path
        if path in _PUBLIC_PATHS or path.startswith(_PUBLIC_PREFIXES):
            return None
        if current_user.is_authenticated:
            return None
        if path.startswith("/api"):
            return jsonify({"error": "Authentication required"}), 401
        return redirect(url_for("auth.login", next=path))

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

    @app.cli.command("create-user")
    def create_user_command():
        """Create the single login account. Existing rows with no owner
        (user_id NULL) are adopted by the new user."""
        import getpass

        from app.models import (
            BodyWeightLog,
            MealLog,
            TravelSession,
            User,
            WorkoutSession,
        )

        username = input("Username: ").strip()
        if not username:
            print("Username is required.")
            return
        if User.query.filter_by(username=username).first():
            print(f"User '{username}' already exists.")
            return
        pw1 = getpass.getpass("Password: ")
        pw2 = getpass.getpass("Confirm password: ")
        if not pw1 or pw1 != pw2:
            print("Passwords do not match or are empty.")
            return

        user = User(username=username)
        user.set_password(pw1)
        db.session.add(user)
        db.session.flush()  # assign id before adopting rows

        adopted = 0
        for model in (WorkoutSession, TravelSession, BodyWeightLog, MealLog):
            adopted += (
                model.query.filter_by(user_id=None)
                .update({"user_id": user.id}, synchronize_session=False)
            )
        db.session.commit()
        print(
            f"Created user '{username}' (id {user.id}); "
            f"adopted {adopted} existing rows."
        )

    @app.cli.command("list-users")
    def list_users_command():
        """List login usernames (never password hashes)."""
        from app.models import User

        users = User.query.order_by(User.id).all()
        if not users:
            print("No users yet. Run 'flask create-user' first.")
        for u in users:
            print(u.username)

    @app.route("/api")
    def api_index():
        return {
            "name": "losig_home",
            "status": "ok",
            "docs": "/api/routine",
        }

    return app


_PUBLIC_PATHS = frozenset(
    {"/", "/login", "/logout", "/api", "/api/health"}
)
_PUBLIC_PREFIXES = ("/static/", "/api/public/")
