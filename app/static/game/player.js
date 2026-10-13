/*
Third-person character: procedural low-poly person with a code-driven
walk cycle. Circle-vs-AABB collision, axis-separated so you slide along walls.
*/import * as THREE from 'three';
import { pencil, outlined } from './pencil.js';

const RADIUS = 0.55;
const SPEED = 6.5; // ft/s


export function createPlayer(scene) {
  const g = new THREE.Group();

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.0, 6, 12), pencil(0x3b5bdb));
  body.position.y = 1.75;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 12), pencil(0xe8b88a));
  head.position.y = 3.15;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.47, 14, 12, 0, Math.PI * 2, 0, 1.4), pencil(0x2b2118));
  hair.position.y = 3.22;

  const limbMat = pencil(0x2b3a67);
  const mkLimb = (r, len) => {
    const pivot = new THREE.Group();
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 8), limbMat);
    m.position.y = -(len / 2 + r);
    pivot.add(outlined(m, 1.12));
    return pivot;
  };
  const armL = mkLimb(0.16, 0.8), armR = mkLimb(0.16, 0.8);
  armL.position.set(-0.72, 2.45, 0); armR.position.set(0.72, 2.45, 0);
  const legL = mkLimb(0.2, 0.9), legR = mkLimb(0.2, 0.9);
  legL.position.set(-0.28, 1.15, 0); legR.position.set(0.28, 1.15, 0);

  for (const m of [body, head, hair]) {
    m.castShadow = true;
    outlined(m, 1.08);
    g.add(m);
  }
  g.add(armL, armR, legL, legR);
  scene.add(g);

  const state = { x: 0, z: 0, dirX: 0, dirZ: -1, walkT: 0, moving: false };

  function hits(x, z, colliders) {
    for (const c of colliders) {
      const nx = Math.max(c.x1, Math.min(x, c.x2));
      const nz = Math.max(c.z1, Math.min(z, c.z2));
      if ((x - nx) ** 2 + (z - nz) ** 2 < RADIUS * RADIUS) return true;
    }
    // stay inside the apartment shell
    if (x < 0.8 || x > 31.2 || z < 0.8 || z > 23.2) return true;
    return false;
  }

  function update(dt, keys, colliders) {
    let dx = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
    let dz = (keys.s ? 1 : 0) - (keys.w ? 1 : 0);
    const len = Math.hypot(dx, dz);
    state.moving = len > 0;
    if (len > 0) {
      dx /= len; dz /= len;
      state.dirX = dx; state.dirZ = dz;
      const step = SPEED * dt;
      if (!hits(state.x + dx * step, state.z, colliders)) state.x += dx * step;
      if (!hits(state.x, state.z + dz * step, colliders)) state.z += dz * step;
      state.walkT += dt * 11;
    }
    g.position.set(state.x, 0, state.z);
    g.rotation.y = Math.atan2(state.dirX, state.dirZ);

    // walk cycle: swing limbs, bob body
    const sw = state.moving ? Math.sin(state.walkT) * 0.55 : 0;
    armL.rotation.x = sw; armR.rotation.x = -sw;
    legL.rotation.x = -sw; legR.rotation.x = sw;
    const bob = state.moving ? Math.abs(Math.sin(state.walkT)) * 0.09 : 0;
    body.position.y = 1.75 + bob;
    head.position.y = 3.15 + bob;
    hair.position.y = 3.22 + bob;
  }

  return { group: g, state, update, radius: RADIUS };
}
