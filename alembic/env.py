"""Alembic environment for losig_home.

MIGRATION STRATEGY (read before adding a migration):

- Alembic manages PRODUCTION Postgres only. Local SQLite development keeps
  using the existing ``ensure_schema()`` in ``app/__init__.py`` (PRAGMA-based,
  idempotent, runs at every startup).
- When adding a column or table in the future, add BOTH an Alembic migration
  (``alembic revision --autogenerate``) AND a matching ``ensure_schema()``
  entry, so SQLite dev DBs and Postgres prod stay in step.
- Do NOT remove or gut ``ensure_schema()``: the dev machines run SQLite and
  depend on it.

This file deliberately does NOT call ``create_app()``: the app factory raises
without SECRET_KEY, and migrations must run with zero app env configured
(e.g. Render's preDeployCommand). It builds its own engine from the
normalized DATABASE_URL (defaulting to a local SQLite URL) and points
Alembic at the models' metadata via ``from app import db``.
"""
import os
import sys

# Repo root, so `import app` and `import config` resolve without create_app().
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from alembic import context  # noqa: E402

from app import db  # noqa: E402
import app.models  # noqa: E402,F401 -- register every model table
from config import _normalize_database_url  # noqa: E402

config = context.config


def get_url():
    """DATABASE_URL normalized for SQLAlchemy 2.x, else a local fallback."""
    url = os.environ.get("DATABASE_URL")
    if url:
        return _normalize_database_url(url)
    here = os.path.dirname(os.path.abspath(__file__))
    return "sqlite:///" + os.path.join(here, "..", "instance", "losig_home.db")


config.set_main_option("sqlalchemy.url", get_url())
target_metadata = db.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (emit SQL without a DB connection)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode (against a live DB connection)."""
    from sqlalchemy import engine_from_config, pool

    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
