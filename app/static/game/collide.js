/*
Outdoor collision: solids in uniform grids, queried with circles.

Ani is one circle and the RAV4 is three along its length. Solids are boxes,
either axis-aligned {x1, z1, x2, z2} (the lot's colliders) or turned
{x, z, hw, hd, ry} (buildings along a curving street), stored the same way
as a center, half-extents and a rotation; or polygons {poly: [[x, z], ...]}
for buildings with odd footprints. `circles` holds moving solids (the
parked RAV4) that aren't worth re-gridding. A solid marked `breakable`
(poles, signs) can be knocked down; a broken one is `dead` and ignored.

The town streams in 600 ft chunks, each with its own grid; createWorld()
answers the same queries across the hand-built area and whatever chunks
are loaded.

Rotation follows three.js rotation.y: a box's local +X points along
(cos ry, -sin ry) and local +Z along (sin ry, cos ry).
*/

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function makeBox(c) {
  if (c.poly) {
    const xs = c.poly.map((p) => p[0]), zs = c.poly.map((p) => p[1]);
    return { ...c, x1: Math.min(...xs), z1: Math.min(...zs), x2: Math.max(...xs), z2: Math.max(...zs) };
  }
  if ('x1' in c) {
    return { ...c, x: (c.x1 + c.x2) / 2, z: (c.z1 + c.z2) / 2, hw: (c.x2 - c.x1) / 2, hd: (c.z2 - c.z1) / 2, c: 1, s: 0 };
  }
  const co = Math.cos(c.ry || 0), si = Math.sin(c.ry || 0);
  const ex = Math.abs(co) * c.hw + Math.abs(si) * c.hd, ez = Math.abs(si) * c.hw + Math.abs(co) * c.hd;
  return { ...c, c: co, s: si, x1: c.x - ex, z1: c.z - ez, x2: c.x + ex, z2: c.z + ez };
}

// circle against a polygon footprint: nearest edge, and which side the center is on
function circlePoly(b, x, z, r) {
  const P = b.poly;
  let best = Infinity, bx = 0, bz = 0, inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [ax, az] = P[j], [cx, cz] = P[i];
    if ((cz > z) !== (az > z) && x < (ax - cx) * (z - cz) / (az - cz) + cx) inside = !inside;
    const ex = cx - ax, ez = cz - az, L2 = ex * ex + ez * ez || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L2));
    const px = ax + ex * t, pz = az + ez * t, d2 = (x - px) ** 2 + (z - pz) ** 2;
    if (d2 < best) { best = d2; bx = px; bz = pz; }
  }
  const d = Math.sqrt(best);
  if (inside) {
    // out through the nearest edge
    return d > 1e-6 ? { nx: (bx - x) / d, nz: (bz - z) / d, depth: d + r } : { nx: 1, nz: 0, depth: r };
  }
  if (d >= r) return null;
  return { nx: (x - bx) / d, nz: (z - bz) / d, depth: r - d };
}

/** Penetration of a circle into a solid: {nx, nz, depth} pointing out of it, or null. */
export function circleBox(b, x, z, r) {
  if (b.poly) return circlePoly(b, x, z, r);
  const dx = x - b.x, dz = z - b.z;
  const lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
  const cx = clamp(lx, -b.hw, b.hw), cz = clamp(lz, -b.hd, b.hd);
  let nx, nz, depth;
  if (cx === lx && cz === lz) {
    // center inside: out through the nearest face
    const px = b.hw - Math.abs(lx), pz = b.hd - Math.abs(lz);
    if (px < pz) { nx = Math.sign(lx) || 1; nz = 0; depth = px + r; }
    else { nx = 0; nz = Math.sign(lz) || 1; depth = pz + r; }
  } else {
    const ex = lx - cx, ez = lz - cz, d2 = ex * ex + ez * ez;
    if (d2 >= r * r) return null;
    const d = Math.sqrt(d2);
    nx = ex / d; nz = ez / d; depth = r - d;
  }
  return { nx: nx * b.c + nz * b.s, nz: -nx * b.s + nz * b.c, depth };
}

// first t in 0..1 where a segment enters an axis-aligned rect, or null
function slab(x0, z0, x1, z1, rx1, rz1, rx2, rz2) {
  let t0 = 0, t1 = 1;
  for (const [p, d, lo, hi] of [[x0, x1 - x0, rx1, rx2], [z0, z1 - z0, rz1, rz2]]) {
    if (Math.abs(d) < 1e-9) {
      if (p < lo || p > hi) return null;
      continue;
    }
    let ta = (lo - p) / d, tb = (hi - p) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return null;
  }
  return t0;
}

// first t in 0..1 where a segment crosses a polygon's edge, or null
function segPoly(x0, z0, x1, z1, P) {
  const dx = x1 - x0, dz = z1 - z0;
  let best = null;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [ax, az] = P[j], [bx, bz] = P[i];
    const ex = bx - ax, ez = bz - az, den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((ax - x0) * ez - (az - z0) * ex) / den;
    const u = ((ax - x0) * dz - (az - z0) * dx) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1 && (best === null || t < best)) best = t;
  }
  return best;
}

