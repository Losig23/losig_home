/*
Places around town: Home, Work, the gym, gas, two groceries and the big-box
store. Generic names only (the game is public): every position here is feet
from the home lot's reference point, like the rest of the outdoors.

- Each place has a marker anchor over its building (checked against the
  baked footprints), a parking spot where fast travel leaves the car, and an
  arrival radius. The stores' lots aren't in the map data, so the places that
  need one get a paved pad with stalls beside the building; the gas station
  gets a real canopy over its pumps in place of the solid block its footprint
  bakes into.
- Markers are paper stickers ("GYM · 0.4 mi") projected from the world each
  frame. They're HTML over the canvas, so fog never washes them out and the
  text stays crisp; overlapping ones stack, and the routed one stays on screen
  at the edge when it's behind you.
- Arriving: stop under 3 mph inside a place's radius (or walk into it) and
  main.js shows the arrival caption and the place's panel. A place only arms
  once you've been well outside it, so starting at Home doesn't count.
- Neighborhoods: a few generic areas ("Downtown", "Eastside", ...). Crossing
  into one for more than a moment puts up a banner.
*/import * as THREE from 'three';
import { loadRoads } from './roads.js';
import { createMinimap } from './minimap.js';
import { createRoute, fmtDist } from './route.js';
import { renderPanel } from './panels.js';

// marker: building anchor (x, z) and its roof height y; park: where the car
// stops, facing the door (heading as three.js rotation.y: 0 faces south)
export const PLACES = [
  { id: 'home', name: 'Home', tag: 'HOME', icon: '🏠', x: 37.5, z: 90, y: 34, r: 150,
    park: { x: 112, z: -67.5, h: -Math.PI / 2 } },
  { id: 'work', name: 'Work', tag: 'WORK', icon: '💼', x: -878, z: -6116, y: 22, r: 170,
    park: { x: -1000, z: -6150, h: Math.PI / 2 } },
  { id: 'gym', name: 'Gym', tag: 'GYM', icon: '🏋️', x: -2760, z: 3933, y: 19, r: 190,
    park: { x: -2595, z: 3880, h: -Math.PI / 2 } },
  { id: 'gas', name: 'Gas', tag: 'GAS', icon: '⛽', x: 1842, z: -1423, y: 19, r: 120,
    park: { x: 1790, z: -1440, h: Math.PI } },
  { id: 'grocery-east', name: 'Groceries (east)', tag: 'GROCERIES', icon: '🛒', x: -3030, z: -4154, y: 20, r: 190,
    park: { x: -2900, z: -3925, h: Math.PI } },
  { id: 'grocery-west', name: 'Groceries (west)', tag: 'GROCERIES', icon: '🛒', x: -3931, z: -3512, y: 24, r: 170,
    park: { x: -3930, z: -3645, h: 0 } },
  { id: 'bigbox', name: 'Big-box store', tag: 'BIG-BOX', icon: '🏬', x: -2547, z: 5717, y: 25, r: 240,
    park: { x: -2550, z: 6066, h: Math.PI } },
];

// paved pads with stall rows [x1, z1, x2, z2, stalls along 'x' or 'z']
const PADS = [
  [-1110, -6205, -970, -6095, 'x'],     // work, west of the building
  [-2620, 3770, -2420, 3990, 'z'],      // gym, east of the building
  [-2962, -3970, -2842, -3815, 'x'],    // groceries (east), off the main street
  [-4005, -3690, -3830, -3600, 'x'],    // groceries (west), between its two aisles
  [1722, -1495, 1815, -1355, null],     // gas: concrete under and beside the canopy
];
// footprints that need a different look: the fuel canopy bakes as a solid block
// (places.js draws a roof on posts instead), and the gas station's store as a
// two-story house (it's a one-story shop). set: indexes into a baked house row.
export const RESTYLE = [
  { x: 1748.1, z: -1424, skip: true },
  { x: 1842.3, z: -1423.4, set: { 5: 15, 6: 1, 9: 1 } },   // height, flat roof, shop
];
const CANOPY = { x: 1748, z: -1424, w: 26, d: 116, h: 15.5 };

