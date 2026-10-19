/*
Breakable street furniture: utility poles, lights, stop signs, signal masts.

Each set of them (the hand-built area, or one streamed chunk of town) is
drawn into one vertex-colored mesh, so a block full of poles is a single
draw call; the batch remembers which vertices belong to which prop. Hit one
above 8 mph (vehicle.js) and its vertices collapse out of the merged mesh
while a copy of them becomes a loose piece: tall ones topple from the base
in the direction you hit them, light ones fly off spinning, then they lie
there for 20 s and shrink away. Broken props stay broken for the rest of
the visit (a chunk that streams back in skips them).

Every prop is drawn in its own frame at the origin: +y up, its arm (if it
has one) reaching along local -z, so `ry` turns the arm over the street.
*/import * as THREE from 'three';
import { createBatch, VERTEX_COLORED } from './batch.js';
import { drawUtilityPole, LENS } from './scenery.js';

const STEEL = 0x8a8f94;
const POST = 0xc7cacc;
const RED = 0xc8102e;
const WHITE = 0xf4f1ea;
const HEAD = 0x3a3d40;

// collider half-size and whether it falls like a tree (tall) or flies (light)
export const PROPS = {
  pole: { size: 0.6, tall: true },
  lamp: { size: 0.5, tall: true },
  signal: { size: 0.55, tall: true },
  stop: { size: 0.35, tall: false },
  bus: { size: 0.35, tall: false },
};

/** Draw one prop of a kind into a batch, at the batch's current frame origin. */
export function drawProp(b, kind) {
  if (kind === 'pole') {
    drawUtilityPole(b, 0, 0);
  } else if (kind === 'lamp') {
    b.cyl(0, 0, 0, 0.7, 1.4, 0xcfcac0, 10);
    b.cyl(0, 1.4, 0, 0.22, 18, 0x5e5a55, 8);
    b.box(0, 19.1, -1.5, 0.3, 0.3, 3, 0x5e5a55);
    b.box(0, 18.7, -3.2, 1.0, 0.45, 1.8, HEAD);
    b.box(0, 18.62, -3.2, 0.8, 0.08, 1.5, LENS);
  } else if (kind === 'signal') {
    b.cyl(0, 0, 0, 0.45, 20, STEEL, 8, 0.35);
    b.box(0, 18.5, -8, 0.35, 0.35, 16, STEEL);
    b.box(0, 14.6, -16, 1.2, 3.6, 1.2, HEAD);
    for (const [y, c] of [[17.4, RED], [16.2, 0xe3b04b], [15.0, 0x3f9e5a]]) {
      const lens = new THREE.CylinderGeometry(0.38, 0.38, 0.2, 10);
      lens.rotateX(Math.PI / 2);
      b.geo(lens, c, 0, y - 0.45, -16 + 0.68);
    }
  } else if (kind === 'stop') {
    // the octagon faces +z: a gray back, a white rim, the red face, STOP in block letters
    b.cyl(0, 0, 0, 0.1, 7.3, POST, 6);
    for (const [r, c, dz] of [[1.25, 0x9aa0a6, 0.03], [1.25, WHITE, 0.08], [1.12, RED, 0.12]]) {
      const oct = new THREE.CylinderGeometry(r, r, 0.06, 8, 1);
      oct.rotateX(Math.PI / 2);
      oct.rotateZ(Math.PI / 8);
      b.geo(oct, c, 0, 7.2, dz);
    }
    stopLetters(b);
  } else if (kind === 'bus') {
    b.cyl(0, 0, 0, 0.1, 8, POST, 6);
    b.box(0, 6.4, 0, 1.5, 1.1, 0.1, 0x2b4e91);
    b.box(0, 6.75, 0.06, 1.2, 0.18, 0.02, WHITE);
  }
}

// S, T, O, P as strokes [x, y, w, h] in a 0.34 x 0.48 cell (y up from the baseline)
const W = 0.34, H = 0.48, K = 0.08;
const LETTERS = [
  [[0, H - K, W, K], [0, H / 2 - K / 2, W, K], [0, 0, W, K], [0, H / 2, K, H / 2], [W - K, 0, K, H / 2]],
  [[0, H - K, W, K], [W / 2 - K / 2, 0, K, H]],
  [[0, H - K, W, K], [0, 0, W, K], [0, 0, K, H], [W - K, 0, K, H]],
  [[0, H - K, W, K], [0, H / 2 - K / 2, W, K], [0, 0, K, H], [W - K, H / 2, K, H / 2]],
];
function stopLetters(b) {
  const gap = 0.1, total = LETTERS.length * W + (LETTERS.length - 1) * gap;
  LETTERS.forEach((strokes, i) => {
    const x0 = -total / 2 + i * (W + gap), y0 = 7.2 - H / 2;
    for (const [x, y, w, h] of strokes) b.box(x0 + x + w / 2, y0 + y, 0.17, w, h, 0.03, WHITE);
  });
}