export function createSolids(list, cell = 40) {
  const boxes = list.map(makeBox);
  const grid = new Map();
  const key = (i, j) => (i + 4096) * 8192 + (j + 4096);
  for (const b of boxes) {
    for (let i = Math.floor(b.x1 / cell); i <= Math.floor(b.x2 / cell); i++) {
      for (let j = Math.floor(b.z1 / cell); j <= Math.floor(b.z2 / cell); j++) {
        const k = key(i, j);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(b);
      }
    }
  }
  let stamp = 0;

  // every box whose bounds overlap the rect, once each
  function each(x1, z1, x2, z2, fn) {
    stamp++;
    for (let i = Math.floor(x1 / cell); i <= Math.floor(x2 / cell); i++) {
      for (let j = Math.floor(z1 / cell); j <= Math.floor(z2 / cell); j++) {
        const arr = grid.get(key(i, j));
        if (!arr) continue;
        for (const b of arr) {
          if (b.stamp === stamp || b.dead) continue;
          b.stamp = stamp;
          if (b.x2 < x1 || b.x1 > x2 || b.z2 < z1 || b.z1 > z2) continue;
          if (fn(b) === true) return;
        }
      }
    }
  }

  const solids = {
    boxes,
    circles: [], // moving solids: {x, z, r}
    /** Does a circle overlap anything? (Ani's movement test) */
    hit(x, z, r) {
      let found = false;
      each(x - r, z - r, x + r, z + r, (b) => (found = circleBox(b, x, z, r) !== null));
      if (found) return true;
      return solids.circles.some((c) => (x - c.x) ** 2 + (z - c.z) ** 2 < (r + c.r) ** 2);
    },
    /** Does a circle overlap any solid (ignoring the moving circles)? */
    hitBoxes(x, z, r) {
      let found = false;
      each(x - r, z - r, x + r, z + r, (b) => (found = circleBox(b, x, z, r) !== null));
      return found;
    },
    /** All overlaps of a circle with boxes (not the moving circles), as push-out contacts. */
    contacts(x, z, r, out) {
      out.length = 0;
      each(x - r, z - r, x + r, z + r, (b) => {
        const c = circleBox(b, x, z, r);
        if (c) { c.box = b; out.push(c); }
      });
      return out;
    },
    /**
     * First hit along a segment against boxes grown by `pad`, as a fraction
     * 0..1 of the way (1 = clear). The chase camera uses it to pull in.
     */
    ray(x0, z0, x1, z1, pad = 0, filter = null) {
      let best = 1;
      each(Math.min(x0, x1) - pad, Math.min(z0, z1) - pad, Math.max(x0, x1) + pad, Math.max(z0, z1) + pad, (b) => {
        if (filter && !filter(b)) return;
        if (b.poly) {
          // first crossing of the footprint's edges, backed off by pad (its bounding
          // box isn't enough: an L-shaped store's box can cover its own parking lot)
          if (slab(x0, z0, x1, z1, b.x1 - pad, b.z1 - pad, b.x2 + pad, b.z2 + pad) === null) return;
          const t = segPoly(x0, z0, x1, z1, b.poly);
          if (t !== null) best = Math.min(best, Math.max(0, t - pad / (Math.hypot(x1 - x0, z1 - z0) || 1)));
          return;
        }
        // slab test in the box's own axes
        const ax = x0 - b.x, az = z0 - b.z, bx = x1 - b.x, bz = z1 - b.z;
        const p = [ax * b.c - az * b.s, ax * b.s + az * b.c];
        const q = [bx * b.c - bz * b.s, bx * b.s + bz * b.c];
        const half = [b.hw + pad, b.hd + pad];
        let t0 = 0, t1 = 1;
        for (let k = 0; k < 2; k++) {
          const d = q[k] - p[k];
          if (Math.abs(d) < 1e-9) {
            if (Math.abs(p[k]) > half[k]) return;
            continue;
          }
          let ta = (-half[k] - p[k]) / d, tb = (half[k] - p[k]) / d;
          if (ta > tb) [ta, tb] = [tb, ta];
          t0 = Math.max(t0, ta);
          t1 = Math.min(t1, tb);
          if (t0 > t1) return;
        }
        best = Math.min(best, t0);
      });
      return best;
    },
  };
  return solids;
}

/**
 * One set of queries over the hand-built area's solids and the streamed
 * chunks' own grids. Chunks register with add(key, solids, rect) and leave
 * with remove(key); a query looks in the chunks its circle (plus `reach`,
 * how far a building may hang over its chunk's edge) can touch.
 */
export function createWorld(base, chunk = 600, reach = 150) {
  const chunks = new Map();          // "i,j" -> solids
  const near = (x1, z1, x2, z2) => {
    const out = [base];
    for (let i = Math.floor((x1 - reach) / chunk); i <= Math.floor((x2 + reach) / chunk); i++) {
      for (let j = Math.floor((z1 - reach) / chunk); j <= Math.floor((z2 + reach) / chunk); j++) {
        const c = chunks.get(`${i},${j}`);
        if (c) out.push(c);
      }
    }
    return out;
  };
  const world = {
    get circles() { return base.circles; },
    set circles(v) { base.circles = v; },
    add(key, solids) { chunks.set(key, solids); },
    remove(key) { chunks.delete(key); },
    hit(x, z, r) {
      return near(x - r, z - r, x + r, z + r).some((s, i) => (i === 0 ? s.hit(x, z, r) : s.hitBoxes(x, z, r)));
    },
    contacts(x, z, r, out) {
      out.length = 0;
      const tmp = [];
      for (const s of near(x - r, z - r, x + r, z + r)) out.push(...s.contacts(x, z, r, tmp));
      return out;
    },
    ray(x0, z0, x1, z1, pad = 0, filter = null) {
      let best = 1;
      for (const s of near(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1))) {
        best = Math.min(best, s.ray(x0, z0, x1, z1, pad, filter));
      }
      return best;
    },
  };
  return world;
}