// generic neighborhood names, first match wins (the edge of town is checked first)
const AREAS = [
  ['Downtown', -4600, -8700, -1200, -7000],
  ['Northside', -9000, -13000, 6000, -7000],
  ['Westside', -16000, -13000, -9000, -4000],
  ['Southwest', -16000, -4000, -9000, 10000],
  ['Midtown', -9000, -7000, -1000, 1500],
  ['Eastside', -1000, -7000, 6000, 1500],
  ['Southside', -9000, 1500, 6000, 10000],
];

const ASPHALT = 0x8f9399;
const CONCRETE = 0xbcb8b0;
const PAINT = 0xf4f1ea;
const STEEL = 0xc7cacc;
const CANOPY_C = 0xf4f2ec;
const BAND = 0xe25a5a;

export const onPad = (x, z) => PADS.some(([x1, z1, x2, z2]) => x >= x1 && x <= x2 && z >= z1 && z <= z2);

/** The pads, stall stripes and the gas canopy, into the outdoors' static and ground batches. */
export function buildPlaceProps({ b, ground, colliders }) {
  for (const [x1, z1, x2, z2, rows] of PADS) {
    ground.lots.flat((x1 + x2) / 2, 0.04, (z1 + z2) / 2, x2 - x1, z2 - z1, rows ? ASPHALT : CONCRETE);
    if (!rows) continue;
    // a row of 9 ft stalls along each long edge, the aisle down the middle
    const along = rows === 'x';
    const [a0, a1, c0, c1] = along ? [x1, x2, z1, z2] : [z1, z2, x1, x2];
    for (const edge of [c0, c1]) {
      const mid = edge + Math.sign((c0 + c1) / 2 - edge) * 9;
      for (let u = a0 + 6; u <= a1 - 6; u += 9) {
        if (along) ground.paint.flat(u, 0.08, mid, 0.4, 16, PAINT);
        else ground.paint.flat(mid, 0.08, u, 16, 0.4, PAINT);
      }
    }
  }
  // gas: a flat canopy on four posts, a red fascia band, pump islands under it
  const { x, z, w, d, h } = CANOPY;
  b.box(x, h, z, w, 2.2, d, CANOPY_C);
  b.box(x, h + 0.6, z, w + 0.2, 1.0, d + 0.2, BAND);
  for (const dz of [-d / 2 + 12, -d / 6, d / 6, d / 2 - 12]) {
    b.cyl(x, 0, z + dz, 0.55, h, STEEL, 10);
    b.box(x, 0, z + dz, 3, 0.5, 9, CONCRETE);                 // island
    b.box(x, 0.5, z + dz + 2.2, 1.6, 4.6, 1.2, 0xece8df);     // pump
    b.box(x + 0.1, 3.2, z + dz + 2.2, 1.7, 0.9, 1.0, BAND);
    colliders.push({ x1: x - 1.5, z1: z + dz - 4.5, x2: x + 1.5, z2: z + dz + 4.5 });
  }
}

/** Which neighborhood (x, z) is in, by name. */
export function areaAt(x, z, bounds) {
  if (bounds) {
    const edge = Math.min(x - bounds.x1, bounds.x2 - x, z - bounds.z1, bounds.z2 - z);
    if (edge < 1200) return 'Edge of town';
  }
  for (const [name, x1, z1, x2, z2] of AREAS) if (x >= x1 && x < x2 && z >= z1 && z < z2) return name;
  return 'Out of town';
}


/**
 * Everything the outdoors adds for getting around: markers, the minimap, the
 * route, arrival and neighborhood banners. main.js calls update() each frame
 * outdoors and reacts to onArrive / onBanner.
 */
