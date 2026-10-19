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

export const VERTEX_COLORED = pencil(0xffffff, { vertexColors: true });

// Flat ground (grass, fields, drives, streets, lots, paint) sits a fraction
// of a foot apart, which the depth buffer can't separate a few hundred feet
// out from a driver's-eye camera. Every ground vertex carries a `layer`
// (0 = paint ... 6 = grass) and the shader pushes deeper layers back by a
// fixed depth step, so the higher layer always wins, at any distance, with
// one material and one draw call for the lot. Fog and lighting are untouched
// (they use the real position); the ink pass's own depth render ignores it.
export const GROUND = pencil(0xffffff, { vertexColors: true });
GROUND.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float layer;')
    .replace('#include <project_vertex>', '#include <project_vertex>\n\tgl_Position.z += layer * 4e-6 * gl_Position.w;');
};
GROUND.customProgramCacheKey = () => 'ground-layers';
export const LAYER = { paint: 0, lots: 1, streets: 2, drives: 3, landcover: 4, water: 5, grass: 6 };

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();

// unit shapes, made once and copied: building a chunk of town makes thousands
const unit = new Map();
function proto(key, make) {
  if (!unit.has(key)) {
    const g = make();
    unit.set(key, g.index ? g.toNonIndexed() : g);
  }
  return unit.get(key).clone();
}
const unitBox = () => proto('box', () => new THREE.BoxGeometry(1, 1, 1));
const unitFlat = () => proto('flat', () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
const unitDisc = () => proto('disc', () => new THREE.CircleGeometry(0.5, 16).rotateX(-Math.PI / 2));
const unitBlob = () => proto('blob', () => new THREE.IcosahedronGeometry(1, 1));
const unitCyl = (segs, taper) => proto(`cyl${segs}:${taper.toFixed(3)}`, () => new THREE.CylinderGeometry(taper, 1, 1, segs));
// an attic: a triangle across z (1 wide, 1 tall) run along x from -0.5 to 0.5, no floor
const unitGable = () => proto('gable', () => {
  const A = [-0.5, 0, -0.5], B = [0.5, 0, -0.5], C = [0.5, 1, 0], D = [-0.5, 1, 0];
  const E = [-0.5, 0, 0.5], F = [0.5, 0, 0.5];
  const tris = [
    [B, C, F], [E, D, A],                 // the two gable ends
    [A, C, B], [A, D, C],                 // slope toward -z
    [E, F, C], [E, C, D],                 // slope toward +z
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tris.flat(2)), 3));
  g.computeVertexNormals();
  return g;
});


