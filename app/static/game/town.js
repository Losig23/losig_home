/*
The blocks around the home lot (nearby.js), built in the lot's style:
toon materials, the same palette, inked by the same pass.

- Ground is flat geometry in depth layers (batch.js GROUND), so grass,
  fields, drives, streets, lots and paint never z-fight even from the
  driver's seat a quarter mile out.
- Streets get curbs (visual only; the car drives over them) with gaps at
  every crossing drive and lot, and the collector streets a double yellow.
- Buildings tall enough to hide Ani from the follow camera are their own
  meshes and sink to the apartment's 4 ft cutaway like the lot's buildings.
  Small ones and trees merge into the tiled static batch; poles and signal
  masts are breakables. Houses between the measured buildings come from
  the baked town chunks (chunks.js), like everywhere else in town.
- paved(x, z) answers "is this pavement?" from a 4 ft raster, so the car
  can bog down on grass.
*/import * as THREE from 'three';
import { createBatch } from './batch.js';
import { rng, offsetLine, distToLine, distToSeg, inRect, drawTree } from './scenery.js';
import * as NEAR from './nearby.js';
import * as LOT from './home_lot.js';

const ASPHALT = 0x7d8188;
const DRIVE = 0x8f9399;        // service drives, the lot's neighbor asphalt
const CONCRETE = 0xbcb8b0;
const GRAVEL = 0xbab09f;
const WALK = 0xdcd8cf;
const CURB = 0xe6e2d9;
const PAINT = 0xf4f1ea;
const YELLOW = 0xe3b04b;
const CROP = 0x93b56c;
const CROP_ROW = 0x7fa35c;
const MEADOW = 0xb9c28c;
const TRIM = 0xf4f2ec;
const FOUND = 0x9a938a;
const GLASS = 0xbcd3e0;
const DOOR = 0x3b2419;
const STEEL = 0x8a8f94;
const TRACK = 0x5b84b8;        // the stadium's (blue) track
const TURF = 0x58a052;
const SAND = 0xcdab7e;
const WATER = 0x74c6dc;
const COURT = 0x6f8f7c;
const METAL = 0xc9ccce;        // nearby.js's metal-sided sheds
export const HOUSE_SIDING = [0xe8dcc8, 0xc9d3dc, 0xd8c8a8, 0xb9c6b0, 0xe6e0d4, 0xc4b5a5, 0xd9c3b0, 0xa7b6c4];
export const HOUSE_ROOF = [0x7f6a5d, 0x5f6266, 0x6a574b, 0x8d7d70, 0x5f6266, 0x9c4a3c];

const CUT_MIN_H = 14;          // shorter than this can't hide Ani from the follow camera


// ---- buildings: walls, a roof, windows; drawn in the batch's current frame ----

export function drawBuilding(t, { x, z, ry = 0, w, d, h, roof = 'gable', c, r, flip, front, windows = true }) {
  // ridge along the longer side: draw in a frame whose x is the long axis
  const L = Math.max(w, d), D = Math.min(w, d);
  t.frame(x, z, d > w ? ry + Math.PI / 2 : ry);
  drawBody(t, L, D, h, roof, c, r, flip, front, windows);
  t.endFrame();
}

