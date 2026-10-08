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
