"""Production security: headers, cookie flags, login rate limiting."""
import pytest

from app import create_app, db
from app.models import User


@pytest.fixture()
def limited_app():
    """App with the rate limiter forced on (it's off under TESTING)."""
    app = create_app(
        {
            "TESTING": True,
            "RATELIMIT_ENABLED": True,
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        }
    )
    with app.app_context():
        db.create_all()
    return app


def test_security_headers_on_public_page(anon_client):
    resp = anon_client.get("/")
    assert (
        resp.headers["Strict-Transport-Security"]
        == "max-age=31536000; includeSubDomains"
    )
    assert resp.headers["X-Content-Type-Options"] == "nosniff"
    assert resp.headers["X-Frame-Options"] == "DENY"
    assert (
        resp.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    )


def test_security_headers_on_api_401(anon_client):
    resp = anon_client.get("/api/routine")
    assert resp.status_code == 401
    assert resp.headers["X-Content-Type-Options"] == "nosniff"


def test_secure_cookie_flag_on_postgres():
    app = create_app(
        {
            "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": "postgresql://u:p@host/db",
        }
    )
    assert app.config["SESSION_COOKIE_SECURE"] is True
    assert app.config["SESSION_COOKIE_SAMESITE"] == "Lax"
    assert app.config["SESSION_COOKIE_HTTPONLY"] is True


def test_cookie_not_forced_secure_on_sqlite(app):
    assert app.config.get("SESSION_COOKIE_SECURE") is not True


def test_login_rate_limited(limited_app):
    """5 wrong passwords -> 401s; the 6th within a minute -> 429."""
    c = limited_app.test_client()
    for _ in range(5):
        resp = c.post("/login", data={"username": "nope", "password": "wrong"})
        assert resp.status_code == 401
    resp = c.post("/login", data={"username": "nope", "password": "wrong"})
    assert resp.status_code == 429
    assert "slow down" in resp.data.decode().lower()


def test_rate_limiting_off_by_default_in_tests(app):
    """The normal test app has no limiter: repeated logins never 429."""
    c = app.test_client()
    for _ in range(7):
        resp = c.post("/login", data={"username": "nope", "password": "wrong"})
        assert resp.status_code == 401