function drawBody(t, L, D, h, roof, c, r, flip, front, windows) {
  let eave = h, rise = 0;
  if (roof === 'gable') { rise = Math.min(D * 0.28, 7.5); eave = h - rise; }
  if (roof === 'low') { rise = Math.min(D * 0.1, 3); eave = h - rise; }
  if (roof === 'stands') {
    // bleachers: rows stepping up away from the field
    const rows = 6, sz = flip ? -1 : 1;
    for (let i = 0; i < rows; i++) {
      t.box(0, 0, sz * (-D / 2 + (i + 0.5) * D / rows), L, h * (i + 1) / rows, D / rows, i % 2 ? c : r);
    }
    t.box(0, 0, sz * (D / 2 - 0.3), L, h + 3.5, 0.6, STEEL);       // back rail
    return;
  }
  t.box(0, 0, 0, L + 0.4, 1.0, D + 0.4, FOUND);
  t.box(0, 0, 0, L, eave, D, c);
  if (roof === 'flat') {
    t.box(0, eave, 0, L + 0.4, 0.8, D + 0.4, TRIM);
    t.box(0, eave, 0, L - 1.2, 0.85, D - 1.2, r);
  } else {
    const o = 1.0, half = D / 2, slope = Math.atan2(rise, half), run = half + o;
    t.gable(0, eave, 0, L, rise, D, c);
    for (const sz of [-1, 1]) {
      t.geo(new THREE.BoxGeometry(L + 2 * o, 0.45, run / Math.cos(slope)), r,
        0, eave + rise - (run / 2) * Math.tan(slope) + 0.2, sz * run / 2, 0, sz * slope);
    }
  }
  if (c === METAL || !windows) return; // sheds: no windows
  if (windows === 'shop') {
    // storefront glass along the long faces, a row of windows above on taller blocks
    for (const sz of [-1, 1]) {
      for (let u = -L / 2 + 8; u <= L / 2 - 7; u += 14) {
        t.box(u, 1.6, sz * (D / 2 + 0.06), 9, 6.5, 0.3, GLASS);
        if (eave >= 20) t.box(u, 12.5, sz * (D / 2 + 0.06), 4.6, 4.6, 0.3, GLASS);
      }
    }
    return;
  }
  // windows along the long faces (two rows on two-story buildings), a couple on the ends
  const floors = eave >= 17 ? [3.4, 13.2] : [3.2];
  for (const sz of [-1, 1]) {
    for (let u = -L / 2 + 8; u <= L / 2 - 6; u += 13) {
      if (front && sz === 1 && Math.abs(u) < 4) continue;
      for (const y of floors) t.box(u, y, sz * (D / 2 + 0.06), 4.2, 4.2, 0.3, GLASS);
    }
  }
  for (const sx of [-1, 1]) {
    for (const y of floors) t.box(sx * (L / 2 + 0.06), y, 0, 0.3, 4.2, 4.2, GLASS);
  }
  if (front) {
    // the front door, toward the street (+z in the house's frame)
    t.box(0, 0, D / 2 + 0.08, 3.2, 7, 0.3, DOOR);
    t.box(0, 0, D / 2 + 2.5, 6, 0.6, 4.5, CONCRETE);
  }
}

/** Storefront glass along each long-enough wall of a footprint polygon ([[x, z], ...]). */
export function drawStorefronts(t, pts, h) {
  const n = pts.length;
  let cx = 0, cz = 0;
  for (const [x, z] of pts) { cx += x / n; cz += z / n; }
  for (let i = 0; i < n; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % n];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 16) continue;
    const tx = (bx - ax) / L, tz = (bz - az) / L;
    // outward: the side of the wall away from the middle of the building
    let nx = tz, nz = -tx;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    if ((mx + nx - cx) ** 2 + (mz + nz - cz) ** 2 < (mx - cx) ** 2 + (mz - cz) ** 2) { nx = -nx; nz = -nz; }
    const ry = Math.atan2(-tz, tx);
    for (let u = 8; u <= L - 7; u += 14) {
      const x = ax + tx * u + nx * 0.15, z = az + tz * u + nz * 0.15;
      t.box(x, 1.6, z, 9, 6.5, 0.3, GLASS, ry);
      if (h >= 22) t.box(x, 12.5, z, 4.6, 4.6, 0.3, GLASS, ry);
    }
  }
}

function obb(x, z, w, d, ry = 0) {
  return { x, z, hw: w / 2, hd: d / 2, ry };
}


// ---- the build ----

/**
 * ctx: { scene, b (tiled static batch), ground (groundViews), props (a
 * breakables group), colliders, cuttables, cutH }. Returns { paved }.
 */
