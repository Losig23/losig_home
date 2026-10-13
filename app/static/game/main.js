/*
Apartment MVP entry point: renderer, follow camera, input, game loop,
interaction prompts, and the slide-in panel.
*/import * as THREE from 'three';
import { buildWorld } from './world.js';
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
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const { colliders } = buildWorld(scene);
const player = createPlayer(scene);
player.state.x = SPAWN.x;
player.state.z = SPAWN.z;

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);
const CAM_OFF = new THREE.Vector3(0, 14.5, 12);
const camTarget = new THREE.Vector3();

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
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

const dir = () => ({
  w: keys.w || keys.arrowup,
  a: keys.a || keys.arrowleft,
  s: keys.s || keys.arrowdown,
  d: keys.d || keys.arrowright,
});

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
  camera.lookAt(player.state.x, 1.2, player.state.z);

  renderer.render(scene, camera);
  if (firstFrame) {
    firstFrame = false;
    document.getElementById("loading").style.display = "none";
  }
}
tick();
