/*
The whole town, streamed: 600 ft chunks baked by scripts/build_town.py into
app/static/game/town/, loaded around a look-ahead point and built in the
same style as the hand-built blocks (town.js).

- Chunks within `radius` of the focus load (1,200 ft on foot, 1,800 ft
  driving, the focus running ahead of the car), nearest first. Ones that
  fall 500 ft behind that unload and give their geometry back.
- Building is a generator stepped inside a ~4 ms budget per frame, so a new
  street of houses never hitches the drive. The fog hides the rest.
- Each chunk is three draw calls: its static mesh (buildings, curbs,
  sidewalks, trees), its ground (one layered mesh: land, water, drives,
  streets, lots, paint) and its breakable poles and signs.
- Each chunk brings its own collision grid (registered with the world's
  createWorld), sidewalk heights and a 4 ft "is this pavement?" raster.

Chunk data, all feet from the home lot's reference point: roads [look, w,
xz...], aisles [xz...] (parking aisles, paved with a row of stalls on each
side), curbs [x1, z1, x2, z2], walks [w, xz...], areas [kind, xz...],
rails [xz...], rivers [w, xz...], houses [x, z, w, d, ry, h, roof, siding,
roof color, commercial], blocks [xz..., h, color], trees [x, z, r], props
[kind, x, z, ry].
*/import * as THREE from 'three';
import { createBatch, groundViews } from './batch.js';
import { createSolids } from './collide.js';
import { rng, offsetLine, drawTree, distToSeg } from './scenery.js';
import { drawBuilding, drawStorefronts, HOUSE_SIDING, HOUSE_ROOF } from './town.js';

const ASPHALT = 0x7d8188;
const DRIVE = 0x8f9399;
const GRAVEL = 0xbab09f;
const WALK = 0xdcd8cf;
const CURB = 0xe6e2d9;
const YELLOW = 0xe3b04b;
const BALLAST = 0x9a958c;
const RAIL = 0x4a4448;
const AREA = {
  farm: [0x93b56c, 'landcover'], meadow: [0xb9c28c, 'landcover'], park: [0xa3cf88, 'landcover'],
  wood: [0x86b26c, 'landcover'], pitch: [0x58a052, 'landcover'], track: [0xc98a6a, 'landcover'],
  water: [0x74c6dc, 'water'], lot: [0x8f9399, 'lots'],
};
// commercial walls and flat roofs (brick, beige, white, metal, tan)
const SHOP_WALL = [0xc9a98a, 0xddd2bf, 0xece8df, 0xc9ccce, 0xd8c8a8];
const SHOP_ROOF = [0xe2ded6, 0x6b7077, 0xd9d4ca, 0x8d949b, 0xe2ded6];
const ROOFS = ['gable', 'flat', 'low'];
const CELL = 4, N = 150;   // pavement raster: 4 ft cells, 150 across a chunk
const AISLE = 58, STALL = 9; // an aisle's paved band (22 ft lane, 18 ft stalls each side); stall width

const pairs = (flat) => { const out = []; for (let i = 0; i < flat.length; i += 2) out.push([flat[i], flat[i + 1]]); return out; };