export function buildTown({ scene, b, ground, props, colliders, cuttables, cutH }) {
  const rand = rng(41);
  const g = ground;
  const blockers = [];   // footprints houses and trees must avoid: [x1, z1, x2, z2]

  // ---- streets, drives, curbs, paint ----
  const isStreet = (r) => r.kind === 'collector' || r.kind === 'res';
  const flatAreas = [...NEAR.LOTS, ...NEAR.GRAVEL, ...LOT.PAVING, ...LOT.NEIGHBOR_LOTS];
  for (const r of NEAR.ROADS) {
    (isStreet(r) ? g.streets : g.drives).ribbon(r.pts, r.w, 0.02, isStreet(r) ? ASPHALT : DRIVE);
    if (r.kind === 'collector') {
      for (const s of [-0.45, 0.45]) g.paint.ribbon(offsetLine(r.pts, s), 0.32, 0.05, YELLOW, false);
    }
  }
  for (const r of NEAR.ROADS) {
    if (!isStreet(r)) continue;
    const others = NEAR.ROADS.filter((o) => o !== r);
    for (const side of [-1, 1]) {
      const line = offsetLine(r.pts, side * (r.w / 2 + 0.3));
      for (let i = 0; i < line.length - 1; i++) {
        const [x1, z1] = line[i], [x2, z2] = line[i + 1];
        const len = Math.hypot(x2 - x1, z2 - z1);
        const n = Math.ceil(len / 8);
        // test 8 ft pieces, then lay each unbroken run as one long curb
        let run = -1;
        const lay = (k0, k1) => {
          const t0 = k0 / n, t1 = k1 / n;
          const cx = x1 + (x2 - x1) * (t0 + t1) / 2, cz = z1 + (z2 - z1) * (t0 + t1) / 2;
          b.geo(new THREE.BoxGeometry(0.6, 0.45, len * (t1 - t0) + 0.05), CURB, cx, 0.225, cz, Math.atan2(x2 - x1, z2 - z1));
        };
        for (let k = 0; k <= n; k++) {
          const t = (k + 0.5) / n;
          const cx = x1 + (x2 - x1) * t, cz = z1 + (z2 - z1) * t;
          // curbs break for every drive, lot and street that meets this one
          const gap = k === n || flatAreas.some((a) => inRect(cx, cz, a, 2)) ||
            others.some((o) => distToLine(cx, cz, o.pts) < o.w / 2 + 2);
          if (!gap && run < 0) run = k;
          if (gap && run >= 0) { lay(run, k); run = -1; }
        }
      }
    }
  }
  for (const s of NEAR.SIDEWALKS) {
    for (let i = 0; i < s.pts.length - 1; i++) {
      const [x1, z1] = s.pts[i], [x2, z2] = s.pts[i + 1];
      const len = Math.hypot(x2 - x1, z2 - z1);
      b.geo(new THREE.BoxGeometry(s.w, 0.25, len), WALK, (x1 + x2) / 2, 0.125, (z1 + z2) / 2, Math.atan2(x2 - x1, z2 - z1));
      if (i > 0) b.cyl(x1, 0, z1, s.w / 2, 0.25, WALK, 12);
    }
  }

  // ---- flat ground: lots, gravel, fields with crop rows, tall grass ----
  for (const [x1, z1, x2, z2] of NEAR.LOTS) g.lots.flat((x1 + x2) / 2, 0.04, (z1 + z2) / 2, x2 - x1, z2 - z1, CONCRETE);
  for (const [x1, z1, x2, z2] of NEAR.GRAVEL) g.drives.flat((x1 + x2) / 2, 0.03, (z1 + z2) / 2, x2 - x1, z2 - z1, GRAVEL);
  for (const f of NEAR.FIELDS) {
    g.landcover.poly(f, 0.01, CROP);
    // crop rows run north-south: scanline the polygon every 14 ft
    const xs = f.map((p) => p[0]);
    for (let x = Math.min(...xs) + 7; x < Math.max(...xs); x += 14) {
      const hits = [];
      for (let i = 0; i < f.length; i++) {
        const [ax, az] = f[i], [bx, bz] = f[(i + 1) % f.length];
        if ((ax <= x) !== (bx <= x)) hits.push(az + (bz - az) * (x - ax) / (bx - ax));
      }
      hits.sort((p, q) => p - q);
      for (let i = 0; i + 1 < hits.length; i += 2) {
        g.paint.flat(x, 0.03, (hits[i] + hits[i + 1]) / 2, 1.6, hits[i + 1] - hits[i] - 4, CROP_ROW);
      }
    }
    const zs = f.map((p) => p[1]);
    blockers.push([Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)]);
  }
  for (const m of NEAR.MEADOWS) g.landcover.poly(m, 0.01, MEADOW);

  // ---- the stadium: blue track around a turf field with yard lines; the ball diamond; pool; court ----
  {
    const { x, z, len, wide } = NEAR.STADIUM;
    const ring = (R) => {
      const a = (len - wide) / 2, pts = [];
      for (let i = 0; i <= 16; i++) { const t = -Math.PI / 2 + (i / 16) * Math.PI; pts.push([x + a + R * Math.cos(t), z + R * Math.sin(t)]); }
      for (let i = 0; i <= 16; i++) { const t = Math.PI / 2 + (i / 16) * Math.PI; pts.push([x - a + R * Math.cos(t), z + R * Math.sin(t)]); }
      return pts;
    };
    g.landcover.poly(ring(wide / 2), 0.01, TRACK);
    g.drives.poly(ring(wide / 2 - 36), 0.02, TURF);
    g.paint.flat(x, 0.04, z, 300, 3, PAINT);
    for (let u = -150; u <= 150; u += 30) g.paint.flat(x + u, 0.05, z, 1.2, 160, PAINT);
    g.paint.flat(x, 0.05, z - 80, 360, 1.2, PAINT);
    g.paint.flat(x, 0.05, z + 80, 360, 1.2, PAINT);
    for (const sx of [-1, 1]) {
      // goal posts
      b.cyl(x + sx * 180, 0, z, 0.3, 10, 0xe3b04b, 6);
      b.box(x + sx * 180, 10, z, 0.4, 0.4, 18.5, 0xe3b04b);
      for (const sz of [-1, 1]) b.cyl(x + sx * 180, 10, z + sz * 9, 0.2, 20, 0xe3b04b, 6);
      colliders.push(obb(x + sx * 180, z, 0.8, 0.8));
    }
    blockers.push([x - len / 2, z - wide / 2, x + len / 2, z + wide / 2]);
  }
  {
    const { x, z } = NEAR.DIAMOND;
    // home plate at the southeast corner, the field opening northwest: a dirt
    // fan between the foul lines with the infield grass square inside it
    const hx = x + 30, hz = z + 30, fan = [[hx, hz]];
    for (let i = 0; i <= 12; i++) {
      const t = Math.PI + (i / 12) * (Math.PI / 2);
      fan.push([hx + Math.cos(t) * 120, hz + Math.sin(t) * 120]);
    }
    g.landcover.poly(fan, 0.01, SAND);
    g.drives.poly([[hx - 6, hz - 6], [hx - 63, hz - 6], [hx - 63, hz - 63], [hx - 6, hz - 63]], 0.02, TURF);
    blockers.push([x - 100, z - 100, x + 40, z + 40]);
  }
  {
    const [x1, z1, x2, z2] = NEAR.POOL;
    g.lots.flat((x1 + x2) / 2, 0.04, (z1 + z2) / 2, x2 - x1, z2 - z1, CONCRETE);
    g.paint.flat((x1 + x2) / 2, 0.06, (z1 + z2) / 2, x2 - x1 - 22, z2 - z1 - 22, WATER);
    blockers.push(NEAR.POOL);
  }
  {
    const [x1, z1, x2, z2] = NEAR.COURT;
    const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2, w = x2 - x1, d = z2 - z1;
    g.drives.flat(cx, 0.02, cz, w, d, COURT);
    for (const [fx, fz, fw, fd] of [[0, -d / 2 + 6, w - 12, 0.5], [0, d / 2 - 6, w - 12, 0.5], [-w / 2 + 6, 0, 0.5, d - 12], [w / 2 - 6, 0, 0.5, d - 12], [0, 0, w - 12, 0.5]]) {
      g.paint.flat(cx + fx, 0.04, cz + fz, fw, fd, PAINT);
    }
    blockers.push(NEAR.COURT);
  }

  // ---- buildings ----
  for (const bd of NEAR.BUILDINGS) {
    const ry = bd.ry || 0;
    colliders.push(obb(bd.x, bd.z, bd.w, bd.d, ry));
    const ex = Math.abs(Math.cos(ry)) * bd.w / 2 + Math.abs(Math.sin(ry)) * bd.d / 2;
    const ez = Math.abs(Math.sin(ry)) * bd.w / 2 + Math.abs(Math.cos(ry)) * bd.d / 2;
    blockers.push([bd.x - ex, bd.z - ez, bd.x + ex, bd.z + ez]);
    if (bd.h < CUT_MIN_H || bd.roof === 'stands') {
      drawBuilding(b, bd);
      continue;
    }
    const t = createBatch();
    drawBuilding(t, bd);
    const full = t.build();
    scene.add(full);
    cuttables.push({ full, cut: null, ratio: cutH / bd.h, k: 0, hold: 0,
      box: { x1: bd.x - ex - 1, z1: bd.z - ez - 1, x2: bd.x + ex + 1, z2: bd.z + ez + 1, h: bd.h } });
  }
  for (const a of flatAreas) blockers.push(a);

  const roadClear = (x, z, pad) => NEAR.ROADS.every((r) => distToLine(x, z, r.pts) > r.w / 2 + pad);

  // ---- trees: stands filled on a jittered grid (like the lot's woods), plus single trees ----
  const treeOk = (x, z) => roadClear(x, z, 6) && !blockers.some((a) => inRect(x, z, a, 3));
  for (const w of NEAR.WOODS) {
    for (let x = w.x1; x <= w.x2; x += w.step) {
      for (let z = w.z1; z <= w.z2; z += w.step) {
        if (rand() < 0.2) continue;
        const tx = x + (rand() - 0.5) * w.step * 0.6, tz = z + (rand() - 0.5) * w.step * 0.6;
        if (!treeOk(tx, tz)) continue;
        drawTree(b, tx, tz, 10 + rand() * 5, rand, true);
        colliders.push(obb(tx, tz, 1.8, 1.8));
      }
    }
  }
  for (const [x, z, R] of NEAR.TREES) {
    if (!treeOk(x, z)) continue;
    drawTree(b, x, z, R, rand);
    colliders.push(obb(x, z, 1.8, 1.8));
  }

  // ---- utility poles along the cross street, and the signal at the east end ----
  const cross = NEAR.ROADS[0].pts;
  const crossZ = (x) => {
    for (let i = 0; i < cross.length - 1; i++) {
      const [x1, z1] = cross[i], [x2, z2] = cross[i + 1];
      if ((x - x1) * (x - x2) <= 0) return z1 + (z2 - z1) * (x - x1) / (x2 - x1);
    }
    return cross[0][1];
  };
  for (const [k, x] of NEAR.POLES.entries()) {
    const box = props.add(`near:pole${k}`, 'pole', x, crossZ(x) + 27);
    if (box) colliders.push(box);
  }
  {
    // signal masts on the four corners, arms reaching over the lanes; stop bars before the corner
    const { x, z } = NEAR.SIGNAL;
    for (const [k, [sx, sz]] of [[1, -1], [-1, 1], [-1, -1], [1, 1]].entries()) {
      const px = x + sx * 30, pz = z + sz * 29;
      const box = props.add(`near:signal${k}`, 'signal', px, pz, Math.atan2(px - x, pz - z));
      if (box) colliders.push(box);
    }
    g.paint.flat(x - 10, 0.06, z - 36, 20, 1.4, PAINT);   // southbound
    g.paint.flat(x + 10, 0.06, z + 36, 20, 1.4, PAINT);   // northbound
    g.paint.flat(x + 38, 0.06, z - 10, 1.4, 20, PAINT);   // westbound
    g.paint.flat(x - 38, 0.06, z + 10, 1.4, 20, PAINT);   // eastbound
  }

  // ---- pavement raster for the car (4 ft cells) ----
  const CELL = 4, pad = 40;
  const X0 = NEAR.REGION.x1 - pad, Z0 = NEAR.REGION.z1 - pad;
  const W = Math.ceil((NEAR.REGION.x2 - NEAR.REGION.x1 + 2 * pad) / CELL);
  const H = Math.ceil((NEAR.REGION.z2 - NEAR.REGION.z1 + 2 * pad) / CELL);
  const grid = new Uint8Array(W * H);
  const markRect = ([x1, z1, x2, z2]) => {
    for (let i = Math.max(0, Math.floor((x1 - X0) / CELL)); i <= Math.min(W - 1, Math.floor((x2 - X0) / CELL)); i++) {
      for (let j = Math.max(0, Math.floor((z1 - Z0) / CELL)); j <= Math.min(H - 1, Math.floor((z2 - Z0) / CELL)); j++) grid[j * W + i] = 1;
    }
  };
  const markSeg = (x1, z1, x2, z2, hw) => {
    const i0 = Math.max(0, Math.floor((Math.min(x1, x2) - hw - X0) / CELL)), i1 = Math.min(W - 1, Math.floor((Math.max(x1, x2) + hw - X0) / CELL));
    const j0 = Math.max(0, Math.floor((Math.min(z1, z2) - hw - Z0) / CELL)), j1 = Math.min(H - 1, Math.floor((Math.max(z1, z2) + hw - Z0) / CELL));
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        if (distToSeg(X0 + (i + 0.5) * CELL, Z0 + (j + 0.5) * CELL, x1, z1, x2, z2) <= hw) grid[j * W + i] = 1;
      }
    }
  };
  const markLine = (pts, hw) => { for (let i = 0; i < pts.length - 1; i++) markSeg(...pts[i], ...pts[i + 1], hw); };
  for (const r of NEAR.ROADS) markLine(r.pts, r.w / 2 + 1.5);
  for (const s of [...NEAR.SIDEWALKS, ...LOT.SIDEWALKS]) markLine(s.pts, s.w / 2 + 1);
  for (const a of [...flatAreas, ...LOT.WALKS]) markRect(a);
  markLine(cross, 30); // the lot's frontage strip
  function paved(x, z) {
    const i = Math.floor((x - X0) / CELL), j = Math.floor((z - Z0) / CELL);
    if (i < 0 || j < 0 || i >= W || j >= H) return false;
    return grid[j * W + i] === 1;
  }

  return { paved };
}

