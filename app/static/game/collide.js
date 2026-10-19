/*
Outdoor collision: solid boxes in a uniform grid, queried with circles.

Ani is one circle and the RAV4 is three along its length. Boxes are either
axis-aligned {x1, z1, x2, z2} (the lot's colliders) or turned
{x, z, hw, hd, ry} (buildings measured along a curving street); both are
stored the same way, as a center, half-extents and a rotation, so one
closest-point test covers everything. `circles` holds moving solids (the
parked RAV4) that aren't worth re-gridding.

Rotation follows three.js rotation.y: a box's local +X points along
(cos ry, -sin ry) and local +Z along (sin ry, cos ry).
*/

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function makeBox(c) {
  if ('x1' in c) {
    return { ...c, x: (c.x1 + c.x2) / 2, z: (c.z1 + c.z2) / 2, hw: (c.x2 - c.x1) / 2, hd: (c.z2 - c.z1) / 2, c: 1, s: 0 };
  }
  const co = Math.cos(c.ry || 0), si = Math.sin(c.ry || 0);
  const ex = Math.abs(co) * c.hw + Math.abs(si) * c.hd, ez = Math.abs(si) * c.hw + Math.abs(co) * c.hd;
  return { ...c, c: co, s: si, x1: c.x - ex, z1: c.z - ez, x2: c.x + ex, z2: c.z + ez };
}

/** Penetration of a circle into a box: {nx, nz, depth} pointing out of the box, or null. */
export function circleBox(b, x, z, r) {
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
          if (b.stamp === stamp) continue;
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
