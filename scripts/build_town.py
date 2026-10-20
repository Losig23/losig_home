"""Bake the town for the game's outdoor phase into 600 ft chunks of JSON.

Sources: OpenStreetMap (Overpass) for roads, sidewalks, land cover, water,
rail, trees and street furniture, and Microsoft's Global ML Building
Footprints for the buildings OSM is missing. Both are ODbL, so the output
in app/static/game/town/ is too (see NOTICE.md there).

The game and this repo are public, so the real place stays out of them:
- the origin, the bounds, the footprint files and the Overpass servers
  come from an untracked settings file, instance/town/settings.json;
- only shapes and a few class tags are read; every name, address and
  reference tag is ignored;
- the output holds nothing but feet from the origin (x east, z south).

The blocks around the home lot are hand-built (home_lot.js, nearby.js), so
the bake leaves a hole there: roads, land, trees and furniture inside
nearby.js's REGION are cut out, and footprints that land on a measured
building are dropped. Real footprints elsewhere in REGION do bake (they
replace Phase 2's placeholder houses).

Run:  python scripts/build_town.py [--refresh]
  --refresh   re-download OSM instead of using instance/town/cache/osm.json

Besides the chunks it writes town/roads.json, the street graph the minimap
draws and the Places router searches (vertices where ways meet, edges with
their simplified shapes, a class per edge).

settings.json:
  {"origin": [lat, lon], "ft_per_deg": [ft per deg lon, ft per deg lat],
   "bounds_ft": [x1, z1, x2, z2], "footprints": ["glob", ...],
   "overpass": ["https://.../api/interpreter", ...]}
"""
import glob
import gzip
import hashlib
import json
import math
import os
import re
import subprocess
import sys
import urllib.parse
import urllib.request

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SETTINGS = os.path.join(ROOT, "instance", "town", "settings.json")
CACHE = os.path.join(ROOT, "instance", "town", "cache")
GAME = os.path.join(ROOT, "app", "static", "game")
OUT = os.path.join(GAME, "town")
CHUNK = 600

# road classes -> (look, width ft). Looks: collector (double yellow, curbs),
# res (curbs), service (no curbs, lighter asphalt), drive (narrow), track (gravel)
ROADS = {
    "motorway": ("collector", 52), "trunk": ("collector", 48), "primary": ("collector", 46),
    "secondary": ("collector", 42), "tertiary": ("collector", 36),
    "motorway_link": ("res", 22), "trunk_link": ("res", 22), "primary_link": ("res", 22),
    "secondary_link": ("res", 22), "tertiary_link": ("res", 22),
    "residential": ("res", 30), "unclassified": ("res", 26), "living_street": ("res", 24),
    "service": ("service", 20), "track": ("track", 12),
}
SERVICE_W = {"driveway": 12, "parking_aisle": 22, "drive-through": 12, "alley": 14}
CURBED = {"collector", "res"}
AREAS = {  # tag value -> area kind (drawn in this order, later on top)
    "farmland": "farm", "meadow": "meadow", "grassland": "meadow", "scrub": "meadow", "wetland": "meadow",
    "grass": "park", "village_green": "park", "recreation_ground": "park", "cemetery": "park",
    "park": "park", "golf_course": "park", "playground": "park", "allotments": "park", "orchard": "park",
    "pitch": "pitch", "track": "track",
    "forest": "wood", "wood": "wood",
    "water": "water",
    "parking": "lot",
}
AREA_ORDER = ["farm", "meadow", "park", "wood", "pitch", "track", "water", "lot"]


# ---------------------------------------------------------------- settings / io
def load_settings():
    if not os.path.exists(SETTINGS):
        sys.exit(f"missing {SETTINGS} (untracked on purpose; see the docstring)")
    with open(SETTINGS) as f:
        s = json.load(f)
    lat0, lon0 = s["origin"]
    if "ft_per_deg" in s:
        fx, fz = s["ft_per_deg"]
    else:  # WGS84 lengths of a degree at this latitude
        p = math.radians(lat0)
        fz = (111132.92 - 559.82 * math.cos(2 * p) + 1.175 * math.cos(4 * p)) * 3.28084
        fx = (111412.84 * math.cos(p) - 93.5 * math.cos(3 * p)) * 3.28084
    s["proj"] = (lat0, lon0, fx, fz)
    return s


def to_ft(proj, lat, lon):
    lat0, lon0, fx, fz = proj
    return ((lon - lon0) * fx, -(lat - lat0) * fz)


def bbox_deg(proj, b, pad=400):
    lat0, lon0, fx, fz = proj
    x1, z1, x2, z2 = b
    return (lat0 - (z2 + pad) / fz, lon0 + (x1 - pad) / fx, lat0 - (z1 - pad) / fz, lon0 + (x2 + pad) / fx)


