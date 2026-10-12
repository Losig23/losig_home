"""Read-only Last.fm client: weekly charts + recent tracks.

Display only — nothing here trains a model or writes data anywhere. The API
key is passed as a request param (Last.fm's design) and is never included in
exception messages or logs.
"""
import requests

API_URL = "https://ws.audioscrobbler.com/2.0/"
TIMEOUT = 10


class LastfmError(Exception):
    """Anything wrong talking to Last.fm (network, HTTP, or API error body)."""


def _text(value) -> str:
    """Last.fm nests strings as {"#text": "..."}; tolerate plain strings."""
    if isinstance(value, dict):
        return str(value.get("#text", "") or "")
    return str(value or "")


def _request(api_key: str, params: dict) -> dict:
    try:
        r = requests.get(
            API_URL,
            params={"api_key": api_key, "format": "json", **params},
            timeout=TIMEOUT,
        )
    except requests.RequestException as e:
        raise LastfmError(f"Last.fm request failed: {e}") from e
    if r.status_code == 429:
        raise LastfmError("Last.fm rate limit hit (HTTP 429).")
    if r.status_code != 200:
        raise LastfmError(f"Last.fm API error (HTTP {r.status_code}).")
    try:
        body = r.json()
    except ValueError as e:
        raise LastfmError("Last.fm returned a non-JSON response.") from e
    # Last.fm reports API errors as HTTP 200 with an {error, message} body.
    if isinstance(body, dict) and "error" in body:
        raise LastfmError(
            f"Last.fm error {body.get('error')}: {body.get('message')}"
        )
    return body


def _require_config(api_key: str, username: str) -> None:
    if not api_key or not username:
        raise LastfmError(
            "LASTFM_API_KEY and LASTFM_USERNAME must be set "
            "(see .env.example)."
        )


def _as_list(value):
    if not value:
        return []
    return value if isinstance(value, list) else [value]


def _parse_chart_track(item: dict) -> dict | None:
    title = _text(item.get("name")).strip()
    artist = _text(item.get("artist")).strip()
    if not title or not artist:
        return None
    try:
        playcount = int(item.get("playcount") or 0)
    except (TypeError, ValueError):
        playcount = 0
    return {
        "title": title,
        "artist": artist,
        "playcount": playcount,
        "url": item.get("url") or "",
    }


def _parse_chart_artist(item: dict) -> dict | None:
    name = _text(item.get("name")).strip()
    if not name:
        return None
    try:
        playcount = int(item.get("playcount") or 0)
    except (TypeError, ValueError):
        playcount = 0
    return {"name": name, "playcount": playcount, "url": item.get("url") or ""}


def get_weekly_tracks(api_key: str, username: str, limit: int = 10) -> list[dict]:
    """This week's top tracks. No date range -> most recent weekly chart."""
    _require_config(api_key, username)
    body = _request(
        api_key, {"method": "user.getweeklytrackchart", "user": username}
    )
    items = (body.get("weeklytrackchart") or {}).get("track") or []
    tracks = [_parse_chart_track(i) for i in _as_list(items)]
    return [t for t in tracks if t is not None][: max(1, limit)]


def get_weekly_artists(
    api_key: str, username: str, limit: int = 10
) -> list[dict]:
    """This week's top artists. No date range -> most recent weekly chart."""
    _require_config(api_key, username)
    body = _request(
        api_key, {"method": "user.getweeklyartistchart", "user": username}
    )
    items = (body.get("weeklyartistchart") or {}).get("artist") or []
    artists = [_parse_chart_artist(i) for i in _as_list(items)]
    return [a for a in artists if a is not None][: max(1, limit)]


def get_recent_tracks(
    api_key: str, username: str, limit: int = 30
) -> list[dict]:
    """Most recent scrobbles, newest first. Skips the now-playing entry."""
    _require_config(api_key, username)
    body = _request(
        api_key,
        {
            "method": "user.getrecenttracks",
            "user": username,
            "limit": max(1, min(50, limit)),
        },
    )
    items = (body.get("recenttracks") or {}).get("track") or []
    out = []
    for item in _as_list(items):
        date = item.get("date") or {}
        if not date.get("uts"):
            continue  # now-playing entry has no timestamp yet
        title = _text(item.get("name")).strip()
        artist = _text(item.get("artist")).strip()
        if not title or not artist:
            continue
        out.append(
            {
                "title": title,
                "artist": artist,
                "album": _text(item.get("album")).strip(),
                "played_at": date.get("#text", ""),
                "url": item.get("url") or "",
            }
        )
    return out
