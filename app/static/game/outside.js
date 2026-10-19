/*
The outdoor area: the home lot from home_lot.js, built in the apartment's
look (toon materials, ink lines, the same daylight and sky haze).

Almost everything static is merged into one vertex-colored mesh
(batch.js), so the whole site costs a handful of draw calls even with the
ink pass rendering it twice. Things that change stay separate: the two
apartment buildings and the yard trees (they cut away), and the RAV4
(it'll drive in the next phase).

Dollhouse cutaway: the camera keeps the apartment's high, north-up angle,
so a building (or tree) can end up between it and the player. When one
does, its walls sink to the apartment's 4 ft cutaway height, the roof
comes off, and a hollow version with cream partition walls and carpet
takes its place, the same trick that makes the apartment readable.
*/import * as THREE from 'three';
import { pencil, addLights, followSun, LABEL_FONT } from './pencil.js';
import { createBatch } from './batch.js';
import { createRav4, drawParkedCar } from './car.js';
import * as LOT from './home_lot.js';

const SKY = 0xdde9ec;            // same haze as the apartment
const GRASS = 0xa9c98b;
const ASPHALT = 0x7d8188;
const LOT_ASPHALT = 0x8f9399;
const CONCRETE = 0xbcb8b0;
const WALK = 0xdcd8cf;
const CURB = 0xe6e2d9;
const PAINT = 0xf4f1ea;
const YELLOW = 0xe3b04b;
const SIDING = 0xa7b6c4;
const TRIM = 0xf4f2ec;
const ROOF = 0x7f6a5d;
const ROOF_DARK = 0x6a574b;
const FOUND = 0x9a938a;          // apartment balcony floor
const GLASS = 0xbcd3e0;          // apartment window glass
const DOOR = 0x3b2419;           // apartment front door
const RAIL = 0x5e5650;           // apartment balcony rail
const WALL_C = 0xfbf5e6;         // apartment interior walls (for the cutaway)
const CARPET = 0xe6c99a;         // apartment floor
const HALL = 0xcfd4d6;           // apartment tile
const TRUNK = 0x6b4a2f;
const LEAVES = [0x4c8f45, 0x3f7e3a, 0x5f9e4f, 0x56994a];
const POLE = 0x5e5a55;
const WOOD_POLE = 0x7a5a3c;
const LENS = 0xfff6d8;
// no silver: the only silver car in the lot is yours
const CAR_COLORS = [0xf2f0eb, 0x232326, 0x8c2c2d, 0x2b4e91, 0xcdbb98, 0x4d5156, 0x355e44, 0x5a3622];
const CAR_KINDS = ['sedan', 'suv', 'hatch', 'sedan', 'suv', 'sedan'];

const CUT_H = 4;          // matches the apartment's cutaway walls
const WALK_H = 0.25;      // sidewalks and walks are a step up from the grass
const RUN = 13;           // ft/s on foot outside (a jog; the apartment walks at 6.5)

// small deterministic PRNG so the woods grow the same way every load
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// a triangle/polygon extruded along +z by `depth` (roof attics, cross gables)
function prism(points, depth) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
}

// polyline offset sideways by d (positive = to the right of travel, looking down +y)
function offsetLine(pts, d) {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz) || 1;
    return [p[0] - (dz / len) * d, p[1] + (dx / len) * d];
  });
}

function distToLine(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, z1] = pts[i], [x2, z2] = pts[i + 1];
    const dx = x2 - x1, dz = z2 - z1;
    const t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - x1 - t * dx, z - z1 - t * dz));
  }
  return best;
}

const inRect = (x, z, [x1, z1, x2, z2], pad = 0) =>
  x >= x1 - pad && x <= x2 + pad && z >= z1 - pad && z <= z2 + pad;


// ---- ground: streets, curbs, sidewalks, lot ----