def fetch_osm(s, refresh):
    path = os.path.join(CACHE, "osm.json")
    if os.path.exists(path) and not refresh:
        with open(path) as f:
            return json.load(f)
    so, w, n, e = bbox_deg(s["proj"], s["bounds_ft"])
    bb = f"{so:.5f},{w:.5f},{n:.5f},{e:.5f}"
    q = f"""[out:json][timeout:240];
(
  way["highway"]({bb});
  way["building"]({bb});
  way["landuse"]({bb});
  way["natural"~"^(wood|water|scrub|wetland|grassland)$"]({bb});
  way["leisure"~"^(park|pitch|track|golf_course|playground)$"]({bb});
  way["amenity"="parking"]({bb});
  way["railway"="rail"]({bb});
  way["waterway"~"^(river|stream|canal)$"]({bb});
  relation["natural"="water"]({bb});
  node["highway"~"^(stop|traffic_signals|street_lamp)$"]({bb});
  node["natural"="tree"]({bb});
  node["power"="pole"]({bb});
);
out geom;"""
    data = urllib.parse.urlencode({"data": q}).encode()
    last = None
    for url in s["overpass"]:
        try:
            # system Pythons with an old SSL stack can't reach some mirrors; curl can
            raw = subprocess.run(["curl", "-sS", "--max-time", "300", "-A", "game-map-bake/1.0", "--data-binary", "@-", url],
                                 input=data, capture_output=True, check=True).stdout
            doc = json.loads(raw)
            os.makedirs(CACHE, exist_ok=True)
            with open(path, "w") as f:
                json.dump(doc, f)
            return doc
        except Exception as err:  # busy mirror: try the next
            last = err
    sys.exit(f"Overpass failed on every mirror: {last}")


# ---------------------------------------------------------------- geometry
def dp(pts, eps):
    """Douglas-Peucker simplification."""
    if len(pts) < 3:
        return pts
    a, b = pts[0], pts[-1]
    dx, dz = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dz)
    best, bi = 0, 0
    for i in range(1, len(pts) - 1):
        p = pts[i]
        d = abs((p[0] - a[0]) * dz - (p[1] - a[1]) * dx) / L if L else math.hypot(p[0] - a[0], p[1] - a[1])
        if d > best:
            best, bi = d, i
    if best <= eps:
        return [a, b]
    return dp(pts[:bi + 1], eps)[:-1] + dp(pts[bi:], eps)


def clip_line(pts, r):
    """Pieces of a polyline inside rect r = (x1, z1, x2, z2) (Liang-Barsky per segment)."""
    x1, z1, x2, z2 = r
    runs, cur = [], []
    for i in range(len(pts) - 1):
        (ax, az), (bx, bz) = pts[i], pts[i + 1]
        dx, dz = bx - ax, bz - az
        t0, t1, ok = 0.0, 1.0, True
        for p, q in ((-dx, ax - x1), (dx, x2 - ax), (-dz, az - z1), (dz, z2 - az)):
            if p == 0:
                if q < 0:
                    ok = False
                    break
            else:
                t = q / p
                if p < 0:
                    t0 = max(t0, t)
                else:
                    t1 = min(t1, t)
        if not ok or t0 > t1:
            if cur:
                runs.append(cur)
                cur = []
            continue
        s = (ax + dx * t0, az + dz * t0)
        e = (ax + dx * t1, az + dz * t1)
        if not cur:
            cur = [s]
        elif math.hypot(cur[-1][0] - s[0], cur[-1][1] - s[1]) > 1e-6:
            runs.append(cur)
            cur = [s]
        cur.append(e)
        if t1 < 1:
            runs.append(cur)
            cur = []
    if cur:
        runs.append(cur)
    return [r for r in runs if len(r) >= 2 and sum(math.hypot(r[i + 1][0] - r[i][0], r[i + 1][1] - r[i][1]) for i in range(len(r) - 1)) > 0.5]


def clip_poly(poly, r):
    """Sutherland-Hodgman against rect r."""
    x1, z1, x2, z2 = r
    out = poly
    for inside, cut in (
        (lambda p: p[0] >= x1, lambda a, b: (x1, a[1] + (b[1] - a[1]) * (x1 - a[0]) / (b[0] - a[0]))),
        (lambda p: p[0] <= x2, lambda a, b: (x2, a[1] + (b[1] - a[1]) * (x2 - a[0]) / (b[0] - a[0]))),
        (lambda p: p[1] >= z1, lambda a, b: (a[0] + (b[0] - a[0]) * (z1 - a[1]) / (b[1] - a[1]), z1)),
        (lambda p: p[1] <= z2, lambda a, b: (a[0] + (b[0] - a[0]) * (z2 - a[1]) / (b[1] - a[1]), z2)),
    ):
        src, out = out, []
        if not src:
            break
        for i, cur in enumerate(src):
            prev = src[i - 1]
            if inside(cur):
                if not inside(prev):
                    out.append(cut(prev, cur))
                out.append(cur)
            elif inside(prev):
                out.append(cut(prev, cur))
    return out if len(out) >= 3 and abs(area(out)) > 1 else []


