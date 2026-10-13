/*
Anime look: cel-shaded materials, bright daylight, hand-lettered labels.

The recipe: MeshToonMaterial with a hard 3-step gradient (lit / shade /
deep shade), a strong warm sun with crisp shadows, and a sky-blue
hemisphere fill so shadows read cool instead of black. Ink line art is a
post-process pass (ink.js), so meshes don't need outline hulls.

`pencil()` / `outlined()` keep their names so call sites don't churn:
pencil() now builds the toon material, outlined() is a no-op kept for API
compatibility (ink.js draws every outline).
*/import * as THREE from 'three';

export const LABEL_FONT = '"M PLUS Rounded 1c", system-ui, sans-serif';

// 4 texels sampled by dotNL*0.5+0.5: back-lit -> deep shade, terminator -> shade, lit
const GRADIENT = (() => {
  const t = new THREE.DataTexture(new Uint8Array([120, 175, 255, 255]), 4, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
})();

const cache = new Map();


export function pencil(color, opts = {}) {
  // share materials per color: the apartment reuses a small palette
  const key = Object.keys(opts).length ? null : color;
  if (key !== null && cache.has(key)) return cache.get(key);
  const m = new THREE.MeshToonMaterial({ color, gradientMap: GRADIENT, ...opts });
  if (key !== null) cache.set(key, m);
  return m;
}


/** No-op: ink.js draws outlines in screen space. Kept for API compatibility. */
export function outlined(mesh, s = 1.045) {
  return mesh;
}


/** Anime daylight: sky-blue fill + warm sun with hard-edged shadows. */
export function addLights(scene) {
  scene.add(new THREE.HemisphereLight(0xcfe8ff, 0xd9c7a8, 2.1));

  const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
  sun.target.position.set(16, 0, 8);
  sun.position.set(16 + 16, 30, 8 + 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const c = sun.shadow.camera;
  c.left = -34; c.right = 34; c.top = 34; c.bottom = -34;
  c.near = 1; c.far = 90;
  sun.shadow.bias = -0.0015;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
}


/** Floating room label: white sticker with an ink border, like a manga caption. */
export function makeLabel(text) {
  const pad = 30;
  const fs = 30;
  const border = 5;
  const cv = document.createElement("canvas");
  const cx = cv.getContext("2d");
  cx.font = `800 ${fs}px ${LABEL_FONT}`;
  const tw = cx.measureText(text).width;
  cv.width = Math.ceil(tw + pad * 2 + 8);
  cv.height = 72;
  const c2 = cv.getContext("2d");
  const w = cv.width - 8, h = 60;
  // offset "sticker" shadow, then the paper body
  c2.fillStyle = "rgba(42,36,51,0.35)";
  c2.beginPath(); c2.roundRect(8, 10, w - border, h - border, 30); c2.fill();
  c2.fillStyle = "#fffdf6";
  c2.strokeStyle = "#2a2433";
  c2.lineWidth = border;
  c2.beginPath(); c2.roundRect(border / 2, border / 2, w - border, h - border, 28); c2.fill(); c2.stroke();
  c2.font = `800 ${fs}px ${LABEL_FONT}`;
  c2.fillStyle = "#2a2433";
  c2.textBaseline = "middle";
  c2.fillText(text, pad, h / 2 + 1);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const sp = new THREE.Sprite(mat);
  const s = 1.05;
  sp.scale.set(s * cv.width / cv.height, s, 1);
  sp.renderOrder = 20;
  return sp;
}