function drawStreets(b) {
  // driveway mouths break the curb
  const gaps = [LOT.PAVING[2], ...LOT.NEIGHBOR_LOTS];
  for (const s of LOT.STREETS) {
    b.ribbon(s.pts, s.w, 0.02, ASPHALT);
    if (s.yellow) {
      for (const d of [-0.45, 0.45]) b.ribbon(offsetLine(s.pts, d), 0.32, 0.05, YELLOW, false);
    }
    if (!s.curbs) continue;
    for (const side of [-1, 1]) {
      const line = offsetLine(s.pts, side * (s.w / 2 + 0.3));
      for (let i = 0; i < line.length - 1; i++) {
        const [x1, z1] = line[i], [x2, z2] = line[i + 1];
        const len = Math.hypot(x2 - x1, z2 - z1);
        const n = Math.ceil(len / 8);
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n;
          const cx = x1 + (x2 - x1) * t, cz = z1 + (z2 - z1) * t;
          // no curb across driveways or where another street crosses
          if (gaps.some((r) => inRect(cx, cz, r, 2))) continue;
          if (LOT.STREETS.some((o) => o !== s && distToLine(cx, cz, o.pts) < o.w / 2 + 2)) continue;
          b.geo(new THREE.BoxGeometry(0.6, 0.45, len / n + 0.05), CURB, cx, 0.225, cz, Math.atan2(x2 - x1, z2 - z1));
        }
      }
    }
  }
  // stop bar in the avenue's northbound lane, before the cross street
  b.flat(-162, 0.05, -201, 13, 1.4, PAINT);
}

function drawWalks(b) {
  for (const s of LOT.SIDEWALKS) {
    for (let i = 0; i < s.pts.length - 1; i++) {
      const [x1, z1] = s.pts[i], [x2, z2] = s.pts[i + 1];
      const len = Math.hypot(x2 - x1, z2 - z1);
      b.geo(new THREE.BoxGeometry(s.w, WALK_H, len), WALK, (x1 + x2) / 2, WALK_H / 2, (z1 + z2) / 2, Math.atan2(x2 - x1, z2 - z1));
      if (i > 0) b.cyl(x1, 0, z1, s.w / 2, WALK_H, WALK, 12);
    }
  }
  for (const [x1, z1, x2, z2] of LOT.WALKS) b.box((x1 + x2) / 2, 0, (z1 + z2) / 2, x2 - x1, WALK_H, z2 - z1, WALK);
}

// a curb along an axis-aligned edge, skipping [a, b] gaps measured along it
function curbLine(b, x1, z1, x2, z2, gaps = []) {
  const alongX = z1 === z2;
  const lo = alongX ? x1 : z1, hi = alongX ? x2 : z2;
  const cuts = [lo, ...gaps.flat(), hi];
  for (let i = 0; i < cuts.length; i += 2) {
    const a = cuts[i], c = cuts[i + 1];
    if (c - a < 0.5) continue;
    const mid = (a + c) / 2;
    if (alongX) b.box(mid, 0, z1, c - a, 0.4, 0.5, CURB);
    else b.box(x1, 0, mid, 0.5, 0.4, c - a, CURB);
  }
}

function drawLot(b) {
  for (const [x1, z1, x2, z2] of LOT.PAVING) b.box((x1 + x2) / 2, 0, (z1 + z2) / 2, x2 - x1, 0.05, z2 - z1, CONCRETE);
  for (const [x1, z1, x2, z2] of LOT.NEIGHBOR_LOTS) b.box((x1 + x2) / 2, 0, (z1 + z2) / 2, x2 - x1, 0.04, z2 - z1, LOT_ASPHALT);

  // curbs ring the lot; walks and the driveway come through gaps
  curbLine(b, -102, -23.25, 103, -23.25, [[-99, -94], [33, 38]]);
  curbLine(b, -102, 46.25, 148, 46.25, [[35, 40]]);
  curbLine(b, -102.25, -23, -102.25, 46, [[-2, 20]]);
  curbLine(b, 148.25, -129, 148.25, 46);
  curbLine(b, 102.75, -129, 102.75, -23);
  curbLine(b, 103, -129.25, 148, -129.25);

  // stall stripes
  for (const r of LOT.STALL_ROWS) {
    const [a0, a1] = r.at, mid = (a0 + a1) / 2, len = a1 - a0;
    for (let u = r.from; u <= r.to + 0.01; u += 9) {
      if (r.axis === 'x') b.flat(u, 0.08, mid, 0.4, len, PAINT);
      else b.flat(mid, 0.08, u, len, 0.4, PAINT);
    }
  }
}

