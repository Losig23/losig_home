"""App configuration."""
import os


class Config:
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL", "sqlite:///losig_home.db"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    # Signs login session cookies. Required outside tests — create_app()
    # raises a clear error when it is missing (set it in .env).
    SECRET_KEY = os.environ.get("SECRET_KEY")
    # Meal photo uploads are capped at 10MB (413s anything bigger).
    MAX_CONTENT_LENGTH = 10 * 1024 * 1024
