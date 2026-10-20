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
                "collide.js", "vehicle.js", "drive.js", "chunks.js", "breakables.js"):
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
    assert "GlobalMLBuildingFootprints" in html


# The game is public and the outdoor phase is built from real places, so
# addresses, the street corner, the town and coordinates stay out of
# everything it ships: home_lot.js measures in feet from a local reference
# point. The guard can't spell out what it guards (this file is public too),
# so the words and the reference point come from the same untracked file the
# bake uses (instance/town/settings.json: "private_words", "origin"). Where
# that file doesn't exist (CI, a fresh clone) only the generic check runs:
# no "lat, lon"-looking pairs anywhere.
PRIVATE = pathlib.Path(__file__).resolve().parents[1] / "instance" / "town" / "settings.json"
_COORD_PAIR = re.compile(r"-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}")


def _private():
    if not PRIVATE.exists():
        return [], None
    import json

    s = json.loads(PRIVATE.read_text())
    return [w.lower() for w in s.get("private_words", [])], s.get("origin")


def _place_hits(text, words=True):
    private_words, origin = _private()
    hits = _COORD_PAIR.findall(text)
    if words and private_words:
        low = text.lower()
        hits += [w for w in private_words if re.search(r"(?<![a-z0-9])%s(?![a-z0-9])" % re.escape(w), low)]
    if origin:
        # any decimal within ~3 miles of the reference point's latitude or longitude
        for num in re.findall(r"-?\d+\.\d{2,}", text):
            v = float(num)
            if abs(v - origin[0]) < 0.05 or abs(v - origin[1]) < 0.05:
                hits.append(num)
    return hits


GAME_TOWN = GAME_STATIC / "town"
BAKE_SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "build_town.py"


def test_game_ships_no_real_addresses_or_coordinates():
    files = (sorted(GAME_STATIC.glob("*.js")) + [GAME_TEMPLATE] + sorted(GAME_DOCS.glob("*.md"))
             + sorted(GAME_TOWN.glob("*.md")) + [BAKE_SCRIPT])
    assert len(files) > 5
    for f in files:
        hits = _place_hits(f.read_text(encoding="utf-8"))
        assert not hits, f"{f.name}: {len(hits)} hit(s)"
    # the baked chunks are numbers in feet (any of which may happen to look like a
    # house number), so only their text is checked for words; all of it for coordinates
    for f in sorted(GAME_TOWN.glob("*.json")):
        raw = f.read_text(encoding="utf-8")
        assert not _place_hits(raw, words=False), f.name
        assert not _place_hits(" ".join(re.findall(r'"([^"]*)"', raw))), f.name


# The baked town holds shapes and a few class words only: no OSM names,
# addresses or other free text can ride along in it.
_CHUNK_KEYS = {"roads", "aisles", "curbs", "walks", "areas", "rails", "rivers", "houses", "blocks", "trees", "props"}
_CHUNK_WORDS = {"collector", "res", "service", "drive", "track",
                "farm", "meadow", "park", "wood", "pitch", "water", "lot",
                "pole", "lamp", "stop", "signal"}


def _strings(v):
    if isinstance(v, str):
        yield v
    elif isinstance(v, list):
        for x in v:
            yield from _strings(x)


def test_baked_town_is_only_shapes():
    import json

    index = json.loads((GAME_TOWN / "index.json").read_text())
    assert index["chunk"] == 600 and len(index["chunks"]) > 100
    assert (GAME_TOWN / "NOTICE.md").exists()   # ODbL: the derived data says what it is
    for i, j in index["chunks"]:
        chunk = json.loads((GAME_TOWN / f"c_{i}_{j}.json").read_text())
        assert set(chunk) <= _CHUNK_KEYS, (i, j, set(chunk) - _CHUNK_KEYS)
        words = set(_strings(list(chunk.values())))
        assert words <= _CHUNK_WORDS, (i, j, words - _CHUNK_WORDS)


def test_road_graph_is_only_numbers():
    # the street graph the minimap and the Places router read: vertices, and
    # edges [a, b, class, [x, z, ...]] in whole feet, nothing else
    import json

    g = json.loads((GAME_TOWN / "roads.json").read_text())
    assert set(g) == {"v", "nodes", "edges"}
    n = len(g["nodes"]) // 2
    assert n > 1000 and all(isinstance(v, int) for v in g["nodes"])
    for a, b, k, mid in g["edges"]:
        assert 0 <= a < n and 0 <= b < n and k in (0, 1, 2, 3)
        assert len(mid) % 2 == 0 and all(isinstance(v, int) for v in mid)


def test_bake_reads_the_place_from_untracked_settings():
    # the origin and bounds live in instance/ (gitignored), never in the script
    src = BAKE_SCRIPT.read_text()
    assert "instance" in src and "settings.json" in src
    gitignore = (BAKE_SCRIPT.parents[1] / ".gitignore").read_text().split()
    assert "instance/" in gitignore
