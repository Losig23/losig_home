/*
Game entry point: renderer, ink post pass, cameras, input, game loop,
interaction prompts, the slide-in panel, and travel between areas.

An area is one walkable place with its own scene, colliders, doors and
camera framing: the apartment (world.js) and, through its front door, the
lot outside (outside.js, loaded the first time you walk out so the
apartment's first load stays the same). Doors are interactables with a
`go` target; using one fades to black and swaps areas. Outdoors the RAV4's
door is an interactable too: getting in hands the controls and the camera
to drive.js until you get out.

Every camera (on foot, cockpit, chase) writes a wanted pose each frame;
a mode change captures where the camera is and blends to the new pose, so
getting in, getting out and toggling views never cut. Fog and ink fade
distances ease to the current mode's values the same way.

Outdoors, places.js adds the Places (markers, minimap, routes, arrivals);
the Places list opens from P or the minimap, and fast travel is a travel()
within the area: fade out, move the car and Ani, stream the chunks in
behind the black, fade back. Phones also scale their pixel ratio to hold
the frame rate (dynamic resolution), and ?stats shows the frame budget.
*/import * as THREE from 'three';
import { buildApartment } from './world.js';
import { createInk } from './ink.js';
import { LABEL_FONT } from './pencil.js';
import { createPlayer } from './player.js';
import { renderPanel, bindPanel } from './panels.js';

const container = document.getElementById("scene");
const promptEl = document.getElementById("prompt");
const promptLabel = document.getElementById("promptLabel");
const panel = document.getElementById("panel");
const panelTitle = document.getElementById("panelTitle");
let panelBody = document.getElementById("panelBody");
const authPill = document.getElementById("authpill");
const fadeEl = document.getElementById("fade");
const placeEl = document.getElementById("place");
const runBtn = document.getElementById("run");
const $ = (id) => document.getElementById(id);
const driveUI = {
  root: document.body,
  gas: $("gas"), brake: $("brake"), drift: $("drift"), boost: $("boost"),
  cam: $("camBtn"), out: $("outBtn"),
  mph: $("mph"), dial: $("speedo"), gear: $("gear"),
};

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
} catch {
  document.getElementById("loading").style.display = "none";
  const nogl = document.getElementById("nogl");
  nogl.style.display = "flex";
  throw new Error("no webgl");
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // hard-edged cel shadows
renderer.toneMapping = THREE.NoToneMapping;   // keep flat anime colors unsquashed
container.appendChild(renderer.domElement);

// room labels are drawn to canvases at build time, so wait (briefly) for the font
await Promise.race([
  document.fonts.load(`800 30px ${LABEL_FONT}`).catch(() => {}),
  new Promise((r) => setTimeout(r, 1500)),
]);

// ---- areas ----
const areas = { apartment: buildApartment() };
const loaders = {
  outside: async () => {
    const [{ buildOutside }, { createDriver }, places] = await Promise.all([import('./outside.js'), import('./drive.js'), import('./places.js')]);
    const a = buildOutside();
    a.driver = createDriver({ area: a, keys, stick, ui: driveUI, player });
    a.places = places;
    a.guide = places.createGuide({
      area: a, camera,
      ui: { marks: $("marks"), map: $("mapCanvas"), turn: $("turn") },
      onArrive: (p) => arrive(p),
      onBanner: (name) => showPlace(name, "entering"),
    });
    return a;
  },
};
let area = null;
let areaName = null;

const player = createPlayer(areas.apartment.scene);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);
const camOff = new THREE.Vector3();
const camTarget = new THREE.Vector3();
const ink = createInk(renderer, camera);

// ---- cameras: a wanted pose per frame, blended on mode changes ----
const want = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), fov: 50, near: 0.1 };
const followPos = new THREE.Vector3();
const lookAt = new THREE.Vector3();
const _m = new THREE.Matrix4();
const blend = { t: 1, dur: 1, position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), fov: 50 };

function startBlend(dur) {
  blend.t = 0;
  blend.dur = dur;
  blend.position.copy(camera.position);
  blend.quaternion.copy(camera.quaternion);
  blend.fov = camera.fov;
}

