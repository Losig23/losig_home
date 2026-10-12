"""Listening/music: Last.fm client parsing, cache behavior, page wiring."""
from datetime import datetime, timedelta, timezone
from unittest import mock

import pytest
import requests

from app import create_app, db, listening
from app.lastfm_client import (
    LastfmError,
    get_recent_tracks,
    get_weekly_artists,
    get_weekly_tracks,
)
from app.models import ListeningCache, User


# ---------- client parsing (mocked HTTP) ----------

def _resp(payload, status=200):
    r = mock.Mock()
    r.status_code = status
    r.json.return_value = payload
    r.text = str(payload)[:200]
    return r


def test_weekly_tracks_parse():
    body = {
        "weeklytrackchart": {
            "track": [
                {
                    "name": "Blinding Lights",
                    "artist": {"#text": "The Weeknd"},
                    "playcount": "42",
                    "url": "https://www.last.fm/music/x",
                },
                {"name": "", "artist": {"#text": "Nope"}},  # malformed, skipped
            ]
        }
    }
    with mock.patch("app.lastfm_client.requests.get", return_value=_resp(body)):
        tracks = get_weekly_tracks("key", "Losig")
    assert tracks == [
        {
            "title": "Blinding Lights",
            "artist": "The Weeknd",
            "playcount": 42,
            "url": "https://www.last.fm/music/x",
        }
    ]


def test_weekly_artists_parse():
    body = {
        "weeklyartistchart": {
            "artist": [
                {"name": "Kendrick Lamar", "playcount": "17", "url": "u1"},
            ]
        }
    }
    with mock.patch("app.lastfm_client.requests.get", return_value=_resp(body)):
        artists = get_weekly_artists("key", "Losig")
    assert artists == [{"name": "Kendrick Lamar", "playcount": 17, "url": "u1"}]


def test_recent_tracks_skips_now_playing():
    body = {
        "recenttracks": {
            "track": [
                {  # now-playing entry: no date -> skipped
                    "name": "Live One",
                    "artist": {"#text": "A"},
                    "album": {"#text": "B"},
                },
                {
                    "name": "Old One",
                    "artist": {"#text": "A"},
                    "album": {"#text": "B"},
                    "date": {"uts": "1720000000", "#text": "someday"},
                    "url": "u2",
                },
            ]
        }
    }
    with mock.patch("app.lastfm_client.requests.get", return_value=_resp(body)):
        tracks = get_recent_tracks("key", "Losig")
    assert len(tracks) == 1
    assert tracks[0]["title"] == "Old One"
    assert tracks[0]["artist"] == "A"


def test_api_error_body_raises():
    body = {"error": 6, "message": "User not found"}
    with mock.patch("app.lastfm_client.requests.get", return_value=_resp(body)):
        with pytest.raises(LastfmError):
            get_weekly_tracks("key", "Losig")


def test_http_errors_raise():
    with mock.patch(
        "app.lastfm_client.requests.get", return_value=_resp({}, status=500)
    ):
        with pytest.raises(LastfmError):
            get_weekly_tracks("key", "Losig")
    with mock.patch(
        "app.lastfm_client.requests.get", return_value=_resp({}, status=429)
    ):
        with pytest.raises(LastfmError):
            get_weekly_tracks("key", "Losig")
    with mock.patch(
        "app.lastfm_client.requests.get",
        side_effect=requests.ConnectionError("down"),
    ):
        with pytest.raises(LastfmError):
            get_weekly_tracks("key", "Losig")


def test_missing_config_raises():
    with pytest.raises(LastfmError):
        get_weekly_tracks("", "Losig")
    with pytest.raises(LastfmError):
        get_weekly_tracks("key", "")


# ---------- cache behavior ----------

def test_cache_serves_within_ttl(app):
    canned = [{"title": "T", "artist": "A", "playcount": 3, "url": ""}]
    app.config["LASTFM_API_KEY"] = "k"
    app.config["LASTFM_USERNAME"] = "Losig"
    with app.app_context(), mock.patch.object(
        listening.lastfm_client, "get_weekly_tracks", return_value=canned
    ) as m:
        first = listening.weekly_tracks()
        second = listening.weekly_tracks()
    assert first == canned
    assert second == canned
    assert m.call_count == 1  # second call served from cache