export function createGuide({ area, camera, ui, onArrive, onBanner }) {
  const marks = new Map();
  for (const p of PLACES) {
    const el = document.createElement('div');
    el.className = 'mark';
    el.innerHTML = `<span class="ico">${p.icon}</span><b>${p.tag}</b><span class="dist"></span><span class="arrow">➜</span>`;
    ui.marks.appendChild(el);
    marks.set(p.id, { p, el, dist: el.querySelector('.dist'), arrow: el.querySelector('.arrow'), shown: '', w: 0, h: 0, armed: false, still: 0 });
  }

  let target = null, pending = null;           // the routed place (pending until the graph loads)
  let here = { name: null, t: 0, shown: null }; // the neighborhood
  const _v = new THREE.Vector3();
  let minimap = null, route = null;
  loadRoads().then((roads) => {
    minimap = createMinimap(ui.map, roads, PLACES);
    route = createRoute({ scene: area.scene, roads });
    if (pending) routeTo(pending);
  }).catch((err) => console.error('no road graph', err));

  function routeTo(id) {
    target = PLACES.find((p) => p.id === id) || null;
    if (!target) return;
    pending = route ? null : id;
    if (!route) return;
    locate();
    route.set(target, me);
  }

  function clearRoute() {
    target = null;
    pending = null;
    route?.clear();
  }

  // where you are: the car while driving, else Ani
  let me = { x: 0, z: 0, h: 0, driving: false, speed: 0, dirX: 0, dirZ: -1 };
  let player = null;
  function locate() {
    const d = area.driver;
    if (d?.active) me = { x: d.pose.x, z: d.pose.z, h: d.pose.h, driving: true, speed: d.speed, dirX: Math.sin(d.pose.h), dirZ: Math.cos(d.pose.h) };
    else if (player) {
      const st = player.state;
      me = { x: st.x, z: st.z, h: Math.atan2(st.dirX, st.dirZ), driving: false, speed: 0, dirX: st.dirX, dirZ: st.dirZ };
    }
  }

  // ---- markers: project, stack, clamp the routed one to the screen edge ----
  // The HUD's stickers count as already placed, so labels stack clear of them
  // (re-measured twice a second; they move between foot, driving and phone layouts).
  const HUD = ['title', 'authpill', 'help', 'exit', 'run', 'map', 'speedo', 'drivetop', 'pedals', 'turn', 'prompt'];
  let hud = [], hudT = 0;
  const placed = [];
  function drawMarks(W, H, dt) {
    hudT -= dt;
    if (hudT <= 0) {
      hudT = 0.5;
      hud = [];
      for (const id of HUD) {
        const el = document.getElementById(id);
        const r = el?.getBoundingClientRect();
        if (r && r.width && r.height && getComputedStyle(el).opacity !== '0') hud.push({ x1: r.left - 4, x2: r.right + 4, y1: r.top - 4, y2: r.bottom + 4, hud: true });
      }
    }
    placed.length = 0;
    placed.push(...hud);
    const list = [];
    for (const m of marks.values()) {
      const { p } = m;
      const d = Math.hypot(p.x - me.x, p.z - me.z);
      const txt = ` · ${fmtDist(d)}`;
      if (txt !== m.shown) {
        m.dist.textContent = txt;
        m.shown = txt;
        m.w = 0;
      }
      _v.set(p.x, p.y + 4, p.z).applyMatrix4(camera.matrixWorldInverse);
      const behind = _v.z > -1;
      _v.applyMatrix4(camera.projectionMatrix);
      let sx = (_v.x + 1) / 2 * W, sy = (1 - _v.y) / 2 * H;
      if (behind) { sx = W - sx; sy = H - sy; }
      const onScreen = !behind && sx > -40 && sx < W + 40 && sy > -20 && sy < H + 20;
      const isTarget = target?.id === p.id;
      // standing at a place, its own label would only float over your head
      const atIt = Math.min(d, Math.hypot(p.park.x - me.x, p.park.z - me.z)) < p.r * 0.6;
      list.push({ m, d, sx, sy, onScreen: onScreen && !atIt, isTarget: isTarget && !atIt, behind });
    }
    list.sort((a, b) => a.d - b.d);
    for (const it of list) {
      const { m } = it;
      m.el.classList.toggle('target', it.isTarget);
      if (!it.onScreen && !it.isTarget) { m.el.style.display = 'none'; continue; }
      m.el.style.display = '';
      if (!m.w) { m.w = m.el.offsetWidth; m.h = m.el.offsetHeight; }
      let x = it.sx, y = it.sy, edge = false;
      if (!it.onScreen || y < 60 || y > H - 90) {
        // pin to an inset frame along the line from the middle of the screen
        const cx = W / 2, cy = H / 2;
        let dx = x - cx, dy = y - cy;
        if (it.behind && Math.abs(dy) < 1) dy = 1;
        const fx = (W / 2 - m.w / 2 - 14) / Math.max(1e-3, Math.abs(dx)), fy = (H / 2 - 96) / Math.max(1e-3, Math.abs(dy));
        const f = Math.min(fx, fy, 1);
        x = cx + dx * f; y = cy + dy * f;
        edge = f < 1 || it.behind;
        m.arrow.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
      }
      m.el.classList.toggle('edge', edge);
      x = Math.max(m.w / 2 + 6, Math.min(W - m.w / 2 - 6, x));
      // stack up and out of the way of nearer labels (in the world, the tail's tip is the spot)
      let top = edge ? y - m.h / 2 : y - m.h - 9;
      for (let k = 0; k < 8; k++) {
        const hit = placed.find((r) => x - m.w / 2 < r.x2 && x + m.w / 2 > r.x1 && top < r.y2 && top + m.h > r.y1);
        if (!hit) break;
        // slide in off a HUD sticker (toward the middle); stack up over another label
        if (hit.hud) x = x > W / 2 ? hit.x1 - m.w / 2 - 2 : hit.x2 + m.w / 2 + 2;
        else top = hit.y1 - m.h - 2;
      }
      placed.push({ x1: x - m.w / 2, x2: x + m.w / 2, y1: top, y2: top + m.h });
      m.el.style.transform = `translate(${Math.round(x - m.w / 2)}px, ${Math.round(top)}px)`;
    }
  }

  // ---- arrival: stopped (or standing) at a place ----
  // The routed place counts anywhere inside its radius; any other only near its
  // parking spot, so waiting at a light beside a store doesn't pop its panel.
  function checkArrival(dt) {
    for (const m of marks.values()) {
      const { p } = m;
      const d = Math.hypot(p.park.x - me.x, p.park.z - me.z);
      const near = Math.min(d, Math.hypot(p.x - me.x, p.z - me.z));
      const inside = target === p ? near < p.r : me.driving ? d < p.r * 0.5 : near < p.r * 0.6;
      if (near > p.r * 1.4) m.armed = true;
      if (!inside || !m.armed) { m.still = 0; continue; }
      const parked = me.driving ? me.speed < 3 * 1.4667 : true;
      m.still = parked ? m.still + dt : 0;
      if (m.still > (me.driving ? 0.7 : 0.2)) {
        m.armed = false;
        m.still = 0;
        if (target?.id === p.id) clearRoute();
        onArrive?.(p);
      }
    }
  }

  // ---- neighborhoods: a banner after a moment inside a new one ----
  function checkArea(dt) {
    const name = areaAt(me.x, me.z, area.world?.bounds);
    if (name !== here.name) { here.name = name; here.t = 0; }
    here.t += dt;
    if (here.t > 1.2 && name !== here.shown) {
      const first = here.shown === null;
      here.shown = name;
      if (!first) onBanner?.(name);
    }
  }

  let mapT = 0;
  return {
    get target() { return target; },
    get route() { return route; },
    routeTo,
    clearRoute,
    places: PLACES,
    /** After fast travel to p: arrival re-arms everywhere else, and the new neighborhood gets no banner. */
    landed(p) {
      for (const m of marks.values()) { m.armed = m.p !== p; m.still = 0; }
      here = { name: areaAt(p.park.x, p.park.z, area.world?.bounds), t: 0, shown: null };
      here.shown = here.name;
    },
    /** Straight-line feet from where you are now (fresh, so panels built right after fast travel are right). */
    distanceTo(p) {
      locate();
      return Math.hypot(p.x - me.x, p.z - me.z);
    },
    get me() { return me; },

    update(dt, ani) {
      player = ani;
      locate();
      const W = innerWidth, H = innerHeight;
      drawMarks(W, H, dt);
      checkArrival(dt);
      checkArea(dt);
      route?.update(dt, me);
      drawTurn(ui.turn, me.driving && route?.active ? route.next(me) : null, target);
      // the minimap redraws at most ~30 times a second
      mapT += dt;
      if (minimap && mapT >= 1 / 32) {
        mapT = 0;
        minimap.draw(me, route?.active ? route : null, target);
      }
    },
  };
}


