import pytest

from app import create_app, db
from app.seed import seed_db


@pytest.fixture()
def app():
    app = create_app(
        {"TESTING": True, "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:"}
    )
    with app.app_context():
        db.create_all()
        seed_db()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()