// outdoors on foot the follow camera can swing around Ani (drag the mouse, or a
// second finger on touch); the apartment keeps its fixed dollhouse angle
const look = { yaw: 0 };
function followPose(dt, snap = false) {
  const { x, y, z } = player.state;
  const c = Math.cos(look.yaw), sn = Math.sin(look.yaw);
  camTarget.set(x + camOff.x * c + camOff.z * sn, y + camOff.y, z - camOff.x * sn + camOff.z * c);
  if (snap) followPos.copy(camTarget);
  else followPos.lerp(camTarget, 1 - Math.pow(0.001, dt));
  want.position.copy(followPos);
  lookAt.set(x, y + area.view.lookY, z);
  _m.lookAt(followPos, lookAt, THREE.Object3D.DEFAULT_UP);
  want.quaternion.setFromRotationMatrix(_m);
  want.fov = 50;
  want.near = area.view.near ?? 0.1;
}

function applyCamera(dt) {
  let e = 1;
  if (blend.t < blend.dur) {
    blend.t += dt;
    const k = Math.min(1, blend.t / blend.dur);
    e = k * k * (3 - 2 * k);
  }
  camera.position.lerpVectors(blend.position, want.position, e);
  camera.quaternion.slerpQuaternions(blend.quaternion, want.quaternion, e);
  const fov = blend.fov + (want.fov - blend.fov) * e;
  const near = e < 1 ? Math.min(camera.near, want.near) : want.near;
  if (Math.abs(fov - camera.fov) > 0.01 || near !== camera.near) {
    camera.fov = fov;
    camera.near = near;
    camera.updateProjectionMatrix();
  }
}

// ---- view distances: fog and ink fade ease to the mode's values ----
const view = { fog: [0, 0], ink: [0, 0] };

function settleView() {
  const v = area.view;
  view.fog = v.fog ? [...v.fog] : null;
  view.ink = [...v.ink];
  camera.far = v.far;
  camera.updateProjectionMatrix();
  updateView(1, false, true);
}

function updateView(dt, driving, snap = false) {
  const v = driving && area.driveView ? area.driveView : area.view;
  const k = snap ? 1 : 1 - Math.exp(-2.2 * dt);
  // past the edge of the map a fog bank closes in (outside.js says how deep you are)
  const at = driving ? area.driver.pose : player.state;
  const bank = area.bankAt ? area.bankAt(at.x, at.z) : 0;
  if (view.fog && v.fog) {
    view.fog[0] += (v.fog[0] * (1 - 0.94 * bank) - view.fog[0]) * k;
    view.fog[1] += (v.fog[1] * (1 - 0.8 * bank) - view.fog[1]) * k;
    area.scene.fog.near = view.fog[0];
    area.scene.fog.far = view.fog[1];
  }
  view.ink[0] += (v.ink[0] - view.ink[0]) * k;
  view.ink[1] += (v.ink[1] - view.ink[1]) * k;
  ink.setFade(view.ink[0], view.ink[1]);
  if (camera.far !== v.far) {
    camera.far = v.far;
    camera.updateProjectionMatrix();
  }
}

// phones render the big outdoors at up to 1.5x pixel ratio (the apartment keeps 2x)
const coarse = matchMedia("(pointer: coarse)").matches;
function setPixelRatio(name) {
  const pr = Math.min(devicePixelRatio, coarse && name === "outside" ? 1.5 : 2);
  if (pr === renderer.getPixelRatio()) return;
  renderer.setPixelRatio(pr);
  ink.setSize();
}

function enter(name) {
  area = areas[name];
  areaName = name;
  look.yaw = 0;
  document.body.dataset.area = name;
  setPixelRatio(name);
  area.scene.add(player.group); // re-parents out of the previous area's scene
  const e = area.entry;
  Object.assign(player.state, { x: e.x, z: e.z, y: 0, dirX: e.dirX ?? 0, dirZ: e.dirZ ?? -1 });
  frameCamera();
  // start the camera already behind the player instead of sweeping across the map
  followPose(0, true);
  blend.t = blend.dur;
  applyCamera(0);
  settleView();
}

