/*
The active route to a place: the line A* found (roads.js), drawn on the
ground, followed as you drive, and read out as the next turn.

- The ribbon is a pale blue band down the middle of the street with paper
  chevrons every 28 ft pointing the way, one mesh for the whole route. It
  sits on the ground layers (batch.js GROUND) a step above the paint, so it
  never z-fights the road from the driver's seat. Every vertex knows how far
  along the route it is, and the shader drops what's behind you, so the
  ribbon eats itself as you drive without rebuilding anything.
- Progress is the nearest point on the route, searched a little behind and
  ahead of the last one. Wander more than 90 ft off it for 1.5 s and the
  route is worked out again from where you are.
- The last leg runs from the nearest street into the place's parking spot.
*/import * as THREE from 'three';
import { pencil } from './pencil.js';
import { lengths } from './roads.js';

const BAND = new THREE.Color(0xa9c4f5);
const CHEVRON = new THREE.Color(0xfffdf6);
const W = 7;            // band width, ft
const STEP = 28;        // chevron spacing, ft

/** "350 ft" under 1,000 ft (to the nearest 50), else miles to a tenth. */
export function fmtDist(ft) {
  if (ft < 1000) return `${Math.max(50, Math.round(ft / 50) * 50)} ft`;
  return `${(ft / 5280).toFixed(1)} mi`;
}

function material() {
  const m = pencil(0xffffff, { vertexColors: true, side: THREE.DoubleSide });
  m.userData.cut = { value: -1e9 };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.cut = m.userData.cut;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float along;\nattribute float layer;\nvarying float vAlong;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n\tvAlong = along;\n\tgl_Position.z += layer * 4e-6 * gl_Position.w;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float cut;\nvarying float vAlong;')
      .replace('void main() {', 'void main() {\n\tif (vAlong < cut) discard;');
  };
  m.customProgramCacheKey = () => 'route-ribbon';
  return m;
}

function ribbonGeometry(pts, at) {
  const pos = [], col = [], along = [], layer = [];
  // a flat quad a-b-c-d with how far along the route each corner is
  const quad = (q, s, color, l) => {
    for (const k of [0, 1, 2, 0, 2, 3]) {
      pos.push(q[k][0], 0.12, q[k][1]);
      col.push(color.r, color.g, color.b);
      along.push(s[k]);
      layer.push(l);
    }
  };
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, z1] = pts[i], [x2, z2] = pts[i + 1];
    const len = at[i + 1] - at[i];
    if (len < 0.01) continue;
    const tx = (x2 - x1) / len, tz = (z2 - z1) / len, nx = -tz, nz = tx;
    // the band in pieces of up to 24 ft (a quad hundreds of feet long loses the
    // depth fight with the road under it), each run a little long so bends don't open gaps
    const h = W / 2, e = 1.5, n = Math.ceil(len / 24);
    for (let k = 0; k < n; k++) {
      const u0 = (len * k) / n - e, u1 = (len * (k + 1)) / n + e;
      const ax = x1 + tx * u0, az = z1 + tz * u0, bx = x1 + tx * u1, bz = z1 + tz * u1;
      quad([[ax + nx * h, az + nz * h], [bx + nx * h, bz + nz * h], [bx - nx * h, bz - nz * h], [ax - nx * h, az - nz * h]],
        [at[i] + u0, at[i] + u1, at[i] + u1, at[i] + u0], BAND, -3);
    }
    // chevrons: a ">" of two bars, tip forward
    for (let s = Math.ceil(at[i] / STEP) * STEP; s < at[i + 1]; s += STEP) {
      const u = s - at[i], cx = x1 + tx * (u + 1.3), cz = z1 + tz * (u + 1.3);
      for (const side of [-1, 1]) {
        const bx = cx - tx * 2.6 + nx * side * 2.4, bz = cz - tz * 2.6 + nz * side * 2.4;
        const dx = cx - bx, dz = cz - bz, dl = Math.hypot(dx, dz), px = -dz / dl * 0.5, pz = dx / dl * 0.5;
        quad([[bx - px, bz - pz], [cx - px, cz - pz], [cx + px, cz + pz], [bx + px, bz + pz]], [s, s, s, s], CHEVRON, -5);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
  g.setAttribute('layer', new THREE.Float32BufferAttribute(layer, 1));
  g.computeBoundingSphere();
  return g;
}

export function createRoute({ scene, roads }) {
  const mat = material();
  let r = null;          // {place, pts, at, total, turns, mesh, i, s}
  let off = 0, since = 0;

  function build(place, from) {
    const a = roads.snap(from.x, from.z), b = roads.snap(place.park.x, place.park.z);
    const found = a && b ? roads.route(a, b) : null;
    if (!found) return null;
    const pts = found.pts.slice();
    // the last few feet off the street into the parking spot
    if (Math.hypot(place.park.x - b.x, place.park.z - b.z) > 6) pts.push([place.park.x, place.park.z]);
    const at = lengths(pts);
    return { place, pts, at, total: at[at.length - 1], turns: found.turns, i: 0, s: 0 };
  }

  function show(next) {
    if (r?.mesh) {
      scene.remove(r.mesh);
      r.mesh.geometry.dispose();
    }
    r = next;
    if (!r) return;
    r.mesh = new THREE.Mesh(ribbonGeometry(r.pts, r.at), mat);
    r.mesh.receiveShadow = true;
    r.mesh.frustumCulled = false;
    scene.add(r.mesh);
    mat.userData.cut.value = -1e9;
  }

  // nearest point on the route around the last one: {i, s, d}
  function locate(x, z) {
    let best = null;
    for (let i = Math.max(0, r.i - 3); i < Math.min(r.pts.length - 1, r.i + 60); i++) {
      const [x1, z1] = r.pts[i], [x2, z2] = r.pts[i + 1];
      const dx = x2 - x1, dz = z2 - z1, L2 = dx * dx + dz * dz || 1;
      const u = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / L2));
      const d = Math.hypot(x - x1 - dx * u, z - z1 - dz * u);
      if (!best || d < best.d - 0.5) best = { i, s: r.at[i] + u * Math.sqrt(L2), d };
    }
    return best;
  }

  return {
    get active() { return !!r; },

    /** Plan a route to a place from {x, z}; false if there's no way there. */
    set(place, from) {
      show(build(place, from));
      off = 0; since = 0;
      return !!r;
    },
    clear() { show(null); },

    update(dt, me) {
      if (!r) return;
      since += dt;
      const at = locate(me.x, me.z);
      if (at) { r.i = at.i; r.s = Math.max(r.s - 30, at.s); }
      off = at && at.d < 90 ? 0 : off + dt;
      if (off > 1.5 && since > 3) {
        // off the route: work it out again from here
        const again = build(r.place, me);
        if (again) show(again);
        off = 0; since = 0;
        return;
      }
      mat.userData.cut.value = r.s - 12;
    },

    /** The next turn from here: {dir, dist, left (to the destination)}. */
    next() {
      if (!r) return null;
      const left = Math.max(0, r.total - r.s);
      const t = r.turns.find((x) => x.at > r.s + 8);
      if (left < 120) return { dir: 'arrive', dist: left, left };
      if (!t) return { dir: 'straight', dist: left, left };
      return { dir: t.dir, dist: t.at - r.s, left };
    },

    /** The route from here on, up to `reach` feet of it (for the minimap). */
    ahead(me, reach) {
      if (!r) return [];
      const out = [[me.x, me.z]];
      for (let i = r.i + 1; i < r.pts.length; i++) {
        out.push(r.pts[i]);
        if (r.at[i] - r.s > reach) break;
      }
      return out;
    },
  };
}