def test_stale_cache_returned_on_api_failure(app):
    app.config["LASTFM_API_KEY"] = "k"
    app.config["LASTFM_USERNAME"] = "Losig"
    stale = [{"title": "Old", "artist": "A", "playcount": 1, "url": ""}]
    with app.app_context():
        db.session.add(
            ListeningCache(
                key="weekly_tracks",
                payload=stale,
                fetched_at=datetime.now(timezone.utc).replace(tzinfo=None)
                - timedelta(days=2),
            )
        )
        db.session.commit()
    with app.app_context(), mock.patch.object(
        listening.lastfm_client,
        "get_weekly_tracks",
        side_effect=LastfmError("down"),
    ):
        assert listening.weekly_tracks() == stale


def test_no_cache_and_api_failure_gives_none(app):
    app.config["LASTFM_API_KEY"] = "k"
    app.config["LASTFM_USERNAME"] = "Losig"
    with app.app_context(), mock.patch.object(
        listening.lastfm_client,
        "get_weekly_tracks",
        side_effect=LastfmError("down"),
    ):
        assert listening.weekly_tracks() is None


def test_unconfigured_gives_none(app):
    with app.app_context():
        assert listening.weekly_tracks() is None
        assert listening.weekly_artists() is None
        assert listening.recent_tracks() is None


# ---------- page wiring ----------

@pytest.fixture()
def music_app():
    app = create_app(
        {
            "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
            "LASTFM_API_KEY": "test-key",
            "LASTFM_USERNAME": "Losig",
        }
    )
    with app.app_context():
        db.create_all()
        user = User(username="test")
        user.set_password("pw")
        db.session.add(user)
        db.session.commit()
    return app


def _login(c):
    resp = c.post("/login", data={"username": "test", "password": "pw"})
    assert resp.status_code == 302


def test_public_home_shows_music_section(music_app):
    tracks = [
        {"title": "Blinding Lights", "artist": "The Weeknd",
         "playcount": 42, "url": ""}
    ]
    artists = [{"name": "Kendrick Lamar", "playcount": 17, "url": ""}]
    with mock.patch.object(
        listening, "weekly_tracks", return_value=tracks
    ), mock.patch.object(listening, "weekly_artists", return_value=artists):
        body = music_app.test_client().get("/").data.decode()
    assert "This week in music" in body
    assert "Blinding Lights" in body
    assert "Kendrick Lamar" in body
    assert "Last.fm" in body


def test_public_home_omits_music_when_unconfigured(app):
    body = app.test_client().get("/").data.decode()
    assert "This week in music" not in body


def test_music_page_requires_login(music_app):
    resp = music_app.test_client().get("/music")
    assert resp.status_code == 302
    assert resp.headers["Location"].startswith("/login")


def test_music_page_unconfigured_hint(app):
    c = app.test_client()
    # log in via the standard fixture user
    from tests.conftest import TEST_PASSWORD, TEST_USERNAME

    with app.app_context():
        user = User(username=TEST_USERNAME)
        user.set_password(TEST_PASSWORD)
        db.session.add(user)
        db.session.commit()
    resp = c.post(
        "/login", data={"username": TEST_USERNAME, "password": TEST_PASSWORD}
    )
    assert resp.status_code == 302
    body = c.get("/music").data.decode()
    assert "aren't configured" in body


def test_music_page_shows_data(music_app):
    c = music_app.test_client()
    _login(c)
    tracks = [
        {"title": "Blinding Lights", "artist": "The Weeknd",
         "playcount": 42, "url": "http://x"}
    ]
    with mock.patch.object(
        listening, "weekly_tracks", return_value=tracks
    ), mock.patch.object(
        listening, "weekly_artists", return_value=[]
    ), mock.patch.object(
        listening, "recent_tracks", return_value=[]
    ):
        body = c.get("/music").data.decode()
    assert "Blinding Lights" in body
    assert "Top tracks this week" in body
