"""App configuration."""
import os


class Config:
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL", "sqlite:///losig_home.db"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
