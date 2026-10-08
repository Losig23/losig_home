"""App configuration."""
import os


def _normalize_database_url(url):
    """Normalize provider DATABASE_URLs for SQLAlchemy 2.x.

    Render and Neon hand out ``postgres://...`` URLs; SQLAlchemy 2.x only
    accepts the ``postgresql://`` scheme, so rewrite the prefix once.
    """
    if url.startswith("postgres://"):
        return "postgresql://" + url[len("postgres://"):]
    return url


class Config:
    SQLALCHEMY_DATABASE_URI = _normalize_database_url(
        os.environ.get("DATABASE_URL", "sqlite:///losig_home.db")
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    # Signs login session cookies. Required outside tests — create_app()
    # raises a clear error when it is missing (set it in .env).
    SECRET_KEY = os.environ.get("SECRET_KEY")
    # Meal photo uploads are capped at 10MB (413s anything bigger).
    MAX_CONTENT_LENGTH = 10 * 1024 * 1024
