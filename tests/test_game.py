"""Tests for the apartment game frontend.

/game is intentionally public (like /): anonymous visitors get the 3D
apartment with public-data panels; log-entry forms only appear for
authenticated sessions (private APIs 401 otherwise).
"""


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
    for mod in ("main.js", "apartment.js", "world.js", "player.js", "panels.js", "pencil.js", "ink.js"):
        r = anon_client.get(f"/static/game/{mod}")
        assert r.status_code == 200, mod
        assert b"import" in r.data or b"export" in r.data, mod


def test_game_page_has_no_private_data(anon_client):
    # The page shell must not embed user data; panels fetch it client-side.
    html = anon_client.get("/game").get_data(as_text=True)
    assert "user_id" not in html
    assert "photo" not in html.lower()