export function createBreakables(scene) {
  const broken = new Set();
  const pieces = [];
  const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _up = new THREE.Vector3();

  /** A group of props built into one mesh. ids must be unique across the town. */
  function group() {
    const b = createBatch();
    const props = [];
    let mesh = null;
    const g = {
      /** Returns the collider for the prop, or null if it's already been knocked down. */
      add(id, kind, x, z, ry = 0) {
        if (broken.has(id)) return null;
        b.setTag(id);
        b.frame(x, z, ry);
        drawProp(b, kind);
        b.endFrame();
        b.setTag(null);
        const s = PROPS[kind].size;
        const box = { x, z, hw: s, hd: s, ry: 0, breakable: true, id, kind, group: g };
        props.push(box);
        return box;
      },
      /** Merge and add to the scene; returns the colliders. */
      build() {
        mesh = b.build();
        if (mesh) scene.add(mesh);
        return props;
      },
      get mesh() { return mesh; },
      dispose() {
        if (!mesh) return;
        scene.remove(mesh);
        mesh.geometry.dispose();
        mesh = null;
      },
    };
    return g;
  }

  /** The car hit a prop at (vx, vz) ft/s: knock it loose. */
  function knock(box, vx, vz) {
    if (box.dead) return;
    box.dead = true;
    broken.add(box.id);
    const mesh = box.group.mesh;
    const range = mesh?.userData.ranges?.get(box.id);
    if (!range) return;
    const [start, count] = range;
    const src = mesh.geometry.attributes;
    // a copy of the prop's vertices, around its base, becomes the loose piece
    const pos = new Float32Array(count * 3), nrm = new Float32Array(count * 3), col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const k = (start + i) * 3;
      pos[i * 3] = src.position.array[k] - box.x;
      pos[i * 3 + 1] = src.position.array[k + 1];
      pos[i * 3 + 2] = src.position.array[k + 2] - box.z;
      nrm.set(src.normal.array.subarray(k, k + 3), i * 3);
      col.set(src.color.array.subarray(k, k + 3), i * 3);
      // and the original collapses to a point under the ground
      src.position.array[k] = box.x;
      src.position.array[k + 1] = -5;
      src.position.array[k + 2] = box.z;
    }
    src.position.needsUpdate = true;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    const piece = new THREE.Mesh(geo, VERTEX_COLORED);
    piece.castShadow = true;
    piece.position.set(box.x, 0, box.z);
    scene.add(piece);

    const speed = Math.hypot(vx, vz) || 1;
    const dx = vx / speed, dz = vz / speed;
    const tall = PROPS[box.kind].tall;
    // tipping axis: horizontal, square to the hit, so the top falls the way the car was going
    const axis = new THREE.Vector3(dz, 0, -dx);
    pieces.push({
      mesh: piece, t: 0, tall,
      v: new THREE.Vector3(dx * speed * (tall ? 0.25 : 0.8), tall ? 0 : 10 + speed * 0.12, dz * speed * (tall ? 0.25 : 0.8)),
      w: axis.multiplyScalar(tall ? 0.8 + speed * 0.015 : 4 + speed * 0.05),
      resting: false,
    });
  }

  function update(dt) {
    for (let i = pieces.length - 1; i >= 0; i--) {
      const p = pieces[i];
      p.t += dt;
      const m = p.mesh;
      if (!p.resting) {
        if (p.tall) {
          // a pole stays planted at its base and sweeps over, faster as it leans,
          // its foot skidding a little the way it was hit
          m.position.x += p.v.x * dt;
          m.position.z += p.v.z * dt;
          p.v.multiplyScalar(Math.max(0, 1 - dt * 3));
        } else {
          p.v.y -= 32 * dt;
          m.position.addScaledVector(p.v, dt);
          if (m.position.y <= 0 && p.v.y < 0) {
            m.position.y = 0;
            p.v.y = -p.v.y * 0.3;
            p.v.x *= 0.6;
            p.v.z *= 0.6;
            p.w.multiplyScalar(0.6);
          }
        }
        const ang = p.w.length();
        if (ang > 1e-4) {
          _q.setFromAxisAngle(_v.copy(p.w).divideScalar(ang), ang * dt);
          m.quaternion.premultiply(_q);
        }
        _up.set(0, 1, 0).applyQuaternion(m.quaternion);
        if (p.tall) {
          p.w.multiplyScalar(1 + dt * 4 * Math.max(0.15, 1 - _up.y));
          // down on the ground: stop
          if (_up.y < 0.05) p.resting = true;
        } else if (m.position.y <= 0.05 && p.v.lengthSq() < 4) {
          p.resting = true;
        }
        if (p.t > 6) p.resting = true;
      }
      // after 20 s, shrink away
      if (p.t > 20) {
        const k = Math.max(0, 1 - (p.t - 20));
        m.scale.setScalar(k);
        if (k === 0) {
          scene.remove(m);
          m.geometry.dispose();
          pieces.splice(i, 1);
        }
      }
    }
  }

  return { group, knock, update, get loose() { return pieces.length; } };
}