BIG = 1e7


def outside_windows(hole):
    """Four rects that together cover everything outside `hole`."""
    x1, z1, x2, z2 = hole
    return [(-BIG, -BIG, x1, BIG), (x2, -BIG, BIG, BIG), (x1, -BIG, x2, z1), (x1, z2, x2, BIG)]


def area(poly):
    return sum(poly[i - 1][0] * p[1] - p[0] * poly[i - 1][1] for i, p in enumerate(poly)) / 2


def centroid(poly):
    a = area(poly)
    if abs(a) < 1e-9:
        return (sum(p[0] for p in poly) / len(poly), sum(p[1] for p in poly) / len(poly))
    cx = cz = 0.0
    for i, p in enumerate(poly):
        q = poly[i - 1]
        c = q[0] * p[1] - p[0] * q[1]
        cx += (q[0] + p[0]) * c
        cz += (q[1] + p[1]) * c
    return (cx / (6 * a), cz / (6 * a))


def inside(poly, x, z):
    hit = False
    for i, p in enumerate(poly):
        q = poly[i - 1]
        if (p[1] > z) != (q[1] > z) and x < (q[0] - p[0]) * (z - p[1]) / (q[1] - p[1]) + p[0]:
            hit = not hit
    return hit


def hull(pts):
    pts = sorted(set(pts))
    if len(pts) < 3:
        return pts
    def half(seq):
        h = []
        for p in seq:
            while len(h) >= 2 and (h[-1][0] - h[-2][0]) * (p[1] - h[-2][1]) - (h[-1][1] - h[-2][1]) * (p[0] - h[-2][0]) <= 0:
                h.pop()
            h.append(p)
        return h
    lo, up = half(pts), half(reversed(pts))
    return lo[:-1] + up[:-1]


def min_rect(poly):
    """Smallest-area rectangle around a polygon: (cx, cz, w, d, ry), ry as three.js rotation.y."""
    h = hull([tuple(p) for p in poly])
    best = None
    for i in range(len(h)):
        a, b = h[i], h[(i + 1) % len(h)]
        ang = math.atan2(b[1] - a[1], b[0] - a[0])
        c, s = math.cos(ang), math.sin(ang)
        us = [p[0] * c + p[1] * s for p in h]
        vs = [-p[0] * s + p[1] * c for p in h]
        ar = (max(us) - min(us)) * (max(vs) - min(vs))
        if best is None or ar < best[0]:
            best = (ar, ang, min(us), max(us), min(vs), max(vs))
    _, ang, u0, u1, v0, v1 = best
    c, s = math.cos(ang), math.sin(ang)
    um, vm = (u0 + u1) / 2, (v0 + v1) / 2
    cx, cz = um * c - vm * s, um * s + vm * c
    # local +X along the edge direction (cos ang, sin ang) = three.js (cos ry, -sin ry) -> ry = -ang
    return cx, cz, u1 - u0, v1 - v0, -ang


def seg_dist(x, z, a, b):
    dx, dz = b[0] - a[0], b[1] - a[1]
    L2 = dx * dx + dz * dz
    t = 0 if L2 == 0 else max(0, min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2))
    return math.hypot(x - a[0] - t * dx, z - a[1] - t * dz)


def offset(pts, d):
    out = []
    for i, p in enumerate(pts):
        a, b = pts[max(0, i - 1)], pts[min(len(pts) - 1, i + 1)]
        dx, dz = b[0] - a[0], b[1] - a[1]
        L = math.hypot(dx, dz) or 1
        out.append((p[0] - dz / L * d, p[1] + dx / L * d))
    return out


class Grid:
    """Uniform grid of items by bounding box."""
    def __init__(self, cell=100):
        self.cell, self.cells = cell, {}

    def add(self, item, x1, z1, x2, z2):
        c = self.cell
        for i in range(int(math.floor(x1 / c)), int(math.floor(x2 / c)) + 1):
            for j in range(int(math.floor(z1 / c)), int(math.floor(z2 / c)) + 1):
                self.cells.setdefault((i, j), []).append(item)

    def near(self, x, z, r=0):
        c, seen = self.cell, set()
        for i in range(int(math.floor((x - r) / c)), int(math.floor((x + r) / c)) + 1):
            for j in range(int(math.floor((z - r) / c)), int(math.floor((z + r) / c)) + 1):
                for it in self.cells.get((i, j), ()):
                    if id(it) not in seen:
                        seen.add(id(it))
                        yield it


def rnd(key):
    """Deterministic 0..1 from a string (stable across runs and machines)."""
    return int(hashlib.md5(key.encode()).hexdigest()[:8], 16) / 0xFFFFFFFF


