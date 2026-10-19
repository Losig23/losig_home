/*
Outdoor scenery shared by the lot (outside.js) and the blocks around it
(town.js): a seeded random generator, a couple of geometry helpers, and
the toon trees and wooden utility poles both places use.
*/import * as THREE from 'three';

export const TRUNK = 0x6b4a2f;
export const LEAVES = [0x4c8f45, 0x3f7e3a, 0x5f9e4f, 0x56994a];
export const WOOD_POLE = 0x7a5a3c;
export const LENS = 0xfff6d8;

// small deterministic PRNG so the woods grow the same way every load
export function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// a triangle/polygon extruded along +z by `depth` (roof attics, cross gables)
export function prism(points, depth) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
}

// polyline offset sideways by d (positive = to the right of travel, looking down +y)
export function offsetLine(pts, d) {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz) || 1;
    return [p[0] - (dz / len) * d, p[1] + (dx / len) * d];
  });
}

export function distToLine(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, z1] = pts[i], [x2, z2] = pts[i + 1];
    const dx = x2 - x1, dz = z2 - z1;
    const t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - x1 - t * dx, z - z1 - t * dz));
  }
  return best;
}

export const inRect = (x, z, [x1, z1, x2, z2], pad = 0) =>
  x >= x1 - pad && x <= x2 + pad && z >= z1 - pad && z <= z2 + pad;

/** Distance from a point to one segment. */
export function distToSeg(x, z, x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1;
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - x1 - t * dx, z - z1 - t * dz);
}

/**
 * A toon tree: trunk plus a cluster of icosahedron blobs. Returns the crown's
 * top height. `lite` (stands of trees seen mostly from a distance) drops two
 * of the side blobs, about a third fewer triangles for the same silhouette.
 */
export function drawTree(b, x, z, R, rand, lite = false) {
  const trunkH = 5 + R * 0.3;
  b.cyl(x, 0, z, 0.75, trunkH + R * 0.5, TRUNK, 8, 0.45);
  const cy = trunkH + R * 0.7;
  b.blob(x, cy, z, R * (lite ? 0.78 : 0.7), LEAVES[Math.floor(rand() * LEAVES.length)], 0.85);
  const n = lite ? 2 : 4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand() * 1.2;
    b.blob(x + Math.cos(a) * R * 0.48, cy + (rand() - 0.35) * R * 0.4, z + Math.sin(a) * R * 0.48,
      R * (0.42 + rand() * 0.14), LEAVES[Math.floor(rand() * LEAVES.length)], 0.85);
  }
  b.blob(x, cy + R * 0.45, z, R * 0.42, LEAVES[0], 0.85);
  return cy + R * 0.45 + R * 0.42 * 0.85; // top of the crown
}

/** A wooden utility pole with a cobra-head street light reaching north over the street. */
export function drawUtilityPole(b, x, z) {
  b.cyl(x, 0, z, 0.5, 31, WOOD_POLE, 8, 0.38);
  b.box(x, 28.4, z, 8, 0.45, 0.45, WOOD_POLE);
  for (const dx of [-3.4, 0, 3.4]) b.cyl(x + dx, 28.85, z, 0.16, 0.7, 0x9fb7a8, 6);
  // cobra-head street light out over the cross street (north of the pole)
  b.box(x, 24.4, z - 3.6, 0.25, 0.25, 7.2, 0x8a8f94);
  b.box(x, 24.0, z - 7.8, 1.0, 0.5, 2.1, 0x8a8f94);
  b.box(x, 23.94, z - 7.8, 0.75, 0.08, 1.6, LENS);
}
