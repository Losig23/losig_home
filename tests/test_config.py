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
    Plain ``postgresql://`` uses psycopg2 (SQLAlchemy's default dialect);
    Neon's ``postgresql+psycopg://`` flavor uses psycopg v3 — we ship both
    drivers so no form can ModuleNotFoundError at deploy."""
    import sqlalchemy as sa

    cases = {
        "postgres://u:p@host:5432/db": "psycopg2",
        "postgresql://u:p@host:5432/db": "psycopg2",
        "postgresql+psycopg://u:p@host:5432/db": "psycopg",
    }
    for raw, expected_dbapi in cases.items():
        engine = sa.create_engine(_normalize_database_url(raw))
        assert engine.dialect.dbapi.__name__ == expected_dbapi, raw
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