// ---- the turn card: the next turn and how far, while a route is on ----
const GLYPH = { left: '↰', right: '↱', 'slight left': '↖', 'slight right': '↗', u: '↶', back: '↶', straight: '↑', arrive: '⚑' };
const SAY = { left: 'Left', right: 'Right', 'slight left': 'Bear left', 'slight right': 'Bear right', u: 'U-turn' };

function drawTurn(el, next, target) {
  el.classList.toggle('show', !!next);
  if (!next) return;
  const what = next.dir === 'arrive' ? 'Arriving'
    : next.dir === 'back' ? 'Turn around'
      : next.dir === 'straight' ? `Straight on · ${fmtDist(next.dist)}`
        : `${SAY[next.dir]} in ${fmtDist(next.dist)}`;
  const key = `${next.dir}|${what}|${target.tag}|${fmtDist(next.left)}`;
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  el.querySelector('.glyph').textContent = GLYPH[next.dir];
  el.querySelector('.what').textContent = what;
  el.querySelector('.to').textContent = `${target.tag} · ${fmtDist(next.left)}`;
  el.classList.toggle('soon', next.dir === 'back' || (next.dir !== 'straight' && next.dist < 250));
}


// ---- panels: the Places list, and what each place shows when you arrive ----
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function placeRows(guide, skip = null) {
  const t = guide.target;
  return PLACES.filter((p) => p !== skip)
    .map((p) => ({ p, d: guide.distanceTo(p) }))
    .sort((a, b) => a.d - b.d)
    .map(({ p, d }) => `
      <li class="${t === p ? 'on' : ''}">
        <span class="ico">${p.icon}</span>
        <span class="nm"><b>${esc(p.name)}</b><small>${fmtDist(d)} away${t === p ? ' · routed' : ''}</small></span>
        ${t === p ? `<button class="pbtn" type="button" data-clear="1">Clear</button>` : `<button class="pbtn" type="button" data-route="${p.id}">Route</button>`}
        <button class="pbtn go" type="button" data-go="${p.id}">Go</button>
      </li>`).join('');
}

