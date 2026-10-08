"""Alembic: upgrade head against a scratch SQLite DB creates every table."""
import os
import sqlite3

from alembic import command
from alembic.config import Config as AlembicConfig

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

EXPECTED_TABLES = {
    "app_user",
    "routine_day",
    "exercise",
    "planned_set",
    "workout_session",
    "set_log",
    "travel_session",
    "travel_set",
    "body_weight_log",
    "meal_log",
}


def _alembic_config(db_path, monkeypatch):
    # env.py must work with zero app env configured (no SECRET_KEY).
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    monkeypatch.delenv("SECRET_KEY", raising=False)
    cfg = AlembicConfig(os.path.join(REPO_ROOT, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(REPO_ROOT, "alembic"))
    return cfg


def _tables(db_path):
    con = sqlite3.connect(db_path)
    try:
        return {
            row[0]
            for row in con.execute(
                "select name from sqlite_master where type='table'"
            )
        }
    finally:
        con.close()


def test_upgrade_head_creates_all_tables(tmp_path, monkeypatch):
    db_path = tmp_path / "alembic_smoke.db"
    command.upgrade(_alembic_config(db_path, monkeypatch), "head")
    assert EXPECTED_TABLES <= _tables(db_path)


def test_downgrade_base_then_reupgrade(tmp_path, monkeypatch):
    db_path = tmp_path / "alembic_smoke2.db"
    cfg = _alembic_config(db_path, monkeypatch)
    command.upgrade(cfg, "head")
    command.downgrade(cfg, "base")
    assert not (EXPECTED_TABLES <= _tables(db_path))
    command.upgrade(cfg, "head")
    assert EXPECTED_TABLES <= _tables(db_path)