function stallSpot(rowIndex, stall) {
  const r = LOT.STALL_ROWS[rowIndex];
  const u = r.from + 4.5 + 9 * stall, across = (r.at[0] + r.at[1]) / 2;
  return r.axis === 'x' ? { x: u, z: across, heading: r.nose } : { x: across, z: u, heading: r.nose };
}

// collider footprint for a car parked at a heading that's a multiple of 90 deg
function carBox(x, z, heading, spec) {
  const sideways = Math.abs(Math.sin(heading)) > 0.5;
  const hx = (sideways ? spec.len : spec.w) / 2, hz = (sideways ? spec.w : spec.len) / 2;
  return { x1: x - hx, z1: z - hz, x2: x + hx, z2: z + hz };
}


// ---- buildings ----

// box on one face of a building, in that face's terms: u along the face,
// n outward from it (center), w along the face, d along the normal
function faceBox(b, L, D, face, u, y, n, w, h, d, color) {
  if (face === 'n') b.box(u, y, -D / 2 - n, w, h, d, color);
  else if (face === 's') b.box(u, y, D / 2 + n, w, h, d, color);
  else if (face === 'w') b.box(-L / 2 - n, y, u, d, h, w, color);
  else b.box(L / 2 + n, y, u, d, h, w, color);
}

function windowAt(b, L, D, face, u, y) {
  faceBox(b, L, D, face, u, y - 0.3, 0.08, 5.1, 4.8, 0.3, TRIM);
  faceBox(b, L, D, face, u, y, 0.12, 4.5, 4.2, 0.1, GLASS);
}

