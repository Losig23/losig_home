"""config: DATABASE_URL normalization for SQLAlchemy 2.x."""
import importlib
import os

import config
from config import _normalize_database_url


def test_postgres_scheme_normalized():
    assert (
        _normalize_database_url("postgres://u:p@host:5432/db")
        == "postgresql://u:p@host:5432/db"
    )


def test_postgresql_scheme_untouched():
    url = "postgresql://u:p@host:5432/db?sslmode=require"
    assert _normalize_database_url(url) == url


def test_all_postgres_url_forms_resolve_dbapi():
    """Regression: every postgres URL form we might be handed must resolve
    an installed DBAPI at engine-creation time (no live server needed).
    We ship both psycopg2 and psycopg (v3), so any resolution to either
    driver is fine — what must never happen is a ModuleNotFoundError at
    deploy. (Plain ``postgresql://`` defaulted to psycopg2 through
    SQLAlchemy 2.0; SQLAlchemy 2.1+ defaults it to psycopg.)"""
    import sqlalchemy as sa

    cases = [
        "postgres://u:p@host:5432/db",
        "postgresql://u:p@host:5432/db",
        "postgresql+psycopg://u:p@host:5432/db",
    ]
    for raw in cases:
        engine = sa.create_engine(_normalize_database_url(raw))
        assert engine.dialect.dbapi.__name__ in ("psycopg2", "psycopg"), raw
        engine.dispose()


def test_sqlite_default_untouched():
    assert (
        _normalize_database_url("sqlite:///losig_home.db")
        == "sqlite:///losig_home.db"
    )


def test_config_class_uses_normalized_url(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgres://u:p@host:5432/db")
    importlib.reload(config)
    try:
        assert (
            config.Config.SQLALCHEMY_DATABASE_URI
            == "postgresql://u:p@host:5432/db"
        )
    finally:
        # Restore the sqlite default so later tests are unaffected.
        del os.environ["DATABASE_URL"]
        importlib.reload(config)
    assert (
        config.Config.SQLALCHEMY_DATABASE_URI == "sqlite:///losig_home.db"
    )
