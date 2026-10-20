/*
The outdoor area: the home lot from home_lot.js, built in the apartment's
look (toon materials, ink lines, the same daylight and sky haze).

Almost everything static is merged into one vertex-colored mesh
(batch.js), so the whole site costs a handful of draw calls even with the
ink pass rendering it twice. Things that change stay separate: the two
apartment buildings and the yard trees (they cut away), and the RAV4 and
the garage (fleet.js), the only cars in the lot.

Dollhouse cutaway: the camera keeps the apartment's high, north-up angle,
so a building (or tree) can end up between it and the player. When one
does, its walls sink to the apartment's 4 ft cutaway height, the roof
comes off, and a hollow version with cream partition walls and carpet
takes its place, the same trick that makes the apartment readable.
*/import * as THREE from 'three';
import { pencil, addLights, followSun, makeMarker } from './pencil.js';
import { createBatch, groundViews } from './batch.js';
import { rng, prism, distToLine, inRect, drawTree, TRUNK } from './scenery.js';
import { createCar, RAV4_SPEC } from './car.js';
import { FLEET } from './fleet.js';
import { createSolids, createWorld } from './collide.js';
import { createBreakables } from './breakables.js';
import { createTown } from './chunks.js';
import { createVehicle } from './vehicle.js';
import { buildTown } from './town.js';
import * as LOT from './home_lot.js';
import * as NEAR from './nearby.js';
import { buildPlaceProps, onPad, RESTYLE } from './places.js';

const SKY = 0xdde9ec;            // same haze as the apartment
const GRASS = 0xa9c98b;
const LOT_ASPHALT = 0x8f9399;
const CONCRETE = 0xbcb8b0;
const WALK = 0xdcd8cf;
const CURB = 0xe6e2d9;
const PAINT = 0xf4f1ea;
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
const LENS = 0xfff6d8;

const CUT_H = 4;          // matches the apartment's cutaway walls
const WALK_H = 0.25;      // sidewalks and walks are a step up from the grass
const WALK_SPEED = 9;     // ft/s on foot outside (a brisk walk; the apartment is 6.5)
const RUN_SPEED = 30;     // with run on (R / the Run button): a flat-out sprint to the car
const FOG_BANK = 400;     // ft past the edge of the town where the fog closes in
const GRASS_REACH = 18000; // ft of grass past the hand-built blocks: the whole town, plus fog


// ---- ground: streets, curbs, sidewalks, lot ----

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

function drawLot(b, ground) {
  for (const [x1, z1, x2, z2] of LOT.PAVING) ground.lots.flat((x1 + x2) / 2, 0.05, (z1 + z2) / 2, x2 - x1, z2 - z1, CONCRETE);
  for (const [x1, z1, x2, z2] of LOT.NEIGHBOR_LOTS) ground.drives.flat((x1 + x2) / 2, 0.04, (z1 + z2) / 2, x2 - x1, z2 - z1, LOT_ASPHALT);
  // stop bar in the avenue's northbound lane, before the cross street
  ground.paint.flat(-162, 0.06, -201, 13, 1.4, PAINT);

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
      if (r.axis === 'x') ground.paint.flat(u, 0.08, mid, 0.4, len, PAINT);
      else ground.paint.flat(mid, 0.08, u, len, 0.4, PAINT);
    }
  }
}