function buildBuilding(bd) {
  const L = bd.x2 - bd.x1, D = bd.z2 - bd.z1;
  const cx = (bd.x1 + bd.x2) / 2, cz = (bd.z1 + bd.z2) / 2;
  const { eave, ridge, gables } = LOT.BLDG;
  const rise = ridge - eave;
  // doors in local face coordinates
  const doors = bd.doors.map((d) => ({ side: d.side, u: d.side === 'n' || d.side === 's' ? d.at - cx : d.at - cz }));
  const nearDoor = (face, u, gap = 5) => doors.some((d) => d.side === face && Math.abs(d.u - u) < gap);
  // balconies face away from the lot (opposite the main door)
  const back = { n: 's', s: 'n' }[doors[0].side];
  const units = [-62, -31, 0, 31, 62];

  // full building: walls, windows, doors, balconies
  const f = createBatch();
  f.frame(cx, cz);
  f.box(0, 0, 0, L + 0.6, 1.4, D + 0.6, FOUND);
  f.box(0, 0, 0, L, eave, D, SIDING);
  f.box(0, 10, 0, L + 0.3, 0.35, D + 0.3, TRIM);                        // floor band
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.box(sx * L / 2, 0, sz * D / 2, 0.7, eave, 0.7, TRIM);
  for (const face of ['n', 's']) {
    const spots = face === back ? [-46.5, -15.5, 15.5, 46.5] : [];
    if (face !== back) for (let u = -L / 2 + 9; u <= L / 2 - 9; u += 15.5) if (!nearDoor(face, u)) spots.push(u);
    for (const u of spots) for (const y of [3.4, 13.4]) windowAt(f, L, D, face, u, y);
  }
  for (const face of ['w', 'e']) {
    for (const u of [-D / 4, D / 4]) {
      if (nearDoor(face, u, 4)) continue;
      for (const y of [3.4, 13.4]) windowAt(f, L, D, face, u, y);
    }
  }
  for (const d of doors) {
    faceBox(f, L, D, d.side, d.u, 0, 0.03, 4.2, 7.6, 0.25, TRIM);
    faceBox(f, L, D, d.side, d.u, 0, 0.1, 3.4, 7.0, 0.3, DOOR);
    faceBox(f, L, D, d.side, d.u, 8.1, 2.2, 6.2, 0.35, 4.4, ROOF);      // little porch roof
    faceBox(f, L, D, d.side, d.u - 2.8, 0, 4.0, 0.35, 8.1, 0.35, TRIM); // posts
    faceBox(f, L, D, d.side, d.u + 2.8, 0, 4.0, 0.35, 8.1, 0.35, TRIM);
    faceBox(f, L, D, d.side, d.u + 2.7, 6.9, 0.25, 0.45, 0.6, 0.4, LENS); // porch light
  }
  for (const u of units) {
    // sliding doors on both floors, a patio below and a railed balcony above
    for (const y of [0.3, 10.4]) {
      faceBox(f, L, D, back, u + 2, y, 0.08, 6.6, 6.9, 0.3, TRIM);
      faceBox(f, L, D, back, u + 2, y + 0.3, 0.12, 6.0, 6.3, 0.1, GLASS);
    }
    faceBox(f, L, D, back, u, 0, 2.5, 11.7, 0.3, 5, FOUND);
    faceBox(f, L, D, back, u, 9.7, 2.5, 11.7, 0.4, 5, FOUND);
    faceBox(f, L, D, back, u, 10.1, 4.9, 11.7, 3.2, 0.15, RAIL);
    faceBox(f, L, D, back, u - 5.8, 10.1, 2.5, 0.15, 3.2, 5, RAIL);
    faceBox(f, L, D, back, u + 5.8, 10.1, 2.5, 0.15, 3.2, 5, RAIL);
  }
  f.endFrame();

  // roof: attic gable prism, two shingle slabs, ridge cap, fascia, cross gables
  const r = createBatch();
  r.frame(cx, cz);
  const attic = prism([[-D / 2, 0], [D / 2, 0], [0, rise]], L);
  attic.translate(0, 0, -L / 2);
  attic.rotateY(Math.PI / 2);
  r.geo(attic, SIDING, 0, eave, 0);
  const o = 1.2, slope = Math.atan2(rise, D / 2), run = D / 2 + o;
  const slab = run / Math.cos(slope);
  for (const sz of [-1, 1]) {
    r.geo(new THREE.BoxGeometry(L + 2.4, 0.5, slab), ROOF,
      0, ridge - (run / 2) * Math.tan(slope) + 0.25, sz * run / 2, 0, sz * slope);
    r.box(0, eave - o * Math.tan(slope) - 0.55, sz * run, L + 2.4, 0.6, 0.3, TRIM);   // fascia
    for (const gx of gables) {
      const gw = 9, gh = 6.8, gl = 13.4;
      const g = prism([[-gw, 0], [gw, 0], [0, gh]], 12);
      if (sz > 0) g.rotateY(Math.PI);
      r.geo(g, SIDING, gx, eave, sz * D / 2);
      const pitch = Math.atan2(gh + 0.7, gw + 1);
      const sw = Math.hypot(gw + 1, gh + 0.7);
      for (const sx of [-1, 1]) {
        r.geo(new THREE.BoxGeometry(sw, 0.45, gl), ROOF,
          gx + sx * (gw + 1) / 2, eave + (gh + 0.7) / 2 - 0.35, sz * (D / 2 + o - gl / 2), 0, 0, -sx * pitch);
      }
    }
  }
  r.box(0, ridge - 0.05, 0, L + 2.4, 0.4, 1.1, ROOF_DARK);
  r.endFrame();

  // cutaway: hollow 4 ft walls, carpeted units off a center hall, cream partitions
  const c = createBatch();
  c.frame(cx, cz);
  c.box(0, 0, 0, L - 1, 1.0, D - 1, CARPET);
  c.box(0, 1.0, 0, L - 1, 0.03, 6, HALL);
  const wallPiece = (face, a, b2) => {
    if (b2 - a < 0.3) return;
    const mid = (a + b2) / 2, len = b2 - a;
    if (face === 'n') c.box(mid, 0, -D / 2 + 0.3, len, CUT_H, 0.6, SIDING);
    else if (face === 's') c.box(mid, 0, D / 2 - 0.3, len, CUT_H, 0.6, SIDING);
    else if (face === 'w') c.box(-L / 2 + 0.3, 0, mid, 0.6, CUT_H, len, SIDING);
    else c.box(L / 2 - 0.3, 0, mid, 0.6, CUT_H, len, SIDING);
  };
  for (const face of ['n', 's', 'w', 'e']) {
    const span = face === 'n' || face === 's' ? L / 2 : D / 2;
    const cuts = doors.filter((d) => d.side === face).map((d) => d.u).sort((a, b2) => a - b2);
    let at = -span;
    for (const u of cuts) { wallPiece(face, at, u - 1.8); at = u + 1.8; }
    wallPiece(face, at, span);
  }
  for (const sz of [-1, 1]) {
    // hall walls with openings where an entry comes through
    const cuts = doors.filter((d) => d.side === 'n' || d.side === 's').map((d) => d.u).sort((a, b2) => a - b2);
    let at = -L / 2 + 0.6;
    for (const u of cuts) { c.box((at + u - 1.8) / 2, 0, sz * 3, u - 1.8 - at, CUT_H, 0.4, WALL_C); at = u + 1.8; }
    c.box((at + L / 2 - 0.6) / 2, 0, sz * 3, L / 2 - 0.6 - at, CUT_H, 0.4, WALL_C);
    for (const u of [-46.5, -15.5, 15.5, 46.5]) c.box(u, 0, sz * (D / 4 + 1.5), 0.4, CUT_H, D / 2 - 3.6, WALL_C);
  }
  for (const d of doors.filter((d) => d.side === 'n' || d.side === 's')) {
    const sz = d.side === 'n' ? -1 : 1;
    for (const sx of [-1, 1]) c.box(d.u + sx * 2.2, 0, sz * (D / 4 + 1.5), 0.4, CUT_H, D / 2 - 3.6, WALL_C);
  }
  c.endFrame();

  const full = f.build(), roof = r.build(), cut = c.build();
  cut.visible = false;

  // footprint + porch posts block; the cut box also covers porch roofs so
  // standing under one still counts as hidden
  const colliders = [{ x1: bd.x1, z1: bd.z1, x2: bd.x2, z2: bd.z2 }];
  const box = { x1: bd.x1 - o, z1: bd.z1 - o, x2: bd.x2 + o, z2: bd.z2 + o, h: ridge + 0.5 };
  for (const d of doors) {
    for (const sx of [-1, 1]) {
      const u = d.u + sx * 2.8;
      const [px, pz] = { n: [cx + u, bd.z1 - 4], s: [cx + u, bd.z2 + 4], w: [bd.x1 - 4, cz + u], e: [bd.x2 + 4, cz + u] }[d.side];
      colliders.push({ x1: px - 0.3, z1: pz - 0.3, x2: px + 0.3, z2: pz + 0.3 });
    }
    if (d.side === 'n') box.z1 = Math.min(box.z1, bd.z1 - 4.6);
    if (d.side === 's') box.z2 = Math.max(box.z2, bd.z2 + 4.6);
    if (d.side === 'w') box.x1 = Math.min(box.x1, bd.x1 - 4.6);
    if (d.side === 'e') box.x2 = Math.max(box.x2, bd.x2 + 4.6);
  }
  return {
    meshes: [full, roof, cut],
    cuttable: { full, roof, cut, ratio: CUT_H / eave, k: 0, hold: 0, box },
    colliders,
  };
}

