/*
Third-person character: Ani, as a slim anime figure (~6 heads tall) —
curly fringe on a high fade, hex-frame glasses, full beard,
Liverpool home jersey (M.SALAH 11), black jeans, white sneakers. Two-segment arms and legs give
the code-driven walk cycle knees and elbows. Circle-vs-AABB collision,
axis-separated so you slide along walls. Local +Z is forward.

Each area hands update() its own colliders, walkable bounds, walk and run
speeds and ground height (outside: a step up onto sidewalks). Past a brisk
walk the cycle blends into a run: longer stride, bent arms, a forward lean.
*/import * as THREE from 'three';
import { pencil } from './pencil.js';
import { mergeMeshes } from './batch.js';

const RADIUS = 0.55;
const WALK = 6.5; // ft/s, the apartment pace

const SKIN = 0xb47c5c;
const HAIR = 0x1d1a20;
const BEARD = 0x231e24;
const KIT = 0xc8102e;   // Liverpool red
const TRIM = 0xf4f1ea;
const JEANS = 0x232226; // black denim
const FRAMES = 0x26232b;

// small deterministic PRNG so the curls land the same way every load
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}


export function createPlayer(scene) {
  const g = new THREE.Group();
  const rig = new THREE.Group(); // everything that bobs
  g.add(rig);

  const add = (parent, geo, color, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, pencil(color));
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const blob = (parent, color, x, y, z, sx, sy, sz) => {
    const m = add(parent, new THREE.SphereGeometry(1, 14, 10), color, x, y, z);
    m.scale.set(sx, sy, sz);
    return m;
  };
  const box = (parent, color, x, y, z, w, h, d) =>
    add(parent, new THREE.BoxGeometry(w, h, d), color, x, y, z);

  // ---- torso: Liverpool home jersey, hem down over the hips ----
  const torso = add(rig, new THREE.CylinderGeometry(0.42, 0.36, 1.72, 18), KIT, 0, 3.47, 0);
  torso.scale.z = 0.62;
  const collar = add(rig, new THREE.TorusGeometry(0.155, 0.035, 6, 18), TRIM, 0, 4.33, 0);
  collar.rotation.x = Math.PI / 2;
  // printing on curved slices that hug the shirt (children inherit its flattening)
  jerseyPrint(torso, Math.PI - 0.9, drawBack);  // M.SALAH 11
  jerseyPrint(torso, -0.9, drawFront);          // crest on the left chest
  add(rig, new THREE.CylinderGeometry(0.12, 0.13, 0.36, 10), SKIN, 0, 4.44, 0); // neck

  // ---- head: oval, ears, face, beard, glasses, curly hair ----
  const head = new THREE.Group();
  head.position.y = 4.98;
  rig.add(head);
  const skull = add(head, new THREE.SphereGeometry(0.4, 22, 16), SKIN);
  skull.scale.set(1, 1.12, 1.02);
  for (const sx of [-1, 1]) {
    blob(head, SKIN, sx * 0.4, 0, 0, 0.06, 0.11, 0.08);                   // ear
    blob(head, 0x241c26, sx * 0.14, 0.02, 0.37, 0.05, 0.065, 0.025);      // eye
    blob(head, 0xffffff, sx * 0.14 + 0.018, 0.04, 0.392, 0.016, 0.02, 0.01); // highlight
    box(head, HAIR, sx * 0.15, 0.135, 0.375, 0.17, 0.045, 0.04).rotation.z = -sx * 0.08; // brow
    blob(head, BEARD, sx * 0.385, -0.05, 0.03, 0.04, 0.15, 0.09);         // sideburn
  }
  blob(head, SKIN, 0, -0.06, 0.39, 0.04, 0.07, 0.05);                      // nose
  const STACHE = 0x3b3033; // a shade softer than the beard: thinner growth
  blob(head, STACHE, 0, -0.18, 0.372, 0.12, 0.021, 0.025);                // mustache
  for (const sx of [-1, 1]) {
    // mustache runs down past the mouth corners into the beard
    blob(head, STACHE, sx * 0.135, -0.222, 0.343, 0.024, 0.06, 0.022).rotation.z = sx * 0.35;
  }
  blob(head, 0x8a5550, 0, -0.228, 0.365, 0.07, 0.018, 0.02);              // lips
  // full beard: a band of a slightly larger sphere, tipped forward so it sits
  // high on the jaw at the sides and drops below the mustache in front
  const beard = add(skull, new THREE.SphereGeometry(0.415, 22, 10, Math.PI / 2 - 1.5, 3.0, 1.72, 1.15), BEARD);
  beard.rotation.x = 0.38;

  // geometric (hex) glasses: two rings, bridge, temples back to the ears
  for (const sx of [-1, 1]) {
    add(head, new THREE.TorusGeometry(0.105, 0.013, 4, 6), FRAMES, sx * 0.145, 0.025, 0.43);
    // temple arm from the lens edge back over the head to the ear
    const arm = box(head, FRAMES, sx * 0.3525, 0.06, 0.215, 0.016, 0.018, 0.47);
    arm.rotation.y = -sx * 0.386;
  }
  box(head, FRAMES, 0, 0.065, 0.43, 0.08, 0.016, 0.016);

  // hair: curly fringe on a high fade. The curls form a low, flat-topped mop
  // that hugs the skull, comes down the sides to just above the ears, and
  // falls forward over the forehead almost to the brows. Below the mop, a
  // tight shell (open at the front for the face) is the fade: black across
  // the back and behind the ears down to the nape; in front of the ears it's
  // short dark hair up high and skin-toned stubble below the fade line.
  const fade = new THREE.SphereGeometry(0.408, 28, 24, Math.PI / 2 + 0.6, Math.PI * 2 - 1.2, 0.75, 1.2);
  const fpos = fade.attributes.position;
  const fcol = new Float32Array(fpos.count * 3);
  const dark = new THREE.Color(HAIR), short = new THREE.Color(0x2b2428), stubble = new THREE.Color(0x7a5848);
  const fc = new THREE.Color(), fv = new THREE.Vector3();
  for (let i = 0; i < fpos.count; i++) {
    fv.fromBufferAttribute(fpos, i).normalize();
    const front = THREE.MathUtils.smoothstep(fv.z, 0.1, 0.3);            // 0 behind the ears
    const temple = Math.acos(fv.y) < 1.23 ? short : stubble;               // hard fade line
    fc.copy(dark).lerp(temple, front);
    fc.toArray(fcol, i * 3);
  }
  fade.setAttribute("color", new THREE.BufferAttribute(fcol, 3));
  const fadeMesh = new THREE.Mesh(fade, pencil(0xffffff, { vertexColors: true }));
  fadeMesh.castShadow = true;
  skull.add(fadeMesh);
  add(skull, new THREE.SphereGeometry(0.414, 22, 10, 0, Math.PI * 2, 0, 1.12), HAIR);
  const rand = rng(11);
  const crown = new THREE.Vector3(0, Math.cos(0.25), Math.sin(0.25)); // top, tipped forward
  const N = 170;
  for (let i = 0; i < N; i++) {
    // fibonacci-sphere directions, kept within a wide cap around the crown
    const y = 1 - (i + 0.5) / N * 2;
    const r = Math.sqrt(1 - y * y);
    const phi = i * 2.39996;
    const d = new THREE.Vector3(Math.cos(phi) * r, y, Math.sin(phi) * r);
    if (d.dot(crown) < Math.cos(1.15)) continue;
    if (d.z > 0.3 && d.y < 0.55) continue; // the fringe below covers the forehead
    // lie close to the head; a little fuller toward the front, flat on top
    const lift = d.y > 0.85 ? -0.01 : rand() * 0.02 + Math.max(0, d.z) * 0.035;
    const p = d.multiplyScalar(0.4 + lift);
    const c = add(skull, new THREE.IcosahedronGeometry(0.085 + rand() * 0.03, 1), HAIR, p.x, p.y, p.z);
    c.rotation.set(rand() * 3, rand() * 3, 0);
  }
  // the fringe: curls falling forward over the forehead, tips near the brows
  for (const [x, y, z, s] of [
    [-0.24, 0.27, 0.34, 0.095], [-0.12, 0.28, 0.37, 0.095], [0, 0.28, 0.38, 0.1],
    [0.12, 0.28, 0.37, 0.095], [0.24, 0.26, 0.34, 0.09],
    [-0.17, 0.225, 0.385, 0.075], [-0.05, 0.23, 0.4, 0.075], [0.07, 0.225, 0.4, 0.075],
    [0.19, 0.22, 0.38, 0.07], [-0.1, 0.195, 0.41, 0.05], [0.13, 0.19, 0.405, 0.05]]) {
    add(skull, new THREE.IcosahedronGeometry(s, 1), HAIR, x, y / 1.12, z);
  }

  // ---- limbs: shoulder/hip pivots with elbow/knee sub-pivots ----
  const seg = (parent, r, len, color) => {
    add(parent, new THREE.CapsuleGeometry(r, len, 4, 10), color, 0, -(len / 2 + r), 0);
    const joint = new THREE.Group();
    joint.position.y = -(len + r * 2);
    parent.add(joint);
    return joint;
  };
  const mkArm = (sx) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(sx * 0.5, 4.2, 0);
    shoulder.rotation.z = sx * 0.07;
    add(shoulder, new THREE.CylinderGeometry(0.16, 0.15, 0.42, 12), KIT, 0, -0.14, 0);   // sleeve
    add(shoulder, new THREE.CylinderGeometry(0.153, 0.153, 0.06, 12), TRIM, 0, -0.33, 0); // cuff
    const elbow = seg(shoulder, 0.115, 0.7, SKIN);
    const wrist = seg(elbow, 0.1, 0.64, SKIN);
    blob(wrist, SKIN, 0, -0.06, 0.01, 0.1, 0.13, 0.08);                  // hand
    rig.add(shoulder);
    return { shoulder, elbow };
  };
  const mkLeg = (sx) => {
    const hip = new THREE.Group();
    hip.position.set(sx * 0.18, 2.72, 0);
    const knee = seg(hip, 0.17, 0.96, JEANS);
    const ankle = seg(knee, 0.145, 0.95, JEANS);
    box(ankle, 0xf2f0ea, 0, -0.03, 0.09, 0.28, 0.2, 0.56);               // sneaker
    box(ankle, 0xc9c6c0, 0, -0.12, 0.09, 0.3, 0.05, 0.58);               // sole
    rig.add(hip);
    return { hip, knee };
  };
  const armL = mkArm(-1), armR = mkArm(1);
  const legL = mkLeg(-1), legR = mkLeg(1);

  // ~130 primitives -> one mesh per moving part (plus the two jersey prints),
  // so Ani costs a dozen draw calls instead of a hundred-odd per pass
  mergeMeshes(g, [rig, head, armL.shoulder, armL.elbow, armR.shoulder, armR.elbow,
    legL.hip, legL.knee, legR.hip, legR.knee]);

  scene.add(g);

  const state = { x: 0, z: 0, y: 0, dirX: 0, dirZ: -1, walkT: 0, idleT: 0, moving: false, run: 0 };

  function hits(x, z, area) {
    const b = area.bounds;
    // stay inside the area's walkable box (the apartment shell, the lot's surroundings)
    if (x < b.x1 || x > b.x2 || z < b.z1 || z > b.z2) return true;
    // outdoors: a spatial grid (collide.js) that also knows where the parked car is
    if (area.solids) return area.solids.hit(x, z, RADIUS);
    for (const c of area.colliders) {
      const nx = Math.max(c.x1, Math.min(x, c.x2));
      const nz = Math.max(c.z1, Math.min(z, c.z2));
      if ((x - nx) ** 2 + (z - nz) ** 2 < RADIUS * RADIUS) return true;
    }
    return false;
  }

  // move: {x, z} in world axes; length 1 is full speed (a touch stick can
  // push less than that to walk slower). area: { colliders or solids, bounds,
  // speed, runSpeed, heightAt }; running switches to the area's run speed.
  function update(dt, move, area, running = false) {
    const walk = area.speed || WALK;
    const speed = running ? area.runSpeed || walk * 1.8 : walk;
    let dx = move.x, dz = move.z;
    const len = Math.hypot(dx, dz);
    state.moving = len > 0;
    let pace = 0;
    if (len > 0) {
      dx /= len; dz /= len;
      state.dirX = dx; state.dirZ = dz;
      pace = Math.min(len, 1);
      const step = speed * pace * dt;
      if (!hits(state.x + dx * step, state.z, area)) state.x += dx * step;
      if (!hits(state.x, state.z + dz * step, area)) state.z += dz * step;
      // cadence follows ground speed; past a walk the stride lengthens instead
      // (and keeps lengthening at a full outdoor sprint rather than blurring the legs)
      const v = speed * pace / WALK;
      state.walkT += dt * 11 * (v <= 1 ? v : v <= 3 ? 1 + (v - 1) * 0.45 : 1.9 + (v - 3) * 0.2);
    }
    // ease the run blend so the gait doesn't snap when a thumb wavers
    const runTarget = state.moving ? Math.min(1, Math.max(0, (speed * pace - 9.5) / 5)) : 0;
    state.run += (runTarget - state.run) * Math.min(1, dt * 8);
    // step up/down onto raised ground (sidewalks) quickly but not instantly
    const groundY = area.heightAt ? area.heightAt(state.x, state.z) : 0;
    state.y += (groundY - state.y) * Math.min(1, dt * 18);
    g.position.set(state.x, state.y, state.z);
    g.rotation.y = Math.atan2(state.dirX, state.dirZ);

    // walk cycle: hips swing, knees fold on the back-swing, arms counter-swing
    // (+rotation.x swings a limb backward); idle: gentle breathing.
    // run: same phases with a longer stride, arms bent ~90 deg, a forward lean.
    state.idleT += dt;
    const w = state.moving ? 1 : 0;
    const r = state.run;
    const s = Math.sin(state.walkT);
    const hipA = 0.5 + r * 0.35, kneeA = 0.9 + r * 0.6, armA = 0.45 + r * 0.3;
    legL.hip.rotation.x = -s * hipA * w;
    legR.hip.rotation.x = s * hipA * w;
    legL.knee.rotation.x = Math.max(0, Math.sin(state.walkT - 1.3)) * kneeA * w;
    legR.knee.rotation.x = Math.max(0, -Math.sin(state.walkT - 1.3)) * kneeA * w;
    armL.shoulder.rotation.x = s * armA * w;
    armR.shoulder.rotation.x = -s * armA * w;
    armL.elbow.rotation.x = -0.15 - r * 1.1 - Math.max(0, -s) * 0.4 * w;
    armR.elbow.rotation.x = -0.15 - r * 1.1 - Math.max(0, s) * 0.4 * w;
    // past a run, a sprint leans in harder
    const sprint = state.moving ? Math.min(1, Math.max(0, (speed * pace - 20) / 10)) : 0;
    rig.rotation.x = r * 0.14 + sprint * 0.1;
    rig.position.y = state.moving
      ? Math.abs(Math.cos(state.walkT)) * (0.07 + r * 0.12) - 0.03
      : Math.sin(state.idleT * 2.2) * 0.015;
    head.rotation.z = state.moving ? s * 0.03 : 0;
  }

  return { group: g, state, update, radius: RADIUS };
}


