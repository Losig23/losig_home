/*
Static-scenery batching: lots of primitives -> one vertex-colored mesh.

Outdoors there are hundreds of boxes, cylinders and blobs (stall lines,
curbs, windows, tree canopies, parked cars). As separate meshes that's
hundreds of draw calls, doubled by the ink pass's normal render. Merged
into one non-indexed geometry with a per-vertex color it's one draw call,
and it still uses the same toon material (pencil) so it shades and inks
exactly like the apartment's per-color meshes.

Primitives take a base position like apartment.js furniture: y is the
bottom of the shape, not its center. frame() sets a parent transform so a
whole object (a car, a building) can be drawn in its own local axes.
*/import * as THREE from 'three';
import { pencil } from './pencil.js';

const VERTEX_COLORED = pencil(0xffffff, { vertexColors: true });

// Flat ground layers (grass, fields, roads, lots, paint) sit a fraction of a
// foot apart, which the depth buffer can't tell apart a few hundred feet out
// from a driver's-eye camera. Each layer gets its own polygon offset instead,
// so the higher layer always wins: 0 = paint ... 4 = the grass itself.
const LAYERS = [];
export function groundLayer(n) {
  if (!LAYERS[n]) {
    LAYERS[n] = pencil(0xffffff, { vertexColors: true, polygonOffset: n > 0, polygonOffsetFactor: n * 2, polygonOffsetUnits: n * 2 });
  }
  return LAYERS[n];
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();


export function createBatch() {
  const parts = [];
  let frame = new THREE.Matrix4();

  // geometry is consumed (transformed + disposed) at build time
  function geo(g, color, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) {
    _e.set(rx, ry, rz, 'YXZ');
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(1, 1, 1));
    parts.push({ g, color, m: frame.clone().multiply(_m) });
  }

  return {
    geo,
    /** Draw subsequent parts in a local frame: translated to x/z, turned by ry. */
    frame(x = 0, z = 0, ry = 0, y = 0) {
      frame = new THREE.Matrix4().compose(
        new THREE.Vector3(x, y, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
        new THREE.Vector3(1, 1, 1));
    },
    endFrame() { frame = new THREE.Matrix4(); },
    box(x, y, z, w, h, d, color, ry = 0) {
      geo(new THREE.BoxGeometry(w, h, d), color, x, y + h / 2, z, ry);
    },
    cyl(x, y, z, r, h, color, segs = 14, rTop = r) {
      geo(new THREE.CylinderGeometry(rTop, r, h, segs), color, x, y + h / 2, z);
    },
    cone(x, y, z, r, h, color, segs = 10) {
      geo(new THREE.ConeGeometry(r, h, segs), color, x, y + h / 2, z);
    },
    blob(x, y, z, r, color, sy = 1) {
      const g = new THREE.IcosahedronGeometry(r, 1);
      if (sy !== 1) g.scale(1, sy, 1);
      geo(g, color, x, y, z);
    },
    /** Flat rectangle facing up (paint, markings): no side faces, so no ink outline. */
    flat(x, y, z, w, d, color, ry = 0) {
      const g = new THREE.PlaneGeometry(w, d);
      g.rotateX(-Math.PI / 2);
      geo(g, color, x, y, z, ry);
    },
    /** Flat polygon on the ground ([[x, z], ...], any shape), at height y. */
    poly(points, y, color) {
      const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
      const g = new THREE.ShapeGeometry(shape);
      g.rotateX(-Math.PI / 2);
      geo(g, color, 0, y, 0);
    },
    /** Flat strip on the ground along a polyline, w wide, at height y. */
    ribbon(points, w, y, color, joints = true) {
      for (let i = 0; i < points.length - 1; i++) {
        const [x1, z1] = points[i], [x2, z2] = points[i + 1];
        const len = Math.hypot(x2 - x1, z2 - z1);
        const g = new THREE.PlaneGeometry(w, len);
        g.rotateX(-Math.PI / 2);
        geo(g, color, (x1 + x2) / 2, y, (z1 + z2) / 2, Math.atan2(x2 - x1, z2 - z1));
        // round joints fill the wedge gaps where segments meet at an angle
        if (joints && i > 0) {
          const c = new THREE.CircleGeometry(w / 2, 16);
          c.rotateX(-Math.PI / 2);
          geo(c, color, x1, y, z1);
        }
      }
    },
    /** Add a ready-made geometry with a full matrix (mergeMeshes); color null keeps its own color attribute. */
    raw(g, color, matrix) { parts.push({ g, color, m: matrix }); },
    get count() { return parts.length; },
    /**
     * Merge everything added so far into one mesh (null if empty).
     * layer: a groundLayer() index for flat ground. tile: split into square
     * tiles this many feet across (a Group of meshes), so the parts of a big
     * map that are off screen, or outside the sun's shadow box, get culled.
     */
    build({ castShadow = true, receiveShadow = true, layer = null, tile = 0 } = {}) {
      if (!parts.length) return null;
      const opts = { castShadow, receiveShadow, layer };
      if (!tile) {
        const mesh = merge(parts, opts);
        parts.length = 0;
        return mesh;
      }
      const tiles = new Map();
      for (const p of parts) {
        const k = `${Math.floor(p.m.elements[12] / tile)},${Math.floor(p.m.elements[14] / tile)}`;
        if (!tiles.has(k)) tiles.set(k, []);
        tiles.get(k).push(p);
      }
      parts.length = 0;
      const group = new THREE.Group();
      for (const list of tiles.values()) group.add(merge(list, opts));
      return group;
    },
  };
}

function merge(parts, { castShadow, receiveShadow, layer }) {
  let n = 0;
  const flat = parts.map((p) => {
    const g = p.g.index ? p.g.toNonIndexed() : p.g;
    if (g !== p.g) p.g.dispose();
    g.applyMatrix4(p.m);
    n += g.attributes.position.count;
    return { g, color: p.color };
  });
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const { g, color } of flat) {
    const cnt = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nrm.set(g.attributes.normal.array, o * 3);
    if (color === null) {
      col.set(g.attributes.color.array, o * 3); // already linear
    } else {
      _c.set(color); // hex -> linear working space, same as material.color (a Color is copied as is)
      for (let i = 0; i < cnt; i++) _c.toArray(col, (o + i) * 3);
    }
    o += cnt;
    g.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  merged.setAttribute('color', new THREE.BufferAttribute(col, 3));
  merged.computeBoundingSphere();
  const mesh = new THREE.Mesh(merged, layer === null ? VERTEX_COLORED : groundLayer(layer));
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  return mesh;
}

/**
 * Collapse a built hierarchy of toon meshes into one vertex-colored mesh per
 * moving part. `bones` are the groups that animate (the root counts as one);
 * every mesh is baked into its nearest bone, keeping its look exactly.
 * Textured meshes (lettering) can't merge, so they're re-parented as they are.
 */
export function mergeMeshes(root, bones) {
  const set = new Set([root, ...bones]);
  root.updateMatrixWorld(true);
  const batches = new Map();
  const meshes = [];
  root.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const inv = new THREE.Matrix4();
  for (const m of meshes) {
    let bone = m.parent;
    while (!set.has(bone)) bone = bone.parent;
    if (m.material.map) {
      bone.attach(m);
      continue;
    }
    if (!batches.has(bone)) batches.set(bone, createBatch());
    inv.copy(bone.matrixWorld).invert();
    const g = m.geometry.clone();
    const own = m.material.vertexColors && g.attributes.color;
    batches.get(bone).raw(g, own ? null : m.material.color, inv.clone().multiply(m.matrixWorld));
  }
  for (const m of meshes) {
    if (m.material.map) continue;
    // children that are bones or textured meshes were already moved out
    m.parent.remove(m);
    m.geometry.dispose();
  }
  for (const [bone, b] of batches) bone.add(b.build({ receiveShadow: false }));
}

/** Box geometry whose top face is pulled in: windshield rakes, hatch slopes, tumblehome. */
export function taperBox(w, h, d, insetFront, insetBack, insetSide) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) <= 0) continue;
    const z = p.getZ(i), x = p.getX(i);
    p.setZ(i, z > 0 ? z - insetFront : z + insetBack);
    p.setX(i, x - Math.sign(x) * insetSide);
  }
  g.computeVertexNormals(); // non-indexed -> flat per-face normals, crisp toon facets
  return g;
}