function drawNeighbor(b, n) {
  const w = n.x2 - n.x1, d = n.z2 - n.z1, cx = (n.x1 + n.x2) / 2, cz = (n.z1 + n.z2) / 2;
  b.box(cx, 0, cz, w, n.h, d, n.c);
  if (n.flat) {
    b.box(cx, n.h, cz, w + 0.4, 0.8, d + 0.4, TRIM);
    b.box(cx, n.h, cz, w - 1.2, 0.85, d - 1.2, 0xd9d4ca);   // roof deck inside the parapet
    return;
  }
  // gable along the long side
  const along = w >= d, span = along ? d : w, len = along ? w : d, rise = span * 0.32;
  const g = prism([[-span / 2 - 0.8, 0], [span / 2 + 0.8, 0], [0, rise]], len + 1.6);
  g.translate(0, 0, -(len + 1.6) / 2);
  if (along) g.rotateY(Math.PI / 2);
  b.geo(g, 0x8d7d70, cx, n.h, cz);
  for (const [fx, fz] of along ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]]) {
    // a couple of windows on each long face
    for (const t of [-0.25, 0.25]) {
      const px = cx + (along ? t * w : fx * (w / 2 + 0.1)), pz = cz + (along ? fz * (d / 2 + 0.1) : t * d);
      b.box(px, 3.2, pz, along ? 4 : 0.3, 4, along ? 0.3 : 4, GLASS);
    }
  }
}