export function createBatch() {
  const parts = [];
  let frame = new THREE.Matrix4();
  let layer = null;
  let tag = null;

  // geometry is consumed (transformed + disposed) at build time
  function geo(g, color, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    _e.set(rx, ry, rz, 'YXZ');
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    parts.push({ g, color, m: frame.clone().multiply(_m), layer, tag });
  }

  const api = {
    geo,
    /** Draw subsequent parts in a local frame: translated to x/z, turned by ry. */
    frame(x = 0, z = 0, ry = 0, y = 0) {
      frame = new THREE.Matrix4().compose(
        new THREE.Vector3(x, y, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
        new THREE.Vector3(1, 1, 1));
    },
    endFrame() { frame = new THREE.Matrix4(); },
    /** Ground layer (LAYER.*) for the flat parts that follow; build with {ground: true}. */
    setLayer(n) { layer = n; },
    /** Label the parts that follow; the built mesh's userData.ranges maps each tag to its vertices. */
    setTag(t) { tag = t; },
    box(x, y, z, w, h, d, color, ry = 0) {
      geo(unitBox(), color, x, y + h / 2, z, ry, 0, 0, w, h, d);
    },
    cyl(x, y, z, r, h, color, segs = 14, rTop = r) {
      geo(unitCyl(segs, rTop / r), color, x, y + h / 2, z, 0, 0, 0, r, h, r);
    },
    cone(x, y, z, r, h, color, segs = 10) {
      geo(new THREE.ConeGeometry(r, h, segs), color, x, y + h / 2, z);
    },
    /** Attic over a building: ridge along x, `len` long, `span` across z, `rise` tall, from height y. */
    gable(x, y, z, len, rise, span, color, ry = 0) {
      geo(unitGable(), color, x, y, z, ry, 0, 0, len, rise, span);
    },
    blob(x, y, z, r, color, sy = 1) {
      geo(unitBlob(), color, x, y, z, 0, 0, 0, r, r * sy, r);
    },
    /** Flat rectangle facing up (paint, markings): no side faces, so no ink outline. */
    flat(x, y, z, w, d, color, ry = 0) {
      geo(unitFlat(), color, x, y, z, ry, 0, 0, w, 1, d);
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
        if (len < 0.01) continue;
        geo(unitFlat(), color, (x1 + x2) / 2, y, (z1 + z2) / 2, Math.atan2(x2 - x1, z2 - z1), 0, 0, w, 1, len);
        // round joints fill the wedge gaps where segments meet at an angle
        if (joints && i > 0) geo(unitDisc(), color, x1, y, z1, 0, 0, 0, w, 1, w);
      }
    },
    /** Add a ready-made geometry with a full matrix (mergeMeshes); color null keeps its own color attribute. */
    raw(g, color, matrix) { parts.push({ g, color, m: matrix, layer, tag }); },
    get count() { return parts.length; },
    /**
     * Merge everything added so far into one mesh (null if empty).
     * ground: flat ground layered by setLayer() (no shadows cast). tile:
     * split into square tiles this many feet across (a Group of meshes), so
     * the parts of a big map that are off screen, or outside the sun's
     * shadow box, get culled.
     */
    build({ castShadow = true, receiveShadow = true, ground = false, tile = 0 } = {}) {
      if (!parts.length) return null;
      const opts = { castShadow: castShadow && !ground, receiveShadow, ground };
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
  return api;
}

/**
 * Views of one ground batch that draw into the named layers, so ground code
 * reads g.streets.ribbon(...), g.paint.flat(...), and all of it is one mesh.
 */
export function groundViews(b) {
  const view = (n) => new Proxy(b, {
    get(t, k) {
      const v = t[k];
      return typeof v === 'function' ? (...a) => { t.setLayer(n); return v(...a); } : v;
    },
  });
  return Object.fromEntries(Object.entries(LAYER).map(([name, n]) => [name, view(n)]));
}

function merge(parts, { castShadow, receiveShadow, ground }) {
  let n = 0;
  const flat = parts.map((p) => {
    const g = p.g.index ? p.g.toNonIndexed() : p.g;
    if (g !== p.g) p.g.dispose();
    g.applyMatrix4(p.m);
    n += g.attributes.position.count;
    return { g, color: p.color, layer: p.layer, tag: p.tag };
  });
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const lay = ground ? new Float32Array(n) : null;
  const ranges = new Map();
  let o = 0;
  for (const { g, color, layer, tag } of flat) {
    const cnt = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nrm.set(g.attributes.normal.array, o * 3);
    if (color === null) {
      col.set(g.attributes.color.array, o * 3); // already linear
    } else {
      _c.set(color); // hex -> linear working space, same as material.color (a Color is copied as is)
      for (let i = 0; i < cnt; i++) _c.toArray(col, (o + i) * 3);
    }
    if (lay) lay.fill(layer ?? 0, o, o + cnt);
    if (tag !== null && tag !== undefined) {
      const r = ranges.get(tag);
      if (r) r[1] = o + cnt - r[0];
      else ranges.set(tag, [o, cnt]);
    }
    o += cnt;
    g.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  merged.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (lay) merged.setAttribute('layer', new THREE.BufferAttribute(lay, 1));
  merged.computeBoundingSphere();
  const mesh = new THREE.Mesh(merged, ground ? GROUND : VERTEX_COLORED);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  if (ranges.size) mesh.userData.ranges = ranges;
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