# ---------------------------------------------------------------- hand-built hole (read from the JS data)
def read_js_array(path, name):
    with open(path) as f:
        src = f.read()
    m = re.search(r"export const %s = \[(.*?)\n\];" % name, src, re.S)
    return m.group(1) if m else ""


def hand_built():
    nearby = os.path.join(GAME, "nearby.js")
    lot = os.path.join(GAME, "home_lot.js")
    with open(nearby) as f:
        src = f.read()
    reg = re.search(r"REGION = \{ x1: (-?\d+), z1: (-?\d+), x2: (-?\d+), z2: (-?\d+) \}", src)
    region = tuple(int(v) for v in reg.groups())
    footprints = []  # measured buildings as rect polygons
    for m in re.finditer(r"\{ x: (-?[\d.]+), z: (-?[\d.]+), w: ([\d.]+), d: ([\d.]+)(?:, ry: (-?[\d.]+))?", read_js_array(nearby, "BUILDINGS")):
        x, z, w, d = (float(v) for v in m.groups()[:4])
        ry = float(m.group(5) or 0)
        c, s = math.cos(ry), math.sin(ry)
        corners = [(-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2)]
        footprints.append([(x + u * c + v * s, z - u * s + v * c) for u, v in corners])
    for arr in ("BUILDINGS", "NEIGHBORS"):
        for m in re.finditer(r"x1: (-?\d+), z1: (-?\d+), x2: (-?\d+), z2: (-?\d+)", read_js_array(lot, arr)):
            x1, z1, x2, z2 = (float(v) for v in m.groups())
            footprints.append([(x1, z1), (x2, z1), (x2, z2), (x1, z2)])
    # hand-drawn stands of trees: anything a footprint finds in there is hidden by the trees anyway
    stands = []
    for path, arr in ((nearby, "WOODS"), (lot, "WOODS")):
        for m in re.finditer(r"x1: (-?\d+), z1: (-?\d+), x2: (-?\d+), z2: (-?\d+)", read_js_array(path, arr)):
            stands.append(tuple(float(v) for v in m.groups()))
    return region, footprints, stands