/** The Places list: route to one (minimap + ground ribbon + turn card), or fast travel. */
export function placesPanel(guide) {
  return {
    title: '📍 Places',
    html: `<p class="muted">Route draws the way on the minimap and the street; Go fades you straight there.</p>
      <ul class="plist">${placeRows(guide)}</ul>`,
  };
}

const ARRIVE = {
  home: "Home. The front door is across the lot; walk up to it to go inside.",
  work: 'Work. Parked, badge on, coffee next.',
  gym: "The gym. Here's how this week's training is going:",
  gas: "Gas. Topped off (the RAV4 runs on toy physics, but this is the nearest pump to home).",
  'grocery-east': "Groceries. Here's what's been cooking today:",
  'grocery-west': "Groceries. Here's what's been cooking today:",
  bigbox: 'The big-box store: everything else on the list.',
};
const ARRIVE_PANEL = { gym: 'gym', 'grocery-east': 'meals-today', 'grocery-west': 'meals-today' };

/** What a place shows when you arrive: a line, sometimes the matching apartment panel, then where next. */
export async function arrivalPanel(place, guide, authed) {
  let extra = '';
  if (ARRIVE_PANEL[place.id]) extra = (await renderPanel(ARRIVE_PANEL[place.id], authed)).html;
  return {
    title: `${place.icon} ${place.name}`,
    html: `<p class="arrive">${esc(ARRIVE[place.id])}</p>${extra}
      <h3>Where next?</h3><ul class="plist">${placeRows(guide, place)}</ul>`,
  };
}

/** Wire a panel's Route / Clear / Go buttons to main.js's actions. */
export function bindPlaces(root, { route, clear, go }) {
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-route], button[data-go], button[data-clear]');
    if (!btn) return;
    if (btn.dataset.route) route(btn.dataset.route);
    else if (btn.dataset.go) go(btn.dataset.go);
    else clear();
  });
}