export function createTown({ scene, world, breakables, base = '/static/game/town/' }) {
  let index = null;
  let have = new Set();
  const chunks = new Map();        // "i,j" -> chunk
  let building = null;
  let size = 600;

  fetch(base + 'index.json').then((r) => (r.ok ? r.json() : null)).then((ix) => {
    if (!ix) return;
    index = ix;
    size = ix.chunk;
    have = new Set(ix.chunks.map(([i, j]) => `${i},${j}`));
  }).catch(() => {});

  function* build(c) {
    const d = c.data;
    const [ci, cj] = c.key.split(',').map(Number);
    const b = createBatch(), gb = createBatch(), g = groundViews(gb);
    const props = breakables.group();
    const colliders = [];
    const rand = rng(ci * 7919 + cj * 104729 + 17);

    for (const [kind, flat] of d.areas || []) {
      const [color, layer] = AREA[kind] || AREA.park;
      g[layer].poly(pairs(flat), 0.01, color);
    }
    yield;
    for (const [look, w, flat] of d.roads || []) {
      const pts = pairs(flat);
      const street = look === 'collector' || look === 'res';
      (street ? g.streets : g.drives).ribbon(pts, w, 0.02, street ? ASPHALT : look === 'track' ? GRAVEL : DRIVE);
      if (look === 'collector') for (const s of [-0.45, 0.45]) g.paint.ribbon(offsetLine(pts, s), 0.32, 0.05, YELLOW, false);
    }
    for (const [flat] of d.aisles || []) {
      const pts = pairs(flat);
      g.lots.ribbon(pts, AISLE, 0.03, AREA.lot[0]);
      for (let i = 0; i < pts.length - 1; i++) {
        const [x1, z1] = pts[i], [x2, z2] = pts[i + 1];
        const len = Math.hypot(x2 - x1, z2 - z1), tx = (x2 - x1) / len, tz = (z2 - z1) / len, ry = Math.atan2(tx, tz);
        for (let u = STALL; u < len - STALL / 2; u += STALL) {
          for (const side of [-1, 1]) {
            const o = side * (AISLE / 2 - 9);
            g.paint.flat(x1 + tx * u - tz * o, 0.05, z1 + tz * u + tx * o, 17, 0.4, 0xf4f1ea, ry);
          }
        }
      }
    }
    for (const flat of d.rails || []) {
      const pts = pairs(flat);
      g.drives.ribbon(pts, 10, 0.03, BALLAST);
      for (const s of [-2.35, 2.35]) g.paint.ribbon(offsetLine(pts, s), 0.45, 0.08, RAIL, false);
    }
    for (const [w, flat] of d.rivers || []) g.water.ribbon(pairs(flat), w, 0.01, AREA.water[0]);
    yield;
    for (const [x1, z1, x2, z2] of d.curbs || []) {
      const len = Math.hypot(x2 - x1, z2 - z1);
      b.box((x1 + x2) / 2, 0, (z1 + z2) / 2, 0.6, 0.45, len + 0.05, CURB, Math.atan2(x2 - x1, z2 - z1));
    }
    const walks = [];
    for (const [w, flat] of d.walks || []) {
      const pts = pairs(flat);
      for (let i = 0; i < pts.length - 1; i++) {
        const [x1, z1] = pts[i], [x2, z2] = pts[i + 1];
        const len = Math.hypot(x2 - x1, z2 - z1);
        b.box((x1 + x2) / 2, 0, (z1 + z2) / 2, w, 0.25, len, WALK, Math.atan2(x2 - x1, z2 - z1));
        if (i > 0) b.cyl(x1, 0, z1, w / 2, 0.25, WALK, 12);
        walks.push([x1, z1, x2, z2, w / 2]);
      }
    }
    yield;
    let n = 0;
    for (const [x, z, w, d2, ry, h, roof, siding, roofC, shop] of d.houses || []) {
      drawBuilding(b, {
        x, z, ry, w, d: d2, h, roof: ROOFS[roof],
        c: shop ? SHOP_WALL[siding % SHOP_WALL.length] : HOUSE_SIDING[siding % HOUSE_SIDING.length],
        r: shop ? SHOP_ROOF[siding % SHOP_ROOF.length] : HOUSE_ROOF[roofC % HOUSE_ROOF.length],
        windows: shop ? 'shop' : true,
      });
      colliders.push({ x, z, hw: w / 2, hd: d2 / 2, ry });
      if (++n % 12 === 0) yield;
    }
    for (const [flat, h, col] of d.blocks || []) {
      const pts = pairs(flat);
      const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
      const walls = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
      walls.rotateX(-Math.PI / 2);
      b.geo(walls, SHOP_WALL[col % SHOP_WALL.length]);
      // the roof deck sits a step up inside the wall tops, which read as a parapet
      b.poly(pts, h + 0.35, SHOP_ROOF[col % SHOP_ROOF.length]);
      drawStorefronts(b, pts, h);
      colliders.push({ poly: pts });
      if (++n % 6 === 0) yield;
    }
    for (const [x, z, r] of d.trees || []) {
      drawTree(b, x, z, r, rand, true);
      colliders.push({ x, z, hw: 0.9, hd: 0.9 });
      if (++n % 40 === 0) yield;
    }
    for (const [k, [kind, x, z, ry]] of (d.props || []).entries()) {
      const box = props.add(`${c.key}:${k}`, kind, x, z, ry);
      if (box) colliders.push(box);
    }
    yield;
    c.meshes = [b.build({ tile: 0 }), gb.build({ ground: true })].filter(Boolean);
    yield;
    props.build();
    c.props = props;
    for (const m of c.meshes) scene.add(m);
    c.solids = createSolids(colliders);
    world.add(c.key, c.solids);
    c.walks = walks;
    yield;
    c.raster = paveRaster(ci, cj, d);
  }

  function paveRaster(ci, cj, d) {
    const grid = new Uint8Array(N * N);
    const X0 = ci * size, Z0 = cj * size;
    const seg = (x1, z1, x2, z2, hw) => {
      const i0 = Math.max(0, Math.floor((Math.min(x1, x2) - hw - X0) / CELL)), i1 = Math.min(N - 1, Math.floor((Math.max(x1, x2) + hw - X0) / CELL));
      const j0 = Math.max(0, Math.floor((Math.min(z1, z2) - hw - Z0) / CELL)), j1 = Math.min(N - 1, Math.floor((Math.max(z1, z2) + hw - Z0) / CELL));
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          if (distToSeg(X0 + (i + 0.5) * CELL, Z0 + (j + 0.5) * CELL, x1, z1, x2, z2) <= hw) grid[j * N + i] = 1;
        }
      }
    };
    for (const [look, w, flat] of d.roads || []) {
      if (look === 'track') continue;
      for (let k = 0; k + 3 < flat.length; k += 2) seg(flat[k], flat[k + 1], flat[k + 2], flat[k + 3], w / 2 + 1.5);
    }
    for (const [w, flat] of d.walks || []) {
      for (let k = 0; k + 3 < flat.length; k += 2) seg(flat[k], flat[k + 1], flat[k + 2], flat[k + 3], w / 2 + 1);
    }
    for (const [flat] of d.aisles || []) {
      for (let k = 0; k + 3 < flat.length; k += 2) seg(flat[k], flat[k + 1], flat[k + 2], flat[k + 3], AISLE / 2);
    }
    for (const [kind, flat] of d.areas || []) {
      if (kind !== 'lot') continue;
      const P = pairs(flat);
      const xs = P.map((p) => p[0]), zs = P.map((p) => p[1]);
      for (let i = Math.max(0, Math.floor((Math.min(...xs) - X0) / CELL)); i <= Math.min(N - 1, Math.floor((Math.max(...xs) - X0) / CELL)); i++) {
        for (let j = Math.max(0, Math.floor((Math.min(...zs) - Z0) / CELL)); j <= Math.min(N - 1, Math.floor((Math.max(...zs) - Z0) / CELL)); j++) {
          const x = X0 + (i + 0.5) * CELL, z = Z0 + (j + 0.5) * CELL;
          let hit = false;
          for (let a = 0, b2 = P.length - 1; a < P.length; b2 = a++) {
            if ((P[a][1] > z) !== (P[b2][1] > z) && x < (P[b2][0] - P[a][0]) * (z - P[a][1]) / (P[b2][1] - P[a][1]) + P[a][0]) hit = !hit;
          }
          if (hit) grid[j * N + i] = 1;
        }
      }
    }
    return grid;
  }

  function unload(c) {
    if (c === building) building = null;
    for (const m of c.meshes || []) {
      scene.remove(m);
      m.geometry.dispose();
    }
    c.props?.dispose();
    world.remove(c.key);
    chunks.delete(c.key);
  }

  const chunkOf = (x, z) => chunks.get(`${Math.floor(x / size)},${Math.floor(z / size)}`);

  return {
    get ready() { return !!index; },
    /** The baked area's bounds [x1, z1, x2, z2] (null until the index arrives). */
    get bounds() { return index?.bounds ?? null; },
    get loaded() { return [...chunks.values()].filter((c) => c.solids).length; },
    get pending() { return [...chunks.values()].filter((c) => !c.solids).length; },

    /** Stream around (fx, fz): load within radius, drop beyond radius + 500, build within budget ms. */
    update(fx, fz, radius, budget = 4) {
      if (!index) return;
      const reach = radius + size;
      for (let i = Math.floor((fx - reach) / size); i <= Math.floor((fx + reach) / size); i++) {
        for (let j = Math.floor((fz - reach) / size); j <= Math.floor((fz + reach) / size); j++) {
          const key = `${i},${j}`;
          if (!have.has(key) || chunks.has(key)) continue;
          const dist = Math.hypot((i + 0.5) * size - fx, (j + 0.5) * size - fz);
          if (dist > radius) continue;
          const c = { key, i, j, data: null };
          chunks.set(key, c);
          fetch(`${base}c_${i}_${j}.json`).then((r) => r.json()).then((data) => { c.data = data; })
            .catch(() => { c.failed = true; });
        }
      }
      for (const c of [...chunks.values()]) {
        if (Math.hypot((c.i + 0.5) * size - fx, (c.j + 0.5) * size - fz) > radius + 500) unload(c);
      }
      const t0 = performance.now();
      while (performance.now() - t0 < budget) {
        if (!building) {
          // the nearest chunk whose data has arrived and isn't built yet
          let best = null, bestD = Infinity;
          for (const c of chunks.values()) {
            if (!c.data || c.solids || c.gen) continue;
            const dd = Math.hypot((c.i + 0.5) * size - fx, (c.j + 0.5) * size - fz);
            if (dd < bestD) { best = c; bestD = dd; }
          }
          if (!best) break;
          building = best;
          best.gen = build(best);
        }
        if (building.gen.next().done) {
          building.data = null;   // built; the JSON can go
          building = null;
        }
      }
    },

    /** Is (x, z) pavement? null where no chunk is loaded. */
    paved(x, z) {
      const c = chunkOf(x, z);
      if (!c?.raster) return null;
      const i = Math.floor((x - c.i * size) / CELL), j = Math.floor((z - c.j * size) / CELL);
      return c.raster[j * N + i] === 1;
    },

    /** Raised sidewalk under (x, z)? */
    onWalk(x, z) {
      const c = chunkOf(x, z);
      if (!c?.walks) return false;
      return c.walks.some(([x1, z1, x2, z2, hw]) => distToSeg(x, z, x1, z1, x2, z2) <= hw);
    },
  };
}
