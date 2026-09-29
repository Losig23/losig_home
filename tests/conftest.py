"""Shared pytest fixtures: in-memory app, seeded routine, logged-in client.

Every route is login-gated except the explicit public surface, so the
default ``client`` fixture creates a user ("test"/"pw") and logs it in.
Use ``anon_client`` for public-surface tests (401 vs redirect, public
week, login flow).

IMPORTANT: the ``app`` fixture deliberately does NOT hold an app context
open during the test. Flask-Login 0.6.x caches the current user on
``flask.g`` (app-context globals); a context held open across requests
would leak the logged-in user into anonymous clients. Each test-client
request therefore pushes its own context, exactly like production.
Helpers that touch the DB directly open their own short context.
"""
import pytest

from app import create_app, db
from app.models import User
from app.seed import seed_db

TEST_USERNAME = "test"
TEST_PASSWORD = "pw"


@pytest.fixture()
def app():
    app = create_app(
        {"TESTING": True, "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:"}
    )
    with app.app_context():
        db.create_all()
        seed_db()
    yield app
    with app.app_context():
        db.session.remove()
        db.drop_all()


def _make_user(app, username=TEST_USERNAME, password=TEST_PASSWORD):
    with app.app_context():
        user = User(username=username)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()
        db.session.expunge(user)
        return user


@pytest.fixture()
def owner(app):
    """The single test account, logged out."""
    return _make_user(app)


@pytest.fixture()
def client(app):
    """Authenticated test client: creates the test user and logs it in."""
    _make_user(app)
    c = app.test_client()
    resp = c.post(
        "/login", data={"username": TEST_USERNAME, "password": TEST_PASSWORD}
    )
    assert resp.status_code == 302  # redirected into the app
    return c


@pytest.fixture()
def anon_client(app):
    """Unauthenticated client for public-surface tests."""
    return app.test_client()