// ---- trees and street furniture ----

function drawTree(b, x, z, R, rand) {
  const trunkH = 5 + R * 0.3;
  b.cyl(x, 0, z, 0.75, trunkH + R * 0.5, TRUNK, 8, 0.45);
  const cy = trunkH + R * 0.7;
  b.blob(x, cy, z, R * 0.7, LEAVES[Math.floor(rand() * LEAVES.length)], 0.85);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + rand() * 1.2;
    b.blob(x + Math.cos(a) * R * 0.48, cy + (rand() - 0.35) * R * 0.4, z + Math.sin(a) * R * 0.48,
      R * (0.42 + rand() * 0.14), LEAVES[Math.floor(rand() * LEAVES.length)], 0.85);
  }
  b.blob(x, cy + R * 0.45, z, R * 0.42, LEAVES[0], 0.85);
  return cy + R * 0.45 + R * 0.42 * 0.85; // top of the crown
}

function drawLotLight(b, x, z) {
  // arm reaches over the pavement: west from the spur's east edge, else toward the aisle
  const tx = x > 148 ? x - 10 : x, tz = x > 148 ? z : 11.5;
  const ry = Math.atan2(tx - x, tz - z), ax = Math.sin(ry), az = Math.cos(ry);
  b.cyl(x, 0, z, 0.7, 1.4, 0xcfcac0, 10);
  b.cyl(x, 1.4, z, 0.22, 18, POLE, 8);
  b.box(x + ax * 1.5, 19.1, z + az * 1.5, 0.3, 0.3, 3, POLE, ry);
  b.box(x + ax * 3.2, 18.7, z + az * 3.2, 1.0, 0.45, 1.8, 0x3a3d40, ry);
  b.box(x + ax * 3.2, 18.62, z + az * 3.2, 0.8, 0.08, 1.5, LENS, ry);
}

function drawUtilityPole(b, x, z) {
  b.cyl(x, 0, z, 0.5, 31, WOOD_POLE, 8, 0.38);
  b.box(x, 28.4, z, 8, 0.45, 0.45, WOOD_POLE);
  for (const dx of [-3.4, 0, 3.4]) b.cyl(x + dx, 28.85, z, 0.16, 0.7, 0x9fb7a8, 6);
  // cobra-head street light out over the cross street (north of the pole)
  b.box(x, 24.4, z - 3.6, 0.25, 0.25, 7.2, 0x8a8f94);
  b.box(x, 24.0, z - 7.8, 1.0, 0.5, 2.1, 0x8a8f94);
  b.box(x, 23.94, z - 7.8, 0.75, 0.08, 1.6, LENS);
}

