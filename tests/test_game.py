"""Tests for the apartment game frontend.

/game is intentionally public (like /): anonymous visitors get the 3D
apartment with public-data panels; log-entry forms only appear for
authenticated sessions (private APIs 401 otherwise).
"""
import pathlib
import re

GAME_STATIC = pathlib.Path(__file__).resolve().parents[1] / "app" / "static" / "game"
GAME_TEMPLATE = pathlib.Path(__file__).resolve().parents[1] / "app" / "templates" / "game.html"
GAME_DOCS = pathlib.Path(__file__).resolve().parents[1] / "docs" / "town"


def test_game_page_is_public(anon_client):
    r = anon_client.get("/game")
    assert r.status_code == 200
    html = r.get_data(as_text=True)
    assert "importmap" in html
    assert "three" in html
    assert 'id="scene"' in html
    assert "/static/game/main.js" in html


def test_game_page_logged_in(client):
    r = client.get("/game")
    assert r.status_code == 200
    assert b"id=\"scene\"" in r.data


def test_public_music_unconfigured_returns_null(anon_client):
    # No Last.fm credentials in the test env -> JSON null, still public.
    r = anon_client.get("/api/public/music")
    assert r.status_code == 200
    assert r.get_json() is None


def test_public_music_is_not_login_gated(anon_client, client):
    # Same response shape for both audiences: public data only.
    assert anon_client.get("/api/public/music").status_code == 200
    assert client.get("/api/public/music").status_code == 200


def test_game_static_modules_exist(anon_client):
    for mod in ("main.js", "apartment.js", "world.js", "player.js", "panels.js", "pencil.js", "ink.js",
                "outside.js", "home_lot.js", "car.js", "batch.js", "nearby.js", "town.js", "scenery.js",
                "collide.js", "vehicle.js", "drive.js"):
        r = anon_client.get(f"/static/game/{mod}")
        assert r.status_code == 200, mod
        assert b"import" in r.data or b"export" in r.data, mod


def test_game_page_has_no_private_data(anon_client):
    # The page shell must not embed user data; panels fetch it client-side.
    html = anon_client.get("/game").get_data(as_text=True)
    assert "user_id" not in html
    assert "photo" not in html.lower()


def test_game_page_has_travel_hud(anon_client):
    # fade between areas, arrival caption, and the OSM credit (ODbL) shown outdoors
    html = anon_client.get("/game").get_data(as_text=True)
    assert 'id="fade"' in html
    assert 'id="place"' in html
    assert "openstreetmap.org/copyright" in html


# The game is public and the outdoor phase is built from real places, so
# addresses, the street corner and coordinates stay out of everything it
# ships: home_lot.js measures in feet from a local reference point.
_REAL_PLACE = re.compile(r"-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}")   # "lat, lon"-looking pairs


def test_game_ships_no_real_addresses_or_coordinates():
    files = sorted(GAME_STATIC.glob("*.js")) + [GAME_TEMPLATE] + sorted(GAME_DOCS.glob("*.md"))
    assert len(files) > 5
    for f in files:
        hits = _REAL_PLACE.findall(f.read_text(encoding="utf-8"))
        assert not hits, f"{f.name}: {hits}"
