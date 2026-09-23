"""App configuration."""
import os


class Config:
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL", "sqlite:///losig_home.db"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    # Meal photo uploads are capped at 10MB (413s anything bigger).
    MAX_CONTENT_LENGTH = 10 * 1024 * 1024