// ---- jersey printing ------------------------------------------------------
// A canvas drawn onto an open slice of a cylinder matching the torso, so the
// print curves with the shirt. Canvas u runs left -> right as you look at it.

const PRINT_FONT = '800 {s}px "M PLUS Rounded 1c", system-ui, sans-serif';

function jerseyPrint(torso, thetaStart, draw) {
  const cv = document.createElement("canvas");
  cv.width = 300;
  cv.height = 860;
  draw(cv.getContext("2d"), cv.width, cv.height);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const geo = new THREE.CylinderGeometry(0.426, 0.366, 1.72, 18, 1, true, thetaStart, 1.8);
  const m = new THREE.Mesh(geo, pencil(0xffffff, { map: tex, transparent: true, alphaTest: 0.5 }));
  torso.add(m);
}

function drawBack(c, w, h) {
  c.fillStyle = "#f4f1ea";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.font = PRINT_FONT.replace("{s}", 40);
  c.fillText("M.SALAH", w / 2, h * 0.17);
  c.font = PRINT_FONT.replace("{s}", 230);
  c.fillText("11", w / 2, h * 0.39);
}

function drawFront(c, w, h) {
  // simplified club crest on the wearer's left chest (viewer's right)
  const x = w * 0.72, y = h * 0.2, s = 30;
  c.beginPath();
  c.moveTo(x - s, y - s);
  c.lineTo(x + s, y - s);
  c.lineTo(x + s, y + s * 0.3);
  c.quadraticCurveTo(x + s, y + s * 1.2, x, y + s * 1.5);
  c.quadraticCurveTo(x - s, y + s * 1.2, x - s, y + s * 0.3);
  c.closePath();
  c.fillStyle = "#f4f1ea";
  c.fill();
  c.lineWidth = 5;
  c.strokeStyle = "#e3b04b";
  c.stroke();
  c.fillStyle = "#c8102e";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.font = PRINT_FONT.replace("{s}", 22);
  c.fillText("LFC", x, y + s * 0.15);
}
