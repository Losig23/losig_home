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


def test_psycopg_v3_dialect_qualifier_stripped():
    # Neon's SQLAlchemy connection string uses postgresql+psycopg:// (psycopg
    # v3); we ship psycopg2, so drop the qualifier instead of failing at
    # engine creation with ModuleNotFoundError: No module named 'psycopg'.
    assert (
        _normalize_database_url("postgresql+psycopg://u:p@host:5432/db")
        == "postgresql://u:p@host:5432/db"
    )


def test_sqlite_default_untouched():
    assert (
        _normalize_database_url("sqlite:///losig_home.db")
        == "sqlite:///losig_home.db"
    )


def test_normalized_postgres_url_resolves_dbapi():
    """Regression: the shipped driver must satisfy SQLAlchemy's default
    ``postgresql://`` dialect. ``create_engine`` imports the DBAPI eagerly,
    so this fails with ModuleNotFoundError if the driver is missing or
    mismatched — no live server needed (we never connect)."""
    import sqlalchemy as sa

    url = _normalize_database_url("postgres://u:p@host:5432/db")
    engine = sa.create_engine(url)
    assert engine.dialect.dbapi is not None
    engine.dispose()


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
