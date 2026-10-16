/*
Apartment MVP entry point: renderer, ink post pass, follow camera, input,
game loop, interaction prompts, and the slide-in panel.
*/import * as THREE from 'three';
import { buildWorld } from './world.js';
import { createInk } from './ink.js';
import { LABEL_FONT } from './pencil.js';
import { createPlayer } from './player.js';
import { INTERACTABLES, SPAWN } from './apartment.js';
import { renderPanel, bindPanel } from './panels.js';

const container = document.getElementById("scene");
const promptEl = document.getElementById("prompt");
const promptLabel = document.getElementById("promptLabel");
const panel = document.getElementById("panel");
const panelTitle = document.getElementById("panelTitle");
const panelBody = document.getElementById("panelBody");
const authPill = document.getElementById("authpill");

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

const scene = new THREE.Scene();
const { colliders, overlay } = buildWorld(scene);
const player = createPlayer(scene);
player.state.x = SPAWN.x;
player.state.z = SPAWN.z;
if (SPAWN.dirX !== undefined) { player.state.dirX = SPAWN.dirX; player.state.dirZ = SPAWN.dirZ; }

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);
const CAM_OFF = new THREE.Vector3(0, 14.5, 12);
const camTarget = new THREE.Vector3();
// start the camera already behind the player instead of sweeping in from the origin
camera.position.set(SPAWN.x + CAM_OFF.x, CAM_OFF.y, SPAWN.z + CAM_OFF.z);

const ink = createInk(renderer, scene, camera);

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  ink.setSize();
});

// ---- input ----
const keys = {};
addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
  keys[k === " " ? " " : k] = true;
  if (k === "e" && !panelOpen && nearest) openPanel(nearest);
  else if (k === "e" && panelOpen) closePanel();
  if (k === "escape") closePanel();
});
addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });

// ---- touch: a floating stick wherever a finger lands on the scene ----
// Phones are detected by input, not width: the CSS starts in touch mode on
// (pointer: coarse) screens, and the first real touch or key press flips it,
// which also covers touchscreen laptops and tablets with keyboards.
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
  stick.id = e.pointerId;
  stick.ox = e.clientX;
  stick.oy = e.clientY;
  renderer.domElement.setPointerCapture(e.pointerId);
  stickEl.style.left = `${e.clientX}px`;
  stickEl.style.top = `${e.clientY}px`;
  knobEl.style.transform = "";
  stickEl.classList.add("on");
});
renderer.domElement.addEventListener("pointermove", (e) => {
  if (e.pointerId !== stick.id) return;
  let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy;
  const d = Math.hypot(dx, dy);
  if (d > STICK_R) { dx *= STICK_R / d; dy *= STICK_R / d; }
  knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
  // the camera looks straight down -Z, so screen right/down map to +X/+Z
  const m = Math.min(d, STICK_R) / STICK_R;
  const pace = m < 0.15 ? 0 : (m - 0.15) / 0.85; // dead zone so a resting thumb stays still
  stick.x = d ? (dx / Math.min(d, STICK_R)) * pace : 0;
  stick.z = d ? (dy / Math.min(d, STICK_R)) * pace : 0;
});
const releaseStick = (e) => {
  if (e.pointerId !== stick.id) return;
  stick.id = null;
  stick.x = stick.z = 0;
  stickEl.classList.remove("on");
};
renderer.domElement.addEventListener("pointerup", releaseStick);
renderer.domElement.addEventListener("pointercancel", releaseStick);

// the speech bubble doubles as the interact button on touch
promptEl.addEventListener("click", () => { if (!panelOpen && nearest) openPanel(nearest); });

const dir = () => {
  const x = ((keys.d || keys.arrowright) ? 1 : 0) - ((keys.a || keys.arrowleft) ? 1 : 0);
  const z = ((keys.s || keys.arrowdown) ? 1 : 0) - ((keys.w || keys.arrowup) ? 1 : 0);
  return x || z ? { x, z } : { x: stick.x, z: stick.z };
};

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
  for (const it of INTERACTABLES) {
    const d = Math.hypot(player.state.x - it.x, player.state.z - it.z);
    if (d < it.r && d < bestD) { best = it; bestD = d; }
  }
  return best;
}

async function openPanel(it) {
  panelOpen = true;
  panelKind = it.kind;
  panelTitle.textContent = "…";
  panelBody.innerHTML = `<p class="muted">Loading…</p>`;
  panel.classList.add("open");
  const { title, html } = await renderPanel(it.kind, authed);
  if (!panelOpen || panelKind !== it.kind) return; // user moved on
  panelTitle.textContent = title;
  panelBody.innerHTML = html;
  bindPanel(it.kind, panelBody, () => openPanel(it));
}

function closePanel() {
  panelOpen = false;
  panelKind = null;
  panel.classList.remove("open");
}
document.getElementById("panelClose").addEventListener("click", closePanel);

// ---- loop ----
const clock = new THREE.Clock();
let firstFrame = true;

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (!panelOpen) player.update(dt, dir(), colliders);

  nearest = findNearest();
  if (nearest && !panelOpen) {
    promptLabel.textContent = nearest.label;
    promptEl.style.display = "block";
  } else {
    promptEl.style.display = "none";
  }

  // follow camera, eased
  camTarget.set(player.state.x + CAM_OFF.x, CAM_OFF.y, player.state.z + CAM_OFF.z);
  camera.position.lerp(camTarget, 1 - Math.pow(0.001, dt));
  camera.lookAt(player.state.x, 2.6, player.state.z);

  ink.render(overlay, clock.elapsedTime);
  if (firstFrame) {
    firstFrame = false;
    document.getElementById("loading").style.display = "none";
  }
}
tick();
