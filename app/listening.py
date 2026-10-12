"""Listening data: cached Last.fm reads for the music views.

Nothing is imported or stored long-term — every view is a cached API read.
Cache-aside with stale-on-error: a failed refresh never breaks the page, it
just serves the last good data (or nothing on a cold start).
"""
from datetime import datetime, timezone

from flask import current_app

from app import db, lastfm_client
from app.models import ListeningCache

WEEKLY_TTL = 24 * 3600  # weekly charts move slowly
RECENT_TTL = 3600  # recent tracks stay fresher


def configured() -> bool:
    """True when the Last.fm env vars are present."""
    cfg = current_app.config
    return bool(cfg.get("LASTFM_API_KEY") and cfg.get("LASTFM_USERNAME"))


def _cached(key: str, ttl: int, fetch):
    now = datetime.now(timezone.utc).replace(tzinfo=None)  # naive UTC
    row = db.session.get(ListeningCache, key)
    if row is not None:
        age = (now - row.fetched_at).total_seconds()
        if age < ttl:
            return row.payload
    try:
        payload = fetch()
    except lastfm_client.LastfmError:
        # Stale-or-nothing: a dead API never breaks the page.
        return row.payload if row is not None else None
    row = row or ListeningCache(key=key)
    row.payload = payload
    row.fetched_at = now
    db.session.add(row)
    db.session.commit()
    return payload


def _api():
    cfg = current_app.config
    return cfg.get("LASTFM_API_KEY"), cfg.get("LASTFM_USERNAME")


def weekly_tracks(limit: int = 10):
    """This week's top tracks, cached 24h. None when unconfigured/empty."""
    if not configured():
        return None
    api_key, username = _api()
    data = _cached(
        "weekly_tracks",
        WEEKLY_TTL,
        lambda: lastfm_client.get_weekly_tracks(api_key, username, limit),
    )
    return data or None


def weekly_artists(limit: int = 10):
    """This week's top artists, cached 24h. None when unconfigured/empty."""
    if not configured():
        return None
    api_key, username = _api()
    data = _cached(
        "weekly_artists",
        WEEKLY_TTL,
        lambda: lastfm_client.get_weekly_artists(api_key, username, limit),
    )
    return data or None


def recent_tracks(limit: int = 30):
    """Recent scrobbles, cached 1h. None when unconfigured/empty."""
    if not configured():
        return None
    api_key, username = _api()
    data = _cached(
        "recent_tracks",
        RECENT_TTL,
        lambda: lastfm_client.get_recent_tracks(api_key, username, limit),
    )
    return data or None