function stopSign(x, z, face) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const c = cv.getContext('2d');
  const oct = (r) => {
    c.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + (i * Math.PI) / 4;
      c.lineTo(64 + Math.cos(a) * r, 64 - Math.sin(a) * r);
    }
    c.closePath();
  };
  c.fillStyle = '#f4f1ea'; oct(64); c.fill();
  c.fillStyle = '#c8102e'; oct(57); c.fill();
  c.fillStyle = '#f4f1ea';
  c.font = `800 34px ${LABEL_FONT}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('STOP', 64, 67);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const g = new THREE.Group();
  const front = new THREE.Mesh(new THREE.CircleGeometry(1.25, 8, Math.PI / 8), pencil(0xffffff, { map: tex }));
  front.position.z = 0.06;
  const back = new THREE.Mesh(new THREE.CircleGeometry(1.25, 8, Math.PI / 8), pencil(0x9aa0a6));
  back.rotation.y = Math.PI;
  g.add(front, back);
  g.position.set(x, 7.2, z);
  g.rotation.y = face;
  for (const m of [front, back]) m.castShadow = true;
  return g;
}


// ---- the area ----

export function buildOutside() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 170, 560);
  const touch = matchMedia('(pointer: coarse)').matches;
  const sun = addLights(scene, { x: LOT.ENTRY.x, z: LOT.ENTRY.z, extent: 95, far: 320, reach: 4, mapSize: touch ? 1024 : 2048 });

  // pushed back in depth so roads, lots and paint laid just above it never z-fight
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3200, 3200),
    pencil(GRASS, { polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const colliders = [];
  const cuttables = [];
  const b = createBatch();
  const rand = rng(23);

  drawStreets(b);
  drawWalks(b);
  drawLot(b);

  for (const bd of LOT.BUILDINGS) {
    const built = buildBuilding(bd);
    scene.add(...built.meshes);
    cuttables.push(built.cuttable);
    colliders.push(...built.colliders);
  }
  for (const n of LOT.NEIGHBORS) {
    drawNeighbor(b, n);
    colliders.push({ x1: n.x1, z1: n.z1, x2: n.x2, z2: n.z2 });
  }

  // yard trees stand alone so they can cut away; woods merge into the scenery
  for (const [x, z, R] of LOT.YARD_TREES) {
    const t = createBatch();
    const h = drawTree(t, x, z, R, rand);
    const full = t.build();
    const s = createBatch();
    s.cyl(x, 0, z, 0.75, CUT_H, TRUNK, 8, 0.6);
    const cut = s.build();
    cut.visible = false;
    scene.add(full, cut);
    cuttables.push({ full, cut, ratio: CUT_H / h, k: 0, hold: 0,
      box: { x1: x - R * 1.1, z1: z - R * 1.1, x2: x + R * 1.1, z2: z + R * 1.1, h } });
    colliders.push({ x1: x - 0.9, z1: z - 0.9, x2: x + 0.9, z2: z + 0.9 });
  }
  for (const w of LOT.WOODS) {
    for (let x = w.x1; x <= w.x2; x += w.step) {
      for (let z = w.z1; z <= w.z2; z += w.step) {
        if (rand() < 0.15) continue;
        const tx = x + (rand() - 0.5) * w.step * 0.6, tz = z + (rand() - 0.5) * w.step * 0.6;
        drawTree(b, tx, tz, 11 + rand() * 5, rand);
        colliders.push({ x1: tx - 0.9, z1: tz - 0.9, x2: tx + 0.9, z2: tz + 0.9 });
      }
    }
  }

  for (const [x, z] of LOT.LOT_LIGHTS) {
    drawLotLight(b, x, z);
    colliders.push({ x1: x - 0.7, z1: z - 0.7, x2: x + 0.7, z2: z + 0.7 });
  }
  for (const [x, z] of LOT.UTILITY_POLES) {
    drawUtilityPole(b, x, z);
    colliders.push({ x1: x - 0.6, z1: z - 0.6, x2: x + 0.6, z2: z + 0.6 });
  }
  for (const s of LOT.STOP_SIGNS) {
    b.cyl(s.x, 0, s.z, 0.1, 7.3, 0xc7cacc, 6);
    scene.add(stopSign(s.x, s.z, s.face));
    colliders.push({ x1: s.x - 0.35, z1: s.z - 0.35, x2: s.x + 0.35, z2: s.z + 0.35 });
  }
  {
    const { x, z } = LOT.BUS_STOP;
    b.cyl(x, 0, z, 0.1, 8, 0xc7cacc, 6);
    b.box(x, 6.4, z, 1.5, 1.1, 0.1, 0x2b4e91);
    b.box(x, 6.75, z + 0.06, 1.2, 0.18, 0.02, PAINT);
    colliders.push({ x1: x - 0.35, z1: z - 0.35, x2: x + 0.35, z2: z + 0.35 });
  }

  // parked cars, merged; the RAV4 is its own object
  let ci = 0;
  for (const { row, stalls } of LOT.PARKED) {
    for (const st of stalls) {
      const { x, z, heading } = stallSpot(row, st);
      const spec = drawParkedCar(b, CAR_KINDS[ci % CAR_KINDS.length], CAR_COLORS[(ci * 3) % CAR_COLORS.length], x, z, heading);
      colliders.push(carBox(x, z, heading, spec));
      ci++;
    }
  }
  const rav4 = createRav4();
  {
    const { x, z, heading } = stallSpot(LOT.RAV4_SPOT.row, LOT.RAV4_SPOT.stall);
    rav4.group.position.set(x, 0, z);
    rav4.group.rotation.y = heading;
    rav4.group.traverse((m) => { if (m.isMesh && m.geometry.type !== 'PlaneGeometry') m.castShadow = true; });
    scene.add(rav4.group);
    colliders.push(carBox(x, z, heading, rav4.spec));
  }

  scene.add(b.build());

  // standing height: sidewalks and walks are a step up
  function heightAt(x, z) {
    for (const r of LOT.WALKS) if (inRect(x, z, r)) return WALK_H;
    for (const s of LOT.SIDEWALKS) if (distToLine(x, z, s.pts) <= s.w / 2) return WALK_H;
    return 0;
  }

  // ---- cutaway: anything between the camera and the player sinks to 4 ft ----
  const chest = new THREE.Vector3(), head = new THREE.Vector3();
  function blocks(box, from, to) {
    let t0 = 0, t1 = 1;
    for (const [a, lo, hi] of [['x', box.x1, box.x2], ['y', 0, box.h], ['z', box.z1, box.z2]]) {
      const d = to[a] - from[a];
      if (Math.abs(d) < 1e-6) {
        if (from[a] < lo || from[a] > hi) return false;
        continue;
      }
      let ta = (lo - from[a]) / d, tb = (hi - from[a]) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) return false;
    }
    return true;
  }

  function update(dt, camera, player) {
    const { x, z, y } = player.state;
    followSun(sun, x, z);
    chest.set(x, y + 3.4, z);
    head.set(x, y + 6.2, z);
    for (const c of cuttables) {
      const hidden = blocks(c.box, camera.position, chest) || blocks(c.box, camera.position, head);
      // hold the cut briefly so it doesn't flicker at the edge
      c.hold = hidden ? 0.35 : c.hold - dt;
      const target = c.hold > 0 ? 1 : 0;
      c.k = Math.max(0, Math.min(1, c.k + Math.sign(target - c.k) * dt * 5));
      const e = c.k * c.k * (3 - 2 * c.k);
      c.full.visible = c.k < 1;
      c.full.scale.y = 1 + (c.ratio - 1) * e;
      if (c.roof) c.roof.visible = c.k === 0;
      c.cut.visible = c.k >= 1;
    }
  }

  return {
    scene,
    overlay: null,
    colliders,
    bounds: LOT.BOUNDS,
    interactables: [
      { id: 'home-door', label: 'Go inside', x: 37.5, z: 63.9, r: 2.4, go: 'apartment' },
    ],
    entry: LOT.ENTRY,
    speed: RUN,
    heightAt,
    update,
    rav4,
    view: { off: [0, 38, 36], lookY: 3, near: 0.5, far: 900, ink: [200, 520], widen: true },
    caption: 'Home · parking lot',
  };
}
