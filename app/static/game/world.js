/*
Builds the apartment meshes from apartment.js data.

Floors are per-zone (carpet / wood-look / tile), walls are plaster boxes,
furniture is toon-shaded boxes/cylinders/cones with ink outlines.
Returns the collider list: {x1,z1,x2,z2} footprints the player can't enter.
*/import * as THREE from 'three';
import { pencil, outlined, addLights } from './pencil.js';
import { WALLS, WALL_H, WALL_T, FURNITURE } from './apartment.js';

const WALL_C = 0xe6dcc4;

function box(w, h, d, color) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), pencil(color));
  m.castShadow = true;
  m.receiveShadow = true;
  return outlined(m);
}


export function buildWorld(scene) {
  scene.background = new THREE.Color(0xefe7d6);
  scene.fog = new THREE.Fog(0xefe7d6, 40, 95);
  addLights(scene);

  const colliders = [];

  // ---- floors: one carpet base + wood-look kitchen/entry + tile bath ----
  const base = new THREE.Mesh(new THREE.PlaneGeometry(32, 24), pencil(0xcbbfa5));
  base.rotation.x = -Math.PI / 2;
  base.position.set(16, 0, 12);
  base.receiveShadow = true;
  scene.add(base);

  const zones = [
    // [x, z, w, d, color] center-based
    [26, 6, 12, 12, 0xb08d5f],   // kitchen wood
    [22.5, 15.5, 5, 7, 0x9fa8ad], // bathroom tile
  ];
  for (const [x, z, w, d, c] of zones) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), pencil(c));
    p.rotation.x = -Math.PI / 2;
    p.position.set(x, 0.02, z);
    p.receiveShadow = true;
    scene.add(p);
  }

  // ---- walls ----
  for (const [x1, z1, x2, z2] of WALLS) {
    const w = Math.abs(x2 - x1) || WALL_T;
    const d = Math.abs(z2 - z1) || WALL_T;
    const m = box(Math.max(w, WALL_T), WALL_H, Math.max(d, WALL_T), WALL_C);
    m.position.set((x1 + x2) / 2, WALL_H / 2, (z1 + z2) / 2);
    scene.add(m);
    const ex = Math.max(w, WALL_T) / 2, ez = Math.max(d, WALL_T) / 2;
    colliders.push({
      x1: (x1 + x2) / 2 - ex, z1: (z1 + z2) / 2 - ez,
      x2: (x1 + x2) / 2 + ex, z2: (z1 + z2) / 2 + ez,
    });
  }

  // ---- furniture ----
  for (const f of FURNITURE) {
    let m;
    const y = (f.y || 0) + f.h / 2;
    if (f.shape === 'cyl') {
      m = new THREE.Mesh(new THREE.CylinderGeometry(f.w / 2, f.w / 2, f.h, 14), pencil(f.c));
    } else if (f.shape === 'cone') {
      m = new THREE.Mesh(new THREE.ConeGeometry(f.w / 2, f.h, 10), pencil(f.c));
    } else {
      m = new THREE.Mesh(new THREE.BoxGeometry(f.w, f.h, f.d), pencil(f.c));
    }
    m.castShadow = true;
    m.receiveShadow = true;
    outlined(m, f.shape ? 1.06 : 1.035);
    m.position.set(f.x, y, f.z);
    if (f.rx) m.rotation.x = f.rx;
    scene.add(m);
    // low flat things (rugs) aren't colliders
    if (f.h > 0.3) {
      colliders.push({
        x1: f.x - f.w / 2, z1: f.z - f.d / 2,
        x2: f.x + f.w / 2, z2: f.z + f.d / 2,
      });
    }
  }

  // ---- interactable markers: small floating pencil diamonds ----
  return { colliders };
}