# ---------------------------------------------------------------- bake
def bake(s, osm):
    proj = s["proj"]
    B = s["bounds_ft"]
    region, measured, stands = hand_built()
    holes = outside_windows(region)
    out_of_hole = lambda x, z: not (region[0] <= x <= region[2] and region[1] <= z <= region[3])

    def ft_line(geom):
        return [to_ft(proj, p["lat"], p["lon"]) for p in geom]

    roads, walks, areas, rails, rivers, buildings = [], [], [], [], [], []
    nodes = {"stop": [], "traffic_signals": [], "street_lamp": [], "tree": [], "pole": []}
    node_roads = {}   # osm node id -> [(road, index along its points)]

    for el in osm["elements"]:
        t = el.get("tags", {})
        if el["type"] == "node":
            x, z = to_ft(proj, el["lat"], el["lon"])
            kind = t.get("highway") or ("tree" if t.get("natural") == "tree" else "pole" if t.get("power") == "pole" else None)
            if kind in nodes:
                nodes[kind].append((x, z))
            continue
        if el["type"] == "relation":
            # a water multipolygon's outer ring comes as several ways: stitch them end to end
            parts = [ft_line(m["geometry"]) for m in el.get("members", []) if m.get("role") == "outer" and m.get("geometry")]
            while parts:
                ring = parts.pop(0)
                grew = True
                while grew and ring[0] != ring[-1]:
                    grew = False
                    for k, pt in enumerate(parts):
                        if pt[0] == ring[-1]:
                            ring += pt[1:]
                        elif pt[-1] == ring[-1]:
                            ring += pt[::-1][1:]
                        else:
                            continue
                        parts.pop(k)
                        grew = True
                        break
                if len(ring) >= 4 and ring[0] == ring[-1]:
                    areas.append(("water", ring[:-1]))
            continue
        geom = el.get("geometry")
        if not geom:
            continue
        pts = ft_line(geom)
        hw = t.get("highway")
        if hw in ROADS:
            look, w = ROADS[hw]
            if hw == "service":
                w = SERVICE_W.get(t.get("service"), w)
                if t.get("service") == "driveway":
                    look = "drive"
            if t.get("area") == "yes" or t.get("tunnel") in ("yes", "culvert"):
                continue
            roads.append({"look": look, "w": w, "pts": pts, "cls": hw, "nodes": el.get("nodes", [])})
            for i, nid in enumerate(el.get("nodes", [])):
                node_roads.setdefault(nid, []).append((roads[-1], i))
        elif hw == "footway" and t.get("footway") == "sidewalk":
            walks.append(pts)
        elif "building" in t and len(pts) >= 4:
            buildings.append({"poly": pts[:-1] if pts[0] == pts[-1] else pts, "osm": t})
        elif t.get("railway") == "rail":
            rails.append(pts)
        elif t.get("waterway") in ("river", "stream", "canal"):
            rivers.append((40 if t["waterway"] == "river" else 8, pts))
        else:
            for key in ("landuse", "natural", "leisure", "amenity"):
                kind = AREAS.get(t.get(key))
                if kind and len(pts) >= 4 and pts[0] == pts[-1]:
                    areas.append((kind, pts[:-1]))
                    break

    # ---- buildings: OSM first, then footprints OSM doesn't already have ----
    bgrid = Grid(200)
    kept = []
    def add_building(poly, height, kind):
        cx, cz = centroid(poly)
        xs, zs = [p[0] for p in poly], [p[1] for p in poly]
        b = {"poly": poly, "h": height, "kind": kind, "c": (cx, cz)}
        kept.append(b)
        bgrid.add(b, min(xs), min(zs), max(xs), max(zs))

    def covered(cx, cz):
        return any(inside(o["poly"], cx, cz) for o in bgrid.near(cx, cz, 1))

    # a footprint is the same building as a measured one if either's middle is in
    # the other (the measured boxes are eyeballed, so give them 12 ft of slack)
    grown = [[(x + (12 if x > centroid(m)[0] else -12), z + (12 if z > centroid(m)[1] else -12)) for x, z in m] for m in measured]
    def on_measured(cx, cz, poly=None):
        if any(inside(m, cx, cz) for m in grown):
            return True
        if any(x1 <= cx <= x2 and z1 <= cz <= z2 for x1, z1, x2, z2 in stands):
            return True
        return poly is not None and any(inside(poly, *centroid(m)) for m in measured)

    for b in buildings:
        poly = b["poly"]
        cx, cz = centroid(poly)
        if not (B[0] <= cx <= B[2] and B[1] <= cz <= B[3]) or on_measured(cx, cz, poly):
            continue
        t = b["osm"]
        h = None
        m = re.match(r"\s*([\d.]+)", str(t.get("height", "")))
        if m:
            h = float(m.group(1)) * 3.28084
        m = re.match(r"\s*([\d.]+)", str(t.get("building:levels", "")))
        if not h and m:
            h = float(m.group(1)) * 11 + 4
        add_building(poly, h, t.get("building"))
    n_osm = len(kept)

    for path in sorted(p for g in s["footprints"] for p in glob.glob(os.path.join(ROOT, g))):
        with gzip.open(path, "rt") as f:
            for line in f:
                feat = json.loads(line)
                ring = feat["geometry"]["coordinates"][0]
                lon, lat = ring[0]
                x, z = to_ft(proj, lat, lon)
                if not (B[0] - 300 <= x <= B[2] + 300 and B[1] - 300 <= z <= B[3] + 300):
                    continue
                poly = [to_ft(proj, la, lo) for lo, la in ring]
                if poly[0] == poly[-1]:
                    poly = poly[:-1]
                cx, cz = centroid(poly)
                if not (B[0] <= cx <= B[2] and B[1] <= cz <= B[3]):
                    continue
                if abs(area(poly)) < 120 or covered(cx, cz) or on_measured(cx, cz, poly):
                    continue
                hm = feat["properties"].get("height", -1)
                add_building(poly, hm * 3.28084 if hm and hm > 0 else None, None)
    print(f"buildings: {n_osm} from OSM, {len(kept) - n_osm} from footprints")

    # ---- shape every building: near-rectangles become boxes with roofs, the rest extrude ----
    houses, blocks = [], []
    for b in kept:
        poly = dp(b["poly"] + [b["poly"][0]], 1.0)[:-1]
        if len(poly) < 3:
            continue
        a = abs(area(poly))
        cx, cz, w, d, ry = min_rect(poly)
        rect = a / max(w * d, 1)
        key = f"{round(cx)},{round(cz)}"
        h = b["h"]
        commercial = a > 6000 or (b["kind"] or "") in ("commercial", "retail", "industrial", "warehouse", "school", "church", "hospital", "office", "public", "civic")
        if not h or h < 8:
            h = (14 + rnd(key + "h") * 8) if commercial else (15 + rnd(key + "h") * 5 if a < 2600 else 22)
        h = min(h, 90)
        if rect > 0.82 or a < 1500:
            roof = 1 if commercial else (2 if a > 3200 else 0)    # 0 gable, 1 flat, 2 low hip
            houses.append([round(cx, 1), round(cz, 1), round(w, 1), round(d, 1), round(ry, 3), round(h, 1), roof,
                           int(rnd(key + "c") * 8), int(rnd(key + "r") * 6), 1 if commercial else 0])
        else:
            blocks.append([[(round(x, 1), round(z, 1)) for x, z in poly], round(h, 1), int(rnd(key + "c") * 5)])

    # ---- roads: cut out of the hand-built hole; curbs and furniture on the rest ----
    rgrid = Grid(100)
    for r in roads:
        for i in range(len(r["pts"]) - 1):
            a, b = r["pts"][i], r["pts"][i + 1]
            rgrid.add((r, a, b), min(a[0], b[0]) - r["w"] / 2, min(a[1], b[1]) - r["w"] / 2, max(a[0], b[0]) + r["w"] / 2, max(a[1], b[1]) + r["w"] / 2)
    lots = [p for k, p in areas if k == "lot"]
    lgrid = Grid(200)
    for p in lots:
        xs, zs = [q[0] for q in p], [q[1] for q in p]
        lgrid.add(p, min(xs), min(zs), max(xs), max(zs))

    def near_other_road(x, z, me, pad):
        for (r, a, b) in rgrid.near(x, z, 60):
            if r is not me and seg_dist(x, z, a, b) < r["w"] / 2 + pad:
                return True
        return False

    def in_lot(x, z):
        return any(inside(p, x, z) for p in lgrid.near(x, z, 1))

    curbs = []
    for r in roads:
        if r["look"] not in CURBED:
            continue
        for side in (-1, 1):
            line = offset(r["pts"], side * (r["w"] / 2 + 0.3))
            for i in range(len(line) - 1):
                (x1, z1), (x2, z2) = line[i], line[i + 1]
                L = math.hypot(x2 - x1, z2 - z1)
                n = max(1, math.ceil(L / 8))
                run = None
                for k in range(n + 1):
                    t = (k + 0.5) / n
                    x, z = x1 + (x2 - x1) * t, z1 + (z2 - z1) * t
                    gap = k == n or not out_of_hole(x, z) or near_other_road(x, z, r, 2) or in_lot(x, z)
                    if not gap and run is None:
                        run = k
                    if gap and run is not None:
                        a, b = run / n, k / n
                        curbs.append(((x1 + (x2 - x1) * a, z1 + (z2 - z1) * a), (x1 + (x2 - x1) * b, z1 + (z2 - z1) * b)))
                        run = None

    # utility poles with street lights along the bigger streets, every ~180 ft on one side
    props = []
    for r in roads:
        if r["look"] != "collector":
            continue
        line = offset(r["pts"], r["w"] / 2 + 7)
        acc = 90.0
        for i in range(len(line) - 1):
            (x1, z1), (x2, z2) = line[i], line[i + 1]
            L = math.hypot(x2 - x1, z2 - z1)
            while acc < L:
                x, z = x1 + (x2 - x1) * acc / L, z1 + (z2 - z1) * acc / L
                acc += 180
                if not out_of_hole(x, z) or near_other_road(x, z, r, 10) or in_lot(x, z):
                    continue
                if any(inside(o["poly"], x, z) for o in bgrid.near(x, z, 4)):
                    continue
                # the light reaches back over the street: the arm (the pole's local -z)
                # points at the centerline, which is at (tz, -tx) from here
                tx, tz = (x2 - x1) / L, (z2 - z1) / L
                props.append(("pole", x, z, math.atan2(-tz, tx)))
            acc -= L

    # stop signs where a minor street meets a bigger one (plus any OSM mapped)
    rank = {"collector": 3, "res": 2, "service": 1, "drive": 0, "track": 0}
    for nid, lst in node_roads.items():
        if len(lst) < 2:
            continue
        top = max(rank[r["look"]] for r, _ in lst)
        if top < 3:
            continue
        wmajor = max(r["w"] for r, _ in lst if rank[r["look"]] == 3)
        for r, i in lst:
            if r["look"] != "res":
                continue
            p = r["pts"][i]
            for j in (i - 1, i + 1):   # each approach along the minor street
                if 0 <= j < len(r["pts"]):
                    q = r["pts"][j]
                    L = math.hypot(q[0] - p[0], q[1] - p[1])
                    if L < wmajor / 2 + 12:
                        continue
                    ux, uz = (q[0] - p[0]) / L, (q[1] - p[1]) / L   # from the corner back up the approach
                    back = wmajor / 2 + 8
                    # traffic drives toward the corner (direction -u); its right is (uz, -ux)... sign on the right
                    x = p[0] + ux * back + uz * (r["w"] / 2 + 3)
                    z = p[1] + uz * back - ux * (r["w"] / 2 + 3)
                    if out_of_hole(x, z):
                        props.append(("stop", x, z, math.atan2(ux, uz)))
    for x, z in nodes["stop"]:
        if out_of_hole(x, z) and not any(abs(p[1] - x) < 20 and abs(p[2] - z) < 20 for p in props if p[0] == "stop"):
            props.append(("stop", x, z, 0.0))
    for x, z in nodes["street_lamp"]:
        if out_of_hole(x, z):
            props.append(("lamp", x, z, 0.0))
    # signal masts at the four corners of each signalled crossing, arms over the lanes
    done = []
    for x, z in nodes["traffic_signals"]:
        if not out_of_hole(x, z) or any(math.hypot(x - a, z - b) < 80 for a, b in done):
            continue
        done.append((x, z))
        best = None
        for (r, a, b) in rgrid.near(x, z, 10):
            if seg_dist(x, z, a, b) < 3 and (best is None or r["w"] > best[0]["w"]):
                best = (r, a, b)
        ang = math.atan2(best[2][1] - best[1][1], best[2][0] - best[1][0]) if best else 0.0
        w = best[0]["w"] if best else 40
        c, s2 = math.cos(ang), math.sin(ang)
        for su, sv in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
            u, v = su * (w / 2 + 8), sv * (w / 2 + 8)
            px, pz = x + u * c - v * s2, z + u * s2 + v * c
            props.append(("signal", px, pz, math.atan2(px - x, pz - z)))   # arm toward the middle

    # ---- trees: mapped ones, woods filled on a jittered grid, and some yard trees ----
    trees = [(x, z, 9 + rnd(f"t{x:.0f},{z:.0f}") * 5) for x, z in nodes["tree"]]
    for kind, poly in areas:
        if kind != "wood":
            continue
        xs, zs = [p[0] for p in poly], [p[1] for p in poly]
        step = 34
        gx = math.floor(min(xs) / step) * step
        while gx < max(xs):
            gz = math.floor(min(zs) / step) * step
            while gz < max(zs):
                k = f"w{gx},{gz}"
                x, z = gx + (rnd(k + "x") - 0.5) * 20, gz + (rnd(k + "z") - 0.5) * 20
                if rnd(k) > 0.2 and inside(poly, x, z):
                    trees.append((x, z, 10 + rnd(k + "r") * 5))
                gz += step
            gx += step
    for hs in houses:
        if hs[9] or rnd(f"y{hs[0]},{hs[1]}") > 0.4:
            continue
        x, z, w, d, ry = hs[:5]
        side = 1 if rnd(f"s{hs[0]}") > 0.5 else -1
        tx, tz = x + math.cos(ry) * (w / 2 + 14) * side, z - math.sin(ry) * (w / 2 + 14) * side
        trees.append((tx, tz, 8 + rnd(f"r{hs[0]}") * 4))

    def tree_ok(x, z):
        if not out_of_hole(x, z) or near_other_road(x, z, None, 5) or in_lot(x, z):
            return False
        return not any(inside(o["poly"], x, z) for o in bgrid.near(x, z, 15))
    trees = [t for t in trees if B[0] <= t[0] <= B[2] and B[1] <= t[1] <= B[3] and tree_ok(t[0], t[1])]

    # ---- chunk it all ----
    chunks = {}
    def chunk(i, j):
        return chunks.setdefault((i, j), {"roads": [], "curbs": [], "walks": [], "areas": [], "rails": [], "rivers": [],
                                          "houses": [], "blocks": [], "trees": [], "props": []})

    def chunk_rect(i, j):
        return (i * CHUNK, j * CHUNK, (i + 1) * CHUNK, (j + 1) * CHUNK)

    I0, J0 = math.floor(B[0] / CHUNK), math.floor(B[1] / CHUNK)
    I1, J1 = math.floor(B[2] / CHUNK), math.floor(B[3] / CHUNK)
    q = lambda v: round(v)

    def lines_into(pts, key, extra, simplify=1.0):
        pts = dp(pts, simplify)
        for win in holes:
            for run in clip_line(pts, win):
                xs, zs = [p[0] for p in run], [p[1] for p in run]
                for i in range(max(I0, math.floor(min(xs) / CHUNK)), min(I1, math.floor(max(xs) / CHUNK)) + 1):
                    for j in range(max(J0, math.floor(min(zs) / CHUNK)), min(J1, math.floor(max(zs) / CHUNK)) + 1):
                        for piece in clip_line(run, chunk_rect(i, j)):
                            chunk(i, j)[key].append(extra + [[q(c) for p in piece for c in p]])

    def polys_into(poly, key, extra):
        for win in holes:
            part = clip_poly(poly, win)
            if not part:
                continue
            xs, zs = [p[0] for p in part], [p[1] for p in part]
            for i in range(max(I0, math.floor(min(xs) / CHUNK)), min(I1, math.floor(max(xs) / CHUNK)) + 1):
                for j in range(max(J0, math.floor(min(zs) / CHUNK)), min(J1, math.floor(max(zs) / CHUNK)) + 1):
                    piece = clip_poly(part, chunk_rect(i, j))
                    if piece:
                        chunk(i, j)[key].append(extra + [[q(c) for p in piece for c in p]])

    def point_chunk(x, z):
        i, j = math.floor(x / CHUNK), math.floor(z / CHUNK)
        return chunk(i, j) if I0 <= i <= I1 and J0 <= j <= J1 else None

    for r in roads:
        lines_into(r["pts"], "roads", [r["look"], r["w"]])
    for w in walks:
        lines_into(w, "walks", [5])
    for pts in rails:
        lines_into(pts, "rails", [])
    for w, pts in rivers:
        lines_into(pts, "rivers", [w])
    for kind in AREA_ORDER:
        for k, poly in areas:
            if k == kind:
                polys_into(dp(poly + [poly[0]], 1.5)[:-1], "areas", [kind])
    for (a, b) in curbs:
        c = point_chunk((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        if c is not None:
            c["curbs"].append([q(a[0]), q(a[1]), q(b[0]), q(b[1])])
    for hs in houses:
        c = point_chunk(hs[0], hs[1])
        if c is not None:
            c["houses"].append(hs)
    for poly, h, col in blocks:
        cx, cz = centroid(poly)
        c = point_chunk(cx, cz)
        if c is not None:
            c["blocks"].append([[c2 for p in poly for c2 in p], h, col])
    for x, z, r in trees:
        c = point_chunk(x, z)
        if c is not None:
            c["trees"].append([q(x), q(z), round(r, 1)])
    for kind, x, z, ry in props:
        c = point_chunk(x, z)
        if c is not None:
            c["props"].append([kind, round(x, 1), round(z, 1), round(ry, 3)])
    return chunks, road_graph(roads, B)


# ---------------------------------------------------------------- road graph (minimap + routing)
GRAPH_CLASS = {"collector": 0, "res": 1, "service": 2, "drive": 3}


def road_graph(roads, B, pad=400):
    """The drivable streets as a graph: a vertex wherever ways meet or end, an
    edge (with its simplified shape) between. Unlike the chunks, the hand-built
    blocks aren't cut out: the minimap and the router need the whole town.

    Returns {"nodes": [x, z, ...], "edges": [[a, b, class, [x, z, ...between]], ...]}."""
    use = [r for r in roads if r["look"] in GRAPH_CLASS and len(r["nodes"]) == len(r["pts"]) >= 2]
    seen = {}
    for r in use:
        for k, nid in enumerate(r["nodes"]):
            # ends always split; a node used twice (two ways, or a way crossing itself) is a junction
            seen[nid] = seen.get(nid, 0) + (2 if k in (0, len(r["nodes"]) - 1) else 1)
    index, nodes, edges = {}, [], []

    def vertex(nid, p):
        if nid not in index:
            index[nid] = len(nodes) // 2
            nodes.extend((round(p[0]), round(p[1])))
        return index[nid]

    inb = lambda p: B[0] - pad <= p[0] <= B[2] + pad and B[1] - pad <= p[1] <= B[3] + pad
    for r in use:
        start = 0
        for k in range(1, len(r["nodes"])):
            if seen[r["nodes"][k]] < 2 and k < len(r["nodes"]) - 1:
                continue
            pts = r["pts"][start:k + 1]
            if any(inb(p) for p in pts) and sum(math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) for i in range(len(pts) - 1)) > 1:
                a, b = vertex(r["nodes"][start], pts[0]), vertex(r["nodes"][k], pts[-1])
                mid = dp(pts, 2.5)[1:-1]
                edges.append([a, b, GRAPH_CLASS[r["look"]], [round(c) for p in mid for c in p]])
            start = k
    print(f"road graph: {len(nodes) // 2} vertices, {len(edges)} edges")
    return {"nodes": nodes, "edges": edges}


def write(chunks, graph, bounds):
    os.makedirs(OUT, exist_ok=True)
    for f in glob.glob(os.path.join(OUT, "c_*.json")):
        os.remove(f)
    index, total = [], 0
    for (i, j), c in sorted(chunks.items()):
        c = {k: v for k, v in c.items() if v}
        if not c:
            continue
        name = f"c_{i}_{j}.json"
        body = json.dumps(c, separators=(",", ":"))
        with open(os.path.join(OUT, name), "w") as f:
            f.write(body)
        index.append([i, j])
        total += len(body)
    with open(os.path.join(OUT, "index.json"), "w") as f:
        json.dump({"v": 1, "chunk": CHUNK, "bounds": bounds, "chunks": index}, f, separators=(",", ":"))
    with open(os.path.join(OUT, "roads.json"), "w") as f:
        body = json.dumps({"v": 1, **graph}, separators=(",", ":"))
        f.write(body)
    print(f"{len(index)} chunks, {total / 1e6:.2f} MB; roads.json {len(body) / 1e3:.0f} kB")


def main():
    s = load_settings()
    osm = fetch_osm(s, "--refresh" in sys.argv)
    chunks, graph = bake(s, osm)
    write(chunks, graph, s["bounds_ft"])


if __name__ == "__main__":
    main()