function stallSpot(rowIndex, stall) {
  const r = LOT.STALL_ROWS[rowIndex];
  const u = r.from + 4.5 + 9 * stall, across = (r.at[0] + r.at[1]) / 2;
  return r.axis === 'x' ? { x: u, z: across, heading: r.nose } : { x: across, z: u, heading: r.nose };
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

// ---- the area ----

export function buildOutside() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 170, 560);
  const touch = matchMedia('(pointer: coarse)').matches;
  const sun = addLights(scene, { x: LOT.ENTRY.x, z: LOT.ENTRY.z, extent: 95, far: 320, reach: 4, mapSize: touch ? 1024 : 2048 });

  // flat ground is one mesh in depth layers (batch.js GROUND): paint over lots
  // over streets over drives over fields over water over grass. The grass is
  // one quad under the whole town (the chunks only draw what's on top of it)
  // and runs on into the fog bank past the edge.
  const R = NEAR.REGION;
  const groundBatch = createBatch();
  const ground = groundViews(groundBatch);
  // cut into ~500 ft squares: one quad that size loses the depth fight with
  // the roads on it on some GPUs, and the grass flickered through
  const gw = R.x2 - R.x1 + GRASS_REACH * 2, gd = R.z2 - R.z1 + GRASS_REACH * 2;
  ground.grass.geo(new THREE.PlaneGeometry(gw, gd, Math.ceil(gw / 500), Math.ceil(gd / 500)).rotateX(-Math.PI / 2),
    GRASS, (R.x1 + R.x2) / 2, 0, (R.z1 + R.z2) / 2);

  const colliders = [];
  const cuttables = [];
  const b = createBatch();
  const rand = rng(23);

  drawWalks(b);
  drawLot(b, ground);
  const breakables = createBreakables(scene);
  const homeProps = breakables.group();
  const town = buildTown({ scene, b, ground, props: homeProps, colliders, cuttables, cutH: CUT_H });
  // parking pads and the gas canopy for the Places (places.js)
  buildPlaceProps({ b, ground, colliders });

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

  // street furniture is breakable (breakables.js): lot lights reach over the
  // pavement (west from the spur's east edge, else toward the aisle), the
  // utility poles' lights reach north over the cross street
  const addProp = (id, kind, x, z, ry) => {
    const box = homeProps.add(id, kind, x, z, ry);
    if (box) colliders.push(box);
  };
  for (const [k, [x, z]] of LOT.LOT_LIGHTS.entries()) {
    const tx = x > 148 ? x - 10 : x, tz = x > 148 ? z : 11.5;
    addProp(`lot:light${k}`, 'lamp', x, z, Math.atan2(tx - x, tz - z) + Math.PI);
  }
  for (const [k, [x, z]] of LOT.UTILITY_POLES.entries()) addProp(`lot:pole${k}`, 'pole', x, z, 0);
  for (const [k, sg] of LOT.STOP_SIGNS.entries()) addProp(`lot:stop${k}`, 'stop', sg.x, sg.z, sg.face);
  addProp('lot:bus', 'bus', LOT.BUS_STOP.x, LOT.BUS_STOP.z, 0);

  // the vehicles: the RAV4 in its stall, the garage (fleet.js) by our building.
  // They move, so they aren't static colliders: a parked one's body circles join
  // the grid's moving solids (Ani walks around it), and each has a door to get in at
  const cars = [];
  function addCar(spec, x, z, heading) {
    const model = createCar(spec);
    const vehicle = createVehicle({ x, z, heading, tune: spec.tune });
    model.group.position.set(x, 0, z);
    model.group.rotation.y = heading;
    scene.add(model.group);
    const c = { id: spec.id, model, vehicle, parked: true, circles: [] };
    c.door = { id: `car:${spec.id}`, label: `${spec.verb ?? 'Get in'} · ${spec.name}`, x: 0, z: 0,
      r: spec.kind === 'bike' ? 2.8 : 3.4, drive: true, car: c };
    cars.push(c);
    return c;
  }
  const spot = stallSpot(LOT.RAV4_SPOT.row, LOT.RAV4_SPOT.stall);
  const rav4 = addCar(RAV4_SPEC, spot.x, spot.z, spot.heading);
  let stall = 0;
  for (const spec of FLEET) {
    if (spec.kind === 'bike') {
      const at = LOT.GARAGE.bike;
      addCar(spec, at.x, at.z, at.heading);
      continue;
    }
    const at = stallSpot(LOT.GARAGE.row, LOT.GARAGE.stalls[stall++]);
    addCar(spec, at.x, at.z, at.heading);
  }

  // static scenery in 400 ft tiles so off-screen tiles (and ones outside the
  // sun's shadow box) are culled; flat ground as one layered mesh
  scene.add(b.build({ tile: 400 }));
  scene.add(groundBatch.build({ ground: true }));
  homeProps.build();

  // a speech-bubble sticker over the RAV4 so it's easy to pick out of the lot;
  // drawn in the un-inked overlay like the apartment's room labels, through walls
  const overlay = new THREE.Scene();
  const marker = makeMarker('MY RAV4');
  marker.position.copy(rav4.model.group.position).setY(7.2);
  overlay.add(marker);
  let markerT = 0;

  // standing height: sidewalks and walks are a step up
  const sidewalks = [...LOT.SIDEWALKS, ...NEAR.SIDEWALKS];
  const inRegion = (x, z) => x >= R.x1 && x <= R.x2 && z >= R.z1 && z <= R.z2;
  function heightAt(x, z) {
    if (!inRegion(x, z)) return townChunks.onWalk(x, z) ? WALK_H : 0;
    for (const r of LOT.WALKS) if (inRect(x, z, r)) return WALK_H;
    for (const s of sidewalks) if (distToLine(x, z, s.pts) <= s.w / 2) return WALK_H;
    return 0;
  }

  // past the edge of the town a fog bank closes in: 0 inside, 1 at its far side
  function bankAt(x, z) {
    const B = world.bounds;
    const out = Math.max(B.x1 - x, x - B.x2, B.z1 - z, z - B.z2);
    const k = Math.min(1, Math.max(0, (out + 80) / (B.margin + 80)));
    return k * k * (3 - 2 * k);
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

  // collision: the hand-built area's grid plus each streamed chunk's own
  const solids = createWorld(createSolids(colliders));
  const world = {
    solids,
    // pavement: the hand-built raster here, the chunks' everywhere else (unloaded counts as road),
    // and the Places' parking pads
    surface: (x, z) => onPad(x, z) || (inRegion(x, z) ? town.paved(x, z) : townChunks.paved(x, z) ?? true),
    // until the town index arrives, the hand-built area is the whole map
    bounds: { ...R, margin: FOG_BANK },
    onBreak: (box, vx, vz) => breakables.knock(box, vx, vz),
  };
  const townChunks = createTown({ scene, world: solids, breakables, restyle: RESTYLE });
  const circles = [];

  // driving: the car is moving; cut: the camera is the high on-foot one, so
  // anything between it and Ani sinks to the cutaway (the others pull in instead)
  function update(dt, camera, player, driving = false, cut = !driving) {
    const { x, z, y } = player.state;
    const s = area.car.vehicle.s;
    // stream the town around a point that runs ahead of the car
    if (townChunks.bounds && world.bounds.x1 === R.x1) {
      const [x1, z1, x2, z2] = townChunks.bounds;
      world.bounds = { x1, z1, x2, z2, margin: FOG_BANK };
      area.bounds = { x1: x1 - 150, z1: z1 - 150, x2: x2 + 150, z2: z2 + 150 };
    }
    if (driving) townChunks.update(s.x + s.vx * 1.5, s.z + s.vz * 1.5, 1800);
    else townChunks.update(x, z, 1200);
    breakables.update(dt);
    if (driving) {
      // shadows where the car is heading, not where it's been
      followSun(sun, s.x + s.vx * 0.35, s.z + s.vz * 0.35);
    } else {
      followSun(sun, x, z);
    }
    // parked vehicles: Ani collides with them and gets in at the driver's door
    circles.length = 0;
    for (const c of cars) {
      if (!c.parked) continue;
      for (const k of c.vehicle.circles(c.circles)) circles.push(k);
      const v = c.vehicle.s, side = c.model.spec.w / 2 + 1.5;
      c.door.x = v.x + Math.cos(v.h) * side + Math.sin(v.h) * 0.6;
      c.door.z = v.z - Math.sin(v.h) * side + Math.cos(v.h) * 0.6;
    }
    solids.circles = circles;
    const r4 = rav4.vehicle.s;
    marker.visible = rav4.parked;
    markerT += dt;
    marker.position.set(r4.x, 7.2 + Math.sin(markerT * 2.6) * 0.35, r4.z);
    chest.set(x, y + 3.4, z);
    head.set(x, y + 6.2, z);
    for (const c of cuttables) {
      // driving cameras pull in instead of cutting buildings away
      const hidden = cut && (blocks(c.box, camera.position, chest) || blocks(c.box, camera.position, head));
      // hold the cut briefly so it doesn't flicker at the edge
      c.hold = hidden ? 0.35 : c.hold - dt;
      const target = c.hold > 0 ? 1 : 0;
      c.k = Math.max(0, Math.min(1, c.k + Math.sign(target - c.k) * dt * 5));
      const e = c.k * c.k * (3 - 2 * c.k);
      // buildings without a hollow version just stay squashed at 4 ft
      c.full.visible = c.k < 1 || !c.cut;
      c.full.scale.y = 1 + (c.ratio - 1) * e;
      if (c.roof) c.roof.visible = c.k === 0;
      if (c.cut) c.cut.visible = c.k >= 1;
    }
  }

  const area = {
    scene,
    overlay,
    colliders,
    solids,
    world,
    car: rav4,          // the vehicle in use (drive.js switches it), the RAV4 to start
    cars,
    town: townChunks,
    // on foot you can wander a little way into the fog bank (widened to the town once it's known)
    bounds: { x1: R.x1 - 150, z1: R.z1 - 150, x2: R.x2 + 150, z2: R.z2 + 150 },
    bankAt,
    interactables: [
      { id: 'home-door', label: 'Go inside', x: 37.5, z: 63.9, r: 2.4, go: 'apartment' },
      ...cars.map((c) => c.door),
    ],
    entry: LOT.ENTRY,
    speed: WALK_SPEED,
    runSpeed: RUN_SPEED,
    heightAt,
    update,
    // on foot: the high follow camera; driving: long sightlines for 100+ mph
    view: { off: [0, 27, 25], lookY: 3, near: 0.5, far: 900, ink: [200, 520], fog: [170, 560], widen: true },
    driveView: { far: 2400, ink: [260, 950], fog: [420, 1600] },
    // on foot behind Ani or through Ani's eyes: low cameras that see to the horizon
    nearView: { far: 1600, ink: [200, 650], fog: [260, 950] },
    caption: 'Home · parking lot',
  };
  return area;
}