// Portrait phones see a narrow slice; areas that ask for it (outdoors) pull
// the camera back so you still see the lot around you.
function frameCamera() {
  const widen = area.view.widen && camera.aspect < 1 ? Math.min(1.5, camera.aspect ** -0.5) : 1;
  camOff.fromArray(area.view.off).multiplyScalar(widen);
}

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  ink.setSize();
  frameCamera();
});

// ---- input ----
const keys = {};
let running = false; // R (or the Run sticker on touch) toggles the area's run speed
function setRunning(on) {
  running = on;
  runBtn.classList.toggle("on", on);
  runBtn.setAttribute("aria-pressed", String(on));
}
runBtn.addEventListener("click", () => setRunning(!running));

const driving = () => !!area?.driver?.active;

addEventListener("keydown", (e) => {
  // typing into a panel form isn't game input (an "e" in a title shouldn't close the panel)
  if (e.target.closest?.("input, textarea, select")) return;
  const k = e.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
  keys[k === " " ? " " : k] = true;
  if (e.repeat) return;
  if (k === "p" && area?.guide) { if (panelKind === "places") closePanel(); else openPlaces(); return; }
  if (k === "escape") closePanel();
  if (driving()) {
    if (k === "e") getOut();
    if (k === "c") toggleCam();
    return;
  }
  if (k === "r") setRunning(!running);
  if (k === "e" && !panelOpen && nearest) use(nearest);
  else if (k === "e" && panelOpen) closePanel();
});
addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });
// a key held while the tab loses focus never sends its keyup
addEventListener("blur", () => { for (const k in keys) keys[k] = false; });

// ---- touch: a floating stick wherever a finger lands on the scene ----
// Phones are detected by input, not width: the CSS starts in touch mode on
// (pointer: coarse) screens, and the first real touch or key press flips it,
// which also covers touchscreen laptops and tablets with keyboards.
// While driving the stick only steers: it moves sideways and starts on the
// left of the screen, leaving the right for the pedals.
const setTouchMode = (on) => document.body.classList.toggle("touch", on);
setTouchMode(matchMedia("(pointer: coarse)").matches);
addEventListener("pointerdown", (e) => { if (e.pointerType === "touch") setTouchMode(true); }, true);
addEventListener("keydown", (e) => {
  // on-screen keyboards typing into panel forms fire keydown too
  if (!e.target.closest?.("input, textarea, select")) setTouchMode(false);
}, true);

const STICK_R = 56; // px the knob can travel from the base
const stickEl = document.getElementById("stick");
const knobEl = stickEl.querySelector(".knob");
const stick = { id: null, ox: 0, oy: 0, x: 0, z: 0 };

renderer.domElement.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse" || stick.id !== null) return;
  if (driving() && e.clientX > innerWidth * 0.62) return;
  stick.id = e.pointerId;
  stick.ox = e.clientX;
  stick.oy = e.clientY;
  try { renderer.domElement.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
  stickEl.style.left = `${e.clientX}px`;
  stickEl.style.top = `${e.clientY}px`;
  knobEl.style.transform = "";
  stickEl.classList.add("on");
});
renderer.domElement.addEventListener("pointermove", (e) => {
  if (e.pointerId !== stick.id) return;
  let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy;
  if (driving()) {
    dx = Math.max(-STICK_R, Math.min(STICK_R, dx));
    knobEl.style.transform = `translate(${dx}px, 0)`;
    const m = Math.abs(dx) / STICK_R;
    stick.x = Math.sign(dx) * (m < 0.1 ? 0 : (m - 0.1) / 0.9);
    stick.z = 0;
    return;
  }
  const d = Math.hypot(dx, dy);
  if (d > STICK_R) { dx *= STICK_R / d; dy *= STICK_R / d; }
  knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
  // the camera looks straight down -Z, so screen right/down map to +X/+Z
  const m = Math.min(d, STICK_R) / STICK_R;
  const pace = m < 0.15 ? 0 : (m - 0.15) / 0.85; // dead zone so a resting thumb stays still
  stick.x = d ? (dx / Math.min(d, STICK_R)) * pace : 0;
  stick.z = d ? (dy / Math.min(d, STICK_R)) * pace : 0;
});
const resetStick = () => {
  stick.id = null;
  stick.x = stick.z = 0;
  stickEl.classList.remove("on");
};
const releaseStick = (e) => { if (e.pointerId === stick.id) resetStick(); };
renderer.domElement.addEventListener("pointerup", releaseStick);
renderer.domElement.addEventListener("pointercancel", releaseStick);

