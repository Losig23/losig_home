/*
Builds the apartment meshes from apartment.js data.

Anime look: cel-shaded toon materials (pencil.js), ink line art (ink.js),
cutaway walls (half height so rooms read from the follow camera). The
building sits on a blank pale ground that fades into the sky haze; the
front door leads to the outdoor area (outside.js). buildWorld returns the
collider list ({x1,z1,x2,z2} footprints the player can't enter), an
overlay scene for un-inked sprites (room labels), and the "upper" layer;
buildApartment wraps that as an area for main.js.

The upper layer is everything the cutaway leaves off (the walls from 4 ft
up to the 8 ft ceiling, the tops of the doors, cabinets and mirror, and the
ceiling itself). It shows only in the third- and first-person cameras, and
casts no shadows, so the rooms stay lit the same either way.
*/import * as THREE from 'three';
import { pencil, addLights, makeLabel } from './pencil.js';
import { createSolids } from './collide.js';
import { createBatch } from './batch.js';
import { WALLS, WALL_T, WALL_H, FURNITURE, LABELS, FLOORS, INTERACTABLES, SPAWN, BOUNDS } from './apartment.js';

const WALL_C = 0xfbf5e6;
const SKY = 0xdde9ec;
const CUT_H = 4; // cutaway wall height; collision stays 2D so this is visual only

function box(w, h, d, color) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), pencil(color));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}


export function buildWorld(scene) {
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 40, 110);
  addLights(scene);

  // blank ground for now: catches the building's shadow, fades into the haze
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(420, 420), pencil(0xc4d0d2));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(16, -0.2, 10);
  ground.receiveShadow = true;
  scene.add(ground);

  const colliders = [];
  const walls = [];
  const overlay = new THREE.Scene();
  const upper = new THREE.Group();
  upper.visible = false;
  scene.add(upper);
  // the upper walls and wall-piece tops merge into one mesh (batch.js): two
  // draw calls with the ceiling, lit like the rest but casting no shadow
  const ub = createBatch();

  // ---- floors: warm light wood base + tile zones from apartment.js ----
  const base = new THREE.Mesh(new THREE.PlaneGeometry(32, 20), pencil(0xe6c99a));
  base.rotation.x = -Math.PI / 2;
  base.position.set(16, 0, 10);
  base.receiveShadow = true;
  scene.add(base);

  for (const [x, z, w, d, c] of FLOORS) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), pencil(c));
    p.rotation.x = -Math.PI / 2;
    p.position.set(x, 0.02, z);
    p.receiveShadow = true;
    scene.add(p);
  }

  // ---- walls (cutaway) ----
  for (const [x1, z1, x2, z2] of WALLS) {
    const w = Math.abs(x2 - x1) || WALL_T;
    const d = Math.abs(z2 - z1) || WALL_T;
    const m = box(Math.max(w, WALL_T), CUT_H, Math.max(d, WALL_T), WALL_C);
    m.position.set((x1 + x2) / 2, CUT_H / 2, (z1 + z2) / 2);
    scene.add(m);
    ub.box((x1 + x2) / 2, CUT_H, (z1 + z2) / 2, Math.max(w, WALL_T), WALL_H - CUT_H, Math.max(d, WALL_T), WALL_C);
    const ex = Math.max(w, WALL_T) / 2, ez = Math.max(d, WALL_T) / 2;
    const c = {
      x1: (x1 + x2) / 2 - ex, z1: (z1 + z2) / 2 - ez,
      x2: (x1 + x2) / 2 + ex, z2: (z1 + z2) / 2 + ez,
    };
    colliders.push(c);
    walls.push(c);
  }
  // the ceiling, facing down (away from the sun, so it glows a little to stay a soft cream)
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(32, 20), pencil(0xf4efe4, { emissive: 0x5c574d }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(16, WALL_H, 10);
  ceiling.receiveShadow = true;
  upper.add(ceiling);

  // ---- furniture ----
  for (const raw of FURNITURE) {
    // wall-mounted pieces (doors, windows, cabinets) are clipped to the cutaway
    // height; what's above it goes in the upper layer
    let f = raw;
    if (raw.wall) {
      const base = raw.y || 0;
      if (base + raw.h > CUT_H) {
        const y0 = Math.max(base, CUT_H), h = base + raw.h - y0;
        if (raw.shape === 'cyl') ub.cyl(raw.x, y0, raw.z, raw.w / 2, h, raw.c);
        else ub.box(raw.x, y0, raw.z, raw.w, h, raw.d, raw.c);
      }
      if (base >= CUT_H) continue;
      f = { ...raw, h: Math.min(raw.h, CUT_H - base) };
    }
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
    m.position.set(f.x, y, f.z);
    if (f.rx) m.rotation.x = f.rx;
    scene.add(m);
    // low flat things (rugs) and overhead things (lamp heads) aren't colliders
    if (f.h > 0.3 && (f.y || 0) < 4) {
      colliders.push({
        x1: f.x - f.w / 2, z1: f.z - f.d / 2,
        x2: f.x + f.w / 2, z2: f.z + f.d / 2,
      });
    }
  }

  upper.add(ub.build({ castShadow: false }));

  // ---- floating room labels ----
  for (const l of LABELS) {
    const sp = makeLabel(l.t);
    sp.position.set(l.x, 7.2, l.z);
    overlay.add(sp);
  }

  return { colliders, walls, overlay, upper };
}


/** The apartment as an area: its own scene, colliders, door, and the dollhouse camera. */
export function buildApartment() {
  const scene = new THREE.Scene();
  const { colliders, walls, overlay, upper } = buildWorld(scene);
  return {
    scene, overlay, colliders,
    // walls only, for the third-person camera to pull in off (furniture it can look over)
    world: { solids: createSolids(walls) },
    /** Third and first person: full-height rooms with a ceiling, no floating room labels. */
    setCloseCam(on) {
      upper.visible = on;
      overlay.visible = !on;
    },
    bounds: BOUNDS,
    interactables: INTERACTABLES,
    entry: SPAWN,
    runSpeed: 11, // walks at the player's default 6.5 ft/s
    // camera offset from the player, look-at height, far plane, ink fade band
    view: { off: [0, 14.5, 12], lookY: 2.6, far: 200, ink: [55, 110], behind: { dist: 6, lift: 5.3, ahead: 5, min: 1.4 } },
    caption: 'Home · apartment',
  };
}

