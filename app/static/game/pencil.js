/*
Dollhouse look: soft realistic materials, warm interior lighting.

The recipe: MeshStandardMaterial (roughness ~0.9, no metalness) in a warm
palette, cutaway walls so the rooms read from above, a dark backdrop with
warm point lights per room (cozy interior glow), one shadow-casting
directional for soft sun, and floating room-label pills.

`pencil()` / `outlined()` keep their names so call sites don't churn:
pencil() now builds the standard material, outlined() is a no-op kept
for API compatibility.
*/import * as THREE from 'three';


export function pencil(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, ...opts });
}


/** No-op: the dollhouse look has no ink outlines. Kept for API compatibility. */
export function outlined(mesh, s = 1.045) {
  return mesh;
}


/** Warm dollhouse light rig: dim cool ambient + warm sun + per-room glows. */
export function addLights(scene) {
  // cool dim fill so the dark backdrop doesn't go pitch black
  scene.add(new THREE.HemisphereLight(0x354052, 0x1a1410, 0.55));

  // warm sun with soft shadows
  const sun = new THREE.DirectionalLight(0xffd9a8, 1.35);
  sun.position.set(18, 26, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const c = sun.shadow.camera;
  c.left = -22; c.right = 22; c.top = 22; c.bottom = -22;
  c.near = 1; c.far = 70;
  sun.shadow.bias = -0.002;
  scene.add(sun);

  // cozy per-room glows (no shadows: cheap, warm)
  const glows = [
    [26, 14, 6.5],  // living room
    [26, 4, 6.5],   // kitchen
    [6, 13, 6.5],   // my room
    [16, 16, 6.5],  // guest room
    [16, 4, 6],     // bath
    [16, 10, 6],    // hallway
  ];
  for (const [x, z, y] of glows) {
    const p = new THREE.PointLight(0xffc98a, 30, 20, 2);
    p.position.set(x, y, z);
    scene.add(p);
  }
}


/** Floating room-label pill, like the dollhouse render. */
export function makeLabel(text) {
  const pad = 28;
  const fs = 30;
  const cv = document.createElement("canvas");
  const cx = cv.getContext("2d");
  cx.font = `600 ${fs}px system-ui, sans-serif`;
  const tw = cx.measureText(text).width;
  cv.width = Math.ceil(tw + pad * 2);
  cv.height = 64;
  const c2 = cv.getContext("2d");
  const r = 32;
  c2.fillStyle = "rgba(16,18,22,0.88)";
  c2.beginPath();
  c2.roundRect(0, 0, cv.width, cv.height, r);
  c2.fill();
  c2.font = `600 ${fs}px system-ui, sans-serif`;
  c2.fillStyle = "#f5f2ea";
  c2.textBaseline = "middle";
  c2.fillText(text, pad, cv.height / 2 + 1);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const sp = new THREE.Sprite(mat);
  const h = 1.0;
  sp.scale.set(h * cv.width / cv.height, h, 1);
  sp.renderOrder = 20;
  return sp;
}
