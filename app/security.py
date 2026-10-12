"""Production security: proxy handling, rate limiting, security headers.

- ProxyFix: Render terminates TLS at its edge proxy. Without this,
  ``request.remote_addr`` is Render's proxy IP (one shared rate-limit bucket
  for every visitor) and ``request.scheme`` is wrong.
- Flask-Limiter: brute-force protection on the auth blueprint's POST routes
  plus a light global default. The limiter is created per-app (not
  module-level): in v4, calling ``init_app`` on a shared limiter makes its
  decorators enforce globally, which poisons the test suite via shared
  in-memory storage. In-memory storage is fine at this scale (a single
  gunicorn worker on the free tier); multiple workers would need a shared
  store like Redis.
- Security headers on every response. No strict Content-Security-Policy: the
  frontend uses inline scripts/styles throughout, so a locked-down CSP would
  break the app — accepted tradeoff, documented here instead of silently
  shipped half-working.
"""
from flask import jsonify, request
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from werkzeug.middleware.proxy_fix import ProxyFix

LOGIN_LIMIT = "5 per minute"


def init_security(app):
    # Real client IP + scheme behind Render's single reverse-proxy hop.
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)

    # Cookie flags. Secure cookies are dropped over plain http, which would
    # break local dev — so only force Secure in production. This codebase
    # already treats "postgres URL" as "production" (ensure_schema skips it,
    # Alembic owns it), so reuse that signal instead of another env var.
    if app.config["SQLALCHEMY_DATABASE_URI"].startswith("postgresql"):
        app.config["SESSION_COOKIE_SECURE"] = True
    # Explicit values (Flask's built-ins are True and None respectively):
    # HttpOnly keeps JS from reading the cookie; Lax stops cross-site POSTs
    # from carrying it, which neuters CSRF against the JSON APIs.
    app.config["SESSION_COOKIE_HTTPONLY"] = True
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

    # RATELIMIT_ENABLED defaults to (not TESTING); tests can force it on to
    # exercise the limiter against a real app.
    limiter = Limiter(
        key_func=get_remote_address,
        default_limits=["500 per hour"],
        storage_uri="memory://",
        enabled=app.config.get(
            "RATELIMIT_ENABLED", not app.config.get("TESTING")
        ),
    )
    limiter.init_app(app)
    from app.auth import auth_bp

    # Brute-force protection on login/logout POSTs (the GET login form is
    # unaffected). Applied to the blueprint here — not as an import-time
    # decorator — so the limiter stays per-app (see module docstring).
    limiter.limit(LOGIN_LIMIT, methods=["POST"])(auth_bp)

    @app.after_request
    def _security_headers(resp):
        # Browsers ignore HSTS on plain-http responses, so always setting it
        # is safe; production is https-only anyway.
        resp.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )
        resp.headers["X-Content-Type-Options"] = "nosniff"
        resp.headers["X-Frame-Options"] = "DENY"
        resp.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return resp

    @app.errorhandler(429)
    def _rate_limited(_e):
        if request.path.startswith("/api/"):
            return jsonify({"error": "Too many requests — slow down."}), 429
        return (
            "<h1>Too many requests</h1>"
            "<p>Slow down and try again in a minute.</p>",
            429,
        )