// the speech bubble doubles as the interact button on touch
promptEl.addEventListener("click", () => { if (!panelOpen && nearest) use(nearest); });

// screen directions (right, toward the camera) turned into the world by the camera's swing
const dir = () => {
  let x = ((keys.d || keys.arrowright) ? 1 : 0) - ((keys.a || keys.arrowleft) ? 1 : 0);
  let z = ((keys.s || keys.arrowdown) ? 1 : 0) - ((keys.w || keys.arrowup) ? 1 : 0);
  if (!x && !z) { x = stick.x; z = stick.z; }
  const c = Math.cos(look.yaw), sn = Math.sin(look.yaw);
  return { x: x * c + z * sn, z: -x * sn + z * c };
};

// swinging the camera: a mouse drag, or a second finger while the first walks
const swing = { id: null, x: 0 };
renderer.domElement.addEventListener("pointerdown", (e) => {
  if (areaName !== "outside" || driving() || swing.id !== null) return;
  if (e.pointerType !== "mouse" && (stick.id === null || stick.id === e.pointerId)) return;
  swing.id = e.pointerId;
  swing.x = e.clientX;
  try { renderer.domElement.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
});
renderer.domElement.addEventListener("pointermove", (e) => {
  if (e.pointerId !== swing.id) return;
  look.yaw -= (e.clientX - swing.x) * 0.006;
  swing.x = e.clientX;
});
const endSwing = (e) => { if (e.pointerId === swing.id) swing.id = null; };
renderer.domElement.addEventListener("pointerup", endSwing);
renderer.domElement.addEventListener("pointercancel", endSwing);

// ---- the car: get in, get out, switch cameras ----
function getIn() {
  resetStick();
  setRunning(false);
  area.driver.enter();
  startBlend(0.75);
}

function getOut() {
  if (!area.driver.exit()) return;
  resetStick();
  followPose(0, true);
  startBlend(0.6);
}

function toggleCam() {
  area.driver.toggleCam();
  startBlend(0.4);
}
driveUI.cam.addEventListener("click", () => { if (driving()) toggleCam(); });
driveUI.out.addEventListener("click", () => { if (driving()) getOut(); });

// ---- auth: one private probe; 401 means logged out ----
let authed = false;
fetch("/api/gaming/recent").then((r) => {
  authed = r.ok;
  authPill.innerHTML = authed
    ? `✅ logged in · <a href="/logout">log out</a>`
    : `👤 browsing as guest · <a href="/login">log in</a>`;
}).catch(() => {
  authPill.innerHTML = `👤 browsing as guest · <a href="/login">log in</a>`;
});

// ---- interaction ----
let nearest = null;
let panelOpen = false;
let panelKind = null;

function findNearest() {
  let best = null, bestD = Infinity;
  for (const it of area.interactables) {
    const d = Math.hypot(player.state.x - it.x, player.state.z - it.z);
    if (d < it.r && d < bestD) { best = it; bestD = d; }
  }
  return best;
}

// doors travel, the car drives; everything else opens its panel
function use(it) {
  if (it.go) travel(it.go);
  else if (it.drive) getIn();
  else openPanel(it);
}

// it: an interactable ({kind}), or a panel of its own ({kind, render, bind})
async function openPanel(it) {
  panelOpen = true;
  panelKind = it.kind;
  panelTitle.textContent = "…";
  panelBody.innerHTML = `<p class="muted">Loading…</p>`;
  panel.classList.add("open");
  const { title, html } = await (it.render ? it.render() : renderPanel(it.kind, authed));
  if (!panelOpen || panelKind !== it.kind) return; // user moved on
  panelTitle.textContent = title;
  // a fresh body each time, so listeners bound to the last one go with it
  const body = panelBody.cloneNode(false);
  panelBody.replaceWith(body);
  panelBody = body;
  body.innerHTML = html;
  if (it.bind) it.bind(body);
  else bindPanel(it.kind, body, () => openPanel(it));
  body.querySelector("[data-retry]")?.addEventListener("click", (e) => { e.preventDefault(); openPanel(it); });
}

function closePanel() {
  panelOpen = false;
  panelKind = null;
  panel.classList.remove("open");
}
document.getElementById("panelClose").addEventListener("click", closePanel);

// ---- travel: fade to black, swap areas, fade back in ----
let travelling = false;
let placeTimer = 0;

async function travel(to) {
  if (travelling || to === areaName) return;
  travelling = true;
  closePanel();
  resetStick();
  fadeEl.classList.add("on");
  await new Promise((r) => setTimeout(r, 280));
  try {
    if (!areas[to]) areas[to] = await loaders[to]();
    enter(to);
    showPlace(area.caption);
  } catch (err) {
    console.error(`couldn't load ${to}`, err); // stay where we are
  }
  fadeEl.classList.remove("on");
  travelling = false;
}

function showPlace(text, kicker = "") {
  if (!text) return;
  placeEl.innerHTML = "";
  if (kicker) placeEl.append(Object.assign(document.createElement("small"), { textContent: kicker }));
  placeEl.append(text);
  placeEl.classList.add("show");
  clearTimeout(placeTimer);
  placeTimer = setTimeout(() => placeEl.classList.remove("show"), 2600);
}

// ---- places: the list, arriving, fast travel ----
const placeActions = {
  route(id) {
    area.guide.routeTo(id);
    closePanel();
  },
  clear() {
    area.guide.clearRoute();
    if (panelKind === "places") openPlaces();
    else closePanel();
  },
  go(id) { fastTravel(id); },
};

function openPlaces() {
  if (!area?.guide) return;
  openPanel({
    kind: "places",
    render: async () => area.places.placesPanel(area.guide),
    bind: (root) => area.places.bindPlaces(root, placeActions),
  });
}
$("map").addEventListener("click", (e) => {
  e.currentTarget.blur(); // or Space (the handbrake) would press it again
  if (panelKind === "places") closePanel(); else openPlaces();
});

function arrive(p) {
  showPlace(p.name);
  openPanel({
    kind: `arrive:${p.id}`,
    render: () => area.places.arrivalPanel(p, area.guide, authed),
    bind: (root) => area.places.bindPlaces(root, placeActions),
  });
}

async function fastTravel(id) {
  const p = area?.guide?.places.find((q) => q.id === id);
  if (!p || travelling) return;
  travelling = true;
  closePanel();
  resetStick();
  fadeEl.classList.add("on");
  await new Promise((r) => setTimeout(r, 280));
  try {
    const inCar = driving();
    area.driver.teleport(p.park.x, p.park.z, p.park.h);
    if (area.guide.target === p) area.guide.clearRoute();
    // stream the new spot in behind the black, a bigger slice of each frame than usual
    const t0 = performance.now();
    while (performance.now() - t0 < 8000 && !area.town.readyAround(p.park.x, p.park.z, 900)) {
      area.town.update(p.park.x, p.park.z, inCar ? 1800 : 1200, 30);
      await new Promise((r) => setTimeout(r, 0));
    }
    if (inCar) area.driver.cameraPose(want, 0, camera.aspect);
    else followPose(0, true);
    blend.t = blend.dur;
    applyCamera(0);
    updateView(1, inCar, true);
    area.guide.landed(p);
  } catch (err) {
    console.error("fast travel failed", err);
  }
  fadeEl.classList.remove("on");
  travelling = false;
  arrive(p);
}

// /game?start=outside drops you straight into the lot (handy for testing)
const start = new URLSearchParams(location.search).get("start") === "outside" ? "outside" : "apartment";
if (!areas[start]) areas[start] = await loaders[start]();
enter(start);

// ---- dynamic resolution (phones, outdoors): hold ~50+ fps by trading pixels ----
// Every 1.5 s the average frame rate decides: under 50 drops the pixel ratio a
// step (down to 0.7), over 57 for a while tries a step back up (to the 1.5
// cap). A step up that drops straight back doubles the wait before the next
// try (8 s up to a minute), so a phone that can't hold a step stops trying it.
const dyn = { frames: 0, t: 0, last: performance.now(), wait: 4, hold: 8, raised: false, settle: 3 };
function frameStats() {
  const now = performance.now();
  // loading and travel stutter; don't judge the first seconds after them
  if (travelling || firstFrame) dyn.settle = 3;
  if (dyn.settle > 0) {
    dyn.settle -= (now - dyn.last) / 1000;
    dyn.last = now;
    dyn.frames = 0;
    dyn.t = 0;
    return;
  }
  dyn.frames++;
  dyn.t += (now - dyn.last) / 1000;
  dyn.last = now;
  if (dyn.t < 1.5) return;
  const fps = dyn.frames / dyn.t;
  dyn.frames = 0;
  dyn.t = 0;
  dyn.wait -= 1.5;
  if (stats) stats.fps = fps;
  if (!coarse || areaName !== "outside" || travelling || document.hidden) return;
  const max = Math.min(devicePixelRatio, 1.5), cur = renderer.getPixelRatio();
  let next = cur;
  if (fps < 50 && cur > 0.7) {
    next = Math.max(0.7, cur - 0.15);
    if (dyn.raised) dyn.hold = Math.min(60, dyn.hold * 2);
    dyn.wait = dyn.hold;
  } else if (fps > 57 && cur < max && dyn.wait <= 0) {
    next = Math.min(max, cur + 0.1);
    dyn.wait = 4;
  }
  dyn.raised = next > cur;
  if (next !== cur) {
    renderer.setPixelRatio(next);
    ink.setSize();
  }
}

// ?stats: frame rate, pixel ratio, and draw calls / triangles per pass
const stats = new URLSearchParams(location.search).has("stats") ? { el: Object.assign(document.createElement("div"), { id: "stats", className: "hud" }) } : null;
if (stats) {
  document.body.append(stats.el);
  setInterval(() => {
    const c = stats.color, n = stats.normal;
    if (!c) return;
    // the color render includes the shadow map's; the normal pass draws exactly the color pass's objects
    stats.el.textContent = `${Math.round(stats.fps || 0)} fps · ${renderer.getPixelRatio().toFixed(2)}x · `
      + `color ${n.calls} calls ${Math.round(n.triangles / 1000)}k tris · shadow ${c.calls - n.calls} calls ${Math.round((c.triangles - n.triangles) / 1000)}k`;
  }, 500);
}

// ---- loop ----
const clock = new THREE.Clock();
let firstFrame = true;

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  const inCar = driving();

  if (!panelOpen && !travelling && !inCar) player.update(dt, dir(), area, running);
  area.driver?.update(dt);

  nearest = travelling || inCar ? null : findNearest();
  if (nearest && !panelOpen) {
    promptLabel.textContent = nearest.label;
    promptEl.style.display = "block";
  } else {
    promptEl.style.display = "none";
  }

  if (inCar) area.driver.cameraPose(want, dt, camera.aspect);
  else followPose(dt);
  applyCamera(dt);
  updateView(dt, inCar);

  area.update?.(dt, camera, player, inCar);
  if (area.guide && !travelling) area.guide.update(dt, player);

  ink.render(area.scene, area.overlay, clock.elapsedTime, stats);
  frameStats();
  if (firstFrame) {
    firstFrame = false;
    document.getElementById("loading").style.display = "none";
  }
}
tick();
