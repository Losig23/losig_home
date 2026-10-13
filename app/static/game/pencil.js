/*
Pencil-drawn look: toon shading + ink outlines.

The recipe: MeshToonMaterial with a 4-step gradient map (flat bands of tone
instead of smooth shading), an inverted-hull outline on every mesh (a
BackSide copy scaled slightly larger, in ink color), and a paper-grain
overlay in CSS (game.html). Warm paper palette throughout.
*/import * as THREE from 'three';

const INK = 0x2e2418;

const _tones = new Uint8Array([110, 160, 210, 255]);
const _gradientMap = new THREE.DataTexture(_tones, _tones.length, 1, THREE.RedFormat);
_gradientMap.minFilter = THREE.NearestFilter;
_gradientMap.magFilter = THREE.NearestFilter;
_gradientMap.needsUpdate = true;

const _outlineMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });


export function pencil(color, opts = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: _gradientMap, ...opts });
}


/** Attach an ink outline to a mesh. Returns the mesh for chaining. */
export function outlined(mesh, s = 1.045) {
  const o = new THREE.Mesh(mesh.geometry, _outlineMat);
  o.scale.setScalar(s);
  o.raycast = () => {}; // outlines never intercept clicks
  o.castShadow = false;
  mesh.add(o);
  return mesh;
}


/** Soft warm light rig: hemisphere + one shadow-casting directional. */
export function addLights(scene) {
  scene.add(new THREE.HemisphereLight(0xfff6e6, 0x8a7a5f, 0.95));
  const sun = new THREE.DirectionalLight(0xfff1d8, 1.6);
  sun.position.set(18, 26, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const c = sun.shadow.camera;
  c.left = -22; c.right = 22; c.top = 22; c.bottom = -22;
  c.near = 1; c.far = 70;
  sun.shadow.bias = -0.002;
  scene.add(sun);
}
