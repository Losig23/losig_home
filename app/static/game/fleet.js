/*
The garage: eight more vehicles parked by the home lot's south building,
each drivable like the RAV4 (walk up to the driver's side, "Get in").

They're toy versions in the apartment's vocabulary (boxes, tapered boxes,
cylinders, one color per part, no logos), each with the one or two things
that make it read at a glance: the Ferrari's red wedge and side intakes, the
BMW's kidney grille, the 911's round lamps and sloping tail, the Jaguar's
long hood, the Rolls-Royce's upright grille and two-tone paint, the
Cybertruck's steel wedge and light bars, the future supercar's canopy, fin
and light strips, and a sport bike with Ani on it.

Every spec carries what the rest of the game needs: size and wheels
(car.js createCar), the driver's eye and the chase camera's distance
(drive.js), and a tune (vehicle.js) for how it goes. Sizes are feet, local
+Z forward, +X the driver's side, y up from the ground.
*/import * as THREE from 'three';
import { taperBox } from './batch.js';
import { prism } from './scenery.js';
import { MPH } from './vehicle.js';
import { limb } from './car.js';
import { OCTANE_SIZE, OCTANE_TUNE } from './octane.js';

const BLACK = 0x1d1b22;
const TRIM = 0x202224;
const GLASS = 0x34404c;
const LAMP = 0xf4f2ec;
const TAIL = 0xc8102e;
const CHROME = 0xd5d8dc;
const STEEL = 0x8a8f94;

/**
 * A toy car body: a lower core between the wheels, a full-width slab from just
 * above the wheel centers to the beltline (so the tires show beneath, like
 * arches), a sloped nose and tail, rocker panels and bumpers down low, and a
 * tapered glasshouse with a roof skin. o: len, w, low (slab bottom), belt,
 * noseLen/noseY (front top), tailLen/tailY, wheelbase, tireR, color, cabin
 * {z0, z1, roof, front, back, side}, glass.
 */
function hull(b, o) {
  const { len, w, low, belt, color } = o;
  const half = len / 2;
  const nose0 = half - o.noseLen, tail0 = -half + o.tailLen;
  // core under it all, inside the tires
  b.box(0, 0.6, 0, w - 1.9, low - 0.6 + 0.05, len - 0.6, TRIM);
  // the slab between nose and tail
  b.box(0, low, (nose0 + tail0) / 2, w, belt - low, nose0 - tail0, color);
  // nose and tail slope down from the beltline
  b.geo(taperBox(w - 0.1, o.noseY - low, o.noseLen, Math.max(0, belt - o.noseY) + 0.25, 0, 0.3), color, 0, low + (o.noseY - low) / 2, nose0 + o.noseLen / 2);
  b.geo(taperBox(w - 0.1, o.tailY - low, o.tailLen, 0, Math.max(0, belt - o.tailY) + 0.2, 0.3), color, 0, low + (o.tailY - low) / 2, tail0 - o.tailLen / 2);
  // rockers between the wheels, bumpers ahead of and behind them (none when the wheels sit at the corners)
  const gap = o.tireR + 0.35, ax = o.wheelbase / 2;
  b.box(0, 0.55, 0, w - 0.15, low - 0.55, 2 * (ax - gap), color);
  if (half - 0.1 - ax - gap > 0) {
    b.box(0, 0.6, (ax + gap + half - 0.1) / 2, w - 0.3, low - 0.6, half - 0.1 - ax - gap, color);
    b.box(0, 0.6, -(ax + gap + half - 0.1) / 2, w - 0.3, low - 0.6, half - 0.1 - ax - gap, color);
  }
  // glasshouse and roof
  const c = o.cabin;
  const gl = c.z1 - c.z0, gh = c.roof - belt;
  b.geo(taperBox(w - 2 * c.side, gh, gl, c.front, c.back, 0.4), o.glass ?? GLASS, 0, belt + gh / 2, (c.z0 + c.z1) / 2);
  const r0 = c.z0 + c.back, r1 = c.z1 - c.front;
  if (r1 - r0 > 0.3) b.box(0, c.roof - 0.02, (r0 + r1) / 2, w - 2 * c.side - 0.8, 0.14, r1 - r0, o.roofColor ?? color);
  // mirrors
  for (const sx of [-1, 1]) b.box(sx * (w / 2 + 0.12), belt + 0.05, c.z1 - 0.6, 0.36, 0.3, 0.45, o.mirror ?? color);
}

// lamps as boxes on the nose and tail faces
function lamps(b, o, front, back) {
  const half = o.len / 2;
  for (const sx of [-1, 1]) {
    if (front) b.box(sx * front.x, front.y, half - (front.inset ?? 0.25), front.w, front.h, 0.35, LAMP, -sx * (front.sweep ?? 0));
    if (back) b.box(sx * back.x, back.y, -half + 0.12, back.w, back.h, 0.3, back.color ?? TAIL);
  }
}

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);


// ---- the cars ----

const FERRARI = {
  len: 14.9, w: 6.4, wheelbase: 8.8, track: 5.4, tireR: 1.15, tireW: 0.95, color: 0xd40d12,
  low: 1.55, belt: 2.7, noseLen: 4.1, noseY: 2.15, tailLen: 2.6, tailY: 2.95,
  cabin: { z0: -3.4, z1: 2.1, roof: 3.95, front: 2.3, back: 2.4, side: 0.85 },
};
function drawFerrari(b) {
  const o = FERRARI, half = o.len / 2;
  hull(b, o);
  // side intakes behind the doors, louvers on the engine cover, a lip spoiler
  for (const sx of [-1, 1]) {
    b.box(sx * (o.w / 2 + 0.02), 1.85, -2.6, 0.12, 0.7, 1.6, BLACK);
    b.box(sx * (o.w / 2 - 0.9), o.belt + 0.02, -4.6, 1.2, 0.08, 0.15, BLACK);
  }
  for (const z of [-4.2, -4.8, -5.4]) b.box(0, o.tailY - 0.02, z, 2.6, 0.06, 0.2, BLACK);
  b.box(0, o.tailY, -half + 0.4, o.w - 0.6, 0.18, 0.5, BLACK);
  lamps(b, o, { x: 2.15, y: 1.95, w: 1.3, h: 0.22, sweep: 0.3, inset: 0.7 }, null);
  for (const sx of [-1, 1]) for (const dx of [1.6, 2.4]) {
    b.geo(new THREE.CylinderGeometry(0.24, 0.24, 0.2, 12).rotateX(Math.PI / 2), TAIL, sx * dx, 2.45, -half + 0.05);
  }
  b.box(0, 0.6, -half + 0.2, 3.4, 0.5, 0.4, BLACK);                      // diffuser
  b.box(0, 1.6, half - 0.12, 2.2, 0.35, 0.25, BLACK);                    // grille
  b.box(0, 2.18, half - 1.8, 0.28, 0.08, 0.36, 0xf2c230);               // the yellow badge
}

const BMW = {
  len: 15.6, w: 6.2, wheelbase: 9.4, track: 5.25, tireR: 1.15, color: 0x1f4fb0,
  low: 1.5, belt: 3.15, noseLen: 3.4, noseY: 3.0, tailLen: 2.6, tailY: 3.2,
  cabin: { z0: -4.6, z1: 2.5, roof: 4.7, front: 2.0, back: 1.7, side: 0.5 },
};
function drawBmw(b) {
  const o = BMW, half = o.len / 2;
  hull(b, o);
  // the kidney grille: two tall black openings in chrome frames
  for (const sx of [-1, 1]) {
    b.box(sx * 0.5, 1.95, half - 0.05, 0.85, 0.95, 0.12, CHROME);
    b.box(sx * 0.5, 2.0, half + 0.02, 0.68, 0.82, 0.08, BLACK);
    // headlights with a white ring
    b.box(sx * 2.0, 2.55, half - 0.35, 1.3, 0.3, 0.45, LAMP, -sx * 0.18);
    b.geo(new THREE.TorusGeometry(0.17, 0.04, 5, 12), 0xffffff, sx * 2.2, 2.55, half - 0.12);
    // L-shaped tails and quad exhausts
    b.box(sx * 2.25, 2.85, -half + 0.12, 1.2, 0.28, 0.25, TAIL);
    for (const dx of [1.55, 1.95]) b.geo(new THREE.CylinderGeometry(0.15, 0.15, 0.3, 10).rotateX(Math.PI / 2), CHROME, sx * dx, 0.95, -half - 0.05);
  }
  b.box(0, o.tailY, -half + 0.25, o.w - 1.2, 0.08, 0.35, o.color);      // trunk lip
}

const FUTURE = {
  len: 16.2, w: 6.9, wheelbase: 9.4, track: 5.85, tireR: 1.2, tireW: 1.0, color: 0xe9eef2, hub: 0x34e7f5,
  low: 1.4, belt: 2.45, noseLen: 4.8, noseY: 1.85, tailLen: 3.1, tailY: 2.8, glass: 0x1b2230,
  cabin: { z0: -3.2, z1: 2.9, roof: 3.65, front: 2.8, back: 2.2, side: 1.05 },
};
const CYAN = 0x34e7f5;
function drawFuture(b) {
  const o = FUTURE, half = o.len / 2;
  hull(b, o);
  b.box(0, 1.55, half - 0.1, o.w - 0.6, 0.12, 0.2, CYAN);               // light strip across the nose
  b.box(0, 2.55, -half + 0.08, o.w - 0.4, 0.14, 0.2, TAIL);             // and a red bar across the tail
  for (const sx of [-1, 1]) {
    b.box(sx * (o.w / 2 + 0.03), 0.95, 0, 0.08, 0.1, o.wheelbase - 3.2, CYAN);   // along the sills
    b.box(sx * 2.0, 3.2, -half + 0.9, 0.18, 0.75, 0.5, BLACK);          // wing posts
  }
  b.box(0, 3.55, -half + 0.9, o.w - 0.6, 0.1, 1.2, BLACK);              // the wing
  b.box(0, o.belt, -3.6, 0.12, 0.85, 3.8, o.color);                      // the shark fin down the back
  b.box(0, 0.65, -half + 0.3, o.w - 1.4, 0.55, 0.5, BLACK);             // diffuser
}

const JAGUAR = {
  len: 14.9, w: 6.3, wheelbase: 8.65, track: 5.3, tireR: 1.15, color: 0x174d34,
  low: 1.5, belt: 2.85, noseLen: 4.6, noseY: 2.6, tailLen: 2.2, tailY: 2.95,
  cabin: { z0: -4.3, z1: 0.7, roof: 4.25, front: 1.9, back: 2.5, side: 0.65 },
};
function drawJaguar(b) {
  const o = JAGUAR, half = o.len / 2;
  hull(b, o);
  // a wide oval-ish grille in a chrome surround, slim lamps, a chrome window line
  b.box(0, 1.55, half - 0.08, 2.6, 0.75, 0.12, CHROME);
  b.box(0, 1.58, half - 0.02, 2.35, 0.6, 0.1, BLACK);
  lamps(b, o, { x: 2.1, y: 2.3, w: 1.3, h: 0.26, sweep: 0.35, inset: 0.55 }, { x: 2.3, y: 2.7, w: 1.4, h: 0.16 });
  for (const sx of [-1, 1]) b.box(sx * (o.w / 2 - 0.62), o.belt - 0.02, -1.8, 0.06, 0.06, 4.8, CHROME);
  for (const dx of [-0.3, 0.3]) b.geo(new THREE.CylinderGeometry(0.14, 0.14, 0.3, 10).rotateX(Math.PI / 2), CHROME, dx, 0.9, -half - 0.05);
}

const ROLLS = {
  len: 19.1, w: 6.6, wheelbase: 11.9, track: 5.6, tireR: 1.3, color: 0xc8cbd0, roofColor: 0x1a1b22, mirror: 0x1a1b22,
  low: 1.7, belt: 3.55, noseLen: 3.4, noseY: 3.5, tailLen: 2.4, tailY: 3.4,
  cabin: { z0: -6.2, z1: 1.4, roof: 5.35, front: 1.4, back: 1.0, side: 0.45 },
};
function drawRolls(b) {
  const o = ROLLS, half = o.len / 2;
  hull(b, o);
  // two-tone: the long hood and the upper body in black over the silver
  b.box(0, o.belt - 0.02, (half - o.noseLen + 1.4) / 2, o.w - 0.25, 0.12, half - o.noseLen - 1.4, 0x1a1b22);
  b.geo(taperBox(o.w - 0.35, 0.12, o.noseLen, 0.05, 0, 0.3), 0x1a1b22, 0, o.noseY + 0.04, half - o.noseLen / 2);
  // the upright grille with its vertical bars, the figure on top
  b.box(0, 1.85, half - 0.05, 1.7, 1.45, 0.3, CHROME);
  for (let x = -0.65; x <= 0.66; x += 0.26) b.box(x, 1.95, half + 0.11, 0.07, 1.2, 0.04, STEEL);
  b.box(0, 3.3, half - 0.25, 0.12, 0.3, 0.2, CHROME);
  lamps(b, o, { x: 2.35, y: 2.85, w: 1.0, h: 0.3, inset: 0.2 }, { x: 2.7, y: 2.8, w: 0.5, h: 0.75 });
  b.box(0, 1.0, half - 0.02, o.w - 0.6, 0.2, 0.2, CHROME);
  b.box(0, 1.0, -half + 0.02, o.w - 0.6, 0.2, 0.2, CHROME);
  for (const sx of [-1, 1]) b.box(sx * (o.w / 2 + 0.02), 2.2, -0.5, 0.05, 0.08, o.len - 6.5, CHROME);
}

const PORSCHE = {
  len: 14.9, w: 6.2, wheelbase: 8.0, track: 5.25, tireR: 1.12, tireW: 0.9, color: 0xf2c12e,
  low: 1.45, belt: 2.8, noseLen: 3.6, noseY: 2.35, tailLen: 3.5, tailY: 2.75,
  cabin: { z0: -5.0, z1: 0.9, roof: 4.2, front: 1.9, back: 3.6, side: 0.7 },
};
function drawPorsche(b) {
  const o = PORSCHE, half = o.len / 2;
  hull(b, o);
  for (const sx of [-1, 1]) {
    // round lamps up on the front fenders
    b.geo(new THREE.CylinderGeometry(0.38, 0.42, 0.5, 14).rotateX(Math.PI / 2), o.color, sx * 2.05, 2.35, half - 1.15);
    b.geo(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 14).rotateX(Math.PI / 2), LAMP, sx * 2.05, 2.35, half - 0.88);
    // wide rear haunches
    b.box(sx * (o.w / 2 - 0.1), o.low, -o.wheelbase / 2, 0.45, o.belt - o.low - 0.1, 3.4, o.color);
  }
  b.box(0, 2.5, -half + 0.1, o.w - 0.5, 0.14, 0.25, TAIL);              // full-width light bar
  b.box(0, o.tailY + 0.02, -half + 0.6, o.w - 1.0, 0.2, 0.9, o.color);  // ducktail
  b.box(0, 1.4, half - 0.08, 2.4, 0.3, 0.2, BLACK);
  for (const dx of [-0.25, 0.25]) b.geo(new THREE.CylinderGeometry(0.13, 0.13, 0.3, 10).rotateX(Math.PI / 2), CHROME, dx, 0.85, -half - 0.05);
}

const CYBER = {
  len: 18.6, w: 6.65, wheelbase: 12.3, track: 5.7, tireR: 1.45, tireW: 1.0, color: 0xbcc0c4,
  belt: 3.35,
};
function drawCyber(b) {
  const o = CYBER, half = o.len / 2, w = o.w;
  // the lower slab, the black arches around the wheels
  b.box(0, 1.25, 0, w, o.belt - 1.25, o.len - 0.4, o.color);
  b.box(0, 0.6, 0, w - 2.0, 0.7, o.len - 1.0, TRIM);
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
    b.box(sx * (w / 2 + 0.05), 1.25, sz * o.wheelbase / 2, 0.14, 1.6, 3.9, TRIM);
  }
  // the wedge: from the nose up to a peak over the front seats, down to the end of the bed
  const profile = [[-half, 0], [half, 0], [half, 0.3], [0.8, 2.9], [-half, 1.25]];
  const wedge = prism(profile.map(([z, y]) => [-z, y]), w - 0.15);
  wedge.translate(0, 0, -(w - 0.15) / 2);
  wedge.rotateY(Math.PI / 2);
  b.geo(wedge, o.color, 0, o.belt, 0);
  // dark glass: the windshield on the front slope, side windows under the roof line,
  // one-sided panels facing out so they're clear from the driver's seat
  const rise = 2.9 - 0.3, run = half - 0.8, slope = Math.atan2(rise, run);
  b.geo(new THREE.PlaneGeometry(w - 0.9, Math.hypot(run, rise) * 0.55).rotateX(-Math.PI / 2), GLASS,
    0, o.belt + 0.3 + rise * 0.55 + 0.03, half - run * 0.55, 0, slope);
  const pane = [[-3.6, 0.35], [3.4, 0.35], [1.0, 2.55], [-3.2, 1.95]];
  for (const sx of [-1, 1]) {
    const shape = new THREE.Shape(pane.map(([z, y]) => new THREE.Vector2(sx > 0 ? -z : z, y)));
    b.geo(new THREE.ShapeGeometry(shape).rotateY(sx * Math.PI / 2), GLASS, sx * ((w - 0.15) / 2 + 0.03), o.belt, 0);
  }
  // light bars, front and back
  b.box(0, o.belt + 0.28, half - 0.15, w - 0.4, 0.1, 0.2, LAMP);
  b.box(0, o.belt + 1.1, -half + 0.05, w - 0.4, 0.1, 0.12, TAIL);
}

// the sport bike: frame, tank, fairing, seat and tail, forks and swingarm
const BIKE = { len: 6.9, w: 2.3, wheelbase: 4.6, tireR: 1.0, tireW: 0.55, color: 0x2049a8 };
function drawBike(b) {
  const o = BIKE;
  b.box(0, 0.95, 0.05, 1.05, 1.25, 1.9, 0x4a4d52);                       // engine
  b.geo(taperBox(1.3, 0.85, 1.8, 0.3, 0.2, 0.15), o.color, 0, 2.6, 0.55); // tank
  b.box(0, 2.72, -0.95, 0.95, 0.24, 1.55, BLACK);                        // seat
  b.geo(taperBox(0.95, 0.55, 1.5, 0, 0.6, 0.12), o.color, 0, 3.05, -2.05); // tail
  b.box(0, 3.0, -2.75, 0.4, 0.12, 0.1, TAIL);
  b.geo(taperBox(1.45, 1.35, 1.5, 0.7, 0, 0.25), o.color, 0, 2.85, 1.95);  // fairing
  b.geo(taperBox(1.05, 0.5, 0.7, 0.45, 0, 0.2), GLASS, 0, 3.75, 2.0);     // screen
  b.box(0, 2.55, 2.68, 0.55, 0.3, 0.12, LAMP);                           // headlight
  b.box(0, 1.25, 1.5, 0.9, 0.12, 0.6, 0xffffff);                         // white stripe on the belly pan
  for (const sx of [-1, 1]) {
    // forks raked back from the front axle, the swingarm to the rear axle
    b.geo(new THREE.BoxGeometry(0.14, 2.35, 0.14), STEEL, sx * 0.32, 2.05, 2.05, 0, -0.42);
    b.geo(new THREE.BoxGeometry(0.12, 0.2, 2.4), BLACK, sx * 0.3, 1.1, -1.25, 0, 0.12);
    b.box(sx * 0.55, 1.15, -0.4, 0.35, 0.08, 0.25, STEEL);               // foot pegs
  }
  b.geo(new THREE.CylinderGeometry(0.17, 0.2, 1.4, 10).rotateX(Math.PI / 2 - 0.25), CHROME, -0.45, 1.6, -2.0); // exhaust
  b.box(0, 3.35, 1.55, 1.9, 0.1, 0.12, BLACK);                           // bars
}

// Ani on the bike: jersey, jeans, a dark helmet, tucked over the tank
const KIT = 0xc8102e, SKIN = 0xb47c5c, JEANS = 0x232226;
function drawRider(b) {
  const hip = v3(0, 3.05, -0.85), chest = v3(0, 4.25, 0.35);
  limb(b, hip, chest, 0.42, KIT);
  b.blob(0, 4.7, 0.75, 0.46, 0x26232b, 1.05);                            // helmet
  b.box(0, 4.6, 1.12, 0.62, 0.22, 0.12, 0x3d4a5a);                       // visor
  for (const sx of [-1, 1]) {
    const shoulder = v3(sx * 0.48, 4.25, 0.3), grip = v3(sx * 0.9, 3.42, 1.55), elbow = v3(sx * 0.75, 3.75, 0.85);
    limb(b, shoulder, elbow, 0.15, KIT);
    limb(b, elbow, grip, 0.12, SKIN);
    const knee = v3(sx * 0.62, 2.95, 0.45), peg = v3(sx * 0.55, 1.35, -0.35);
    limb(b, v3(sx * 0.3, 3.0, -0.75), knee, 0.2, JEANS);
    limb(b, knee, peg, 0.16, JEANS);
    b.box(sx * 0.55, 1.15, -0.25, 0.3, 0.25, 0.6, 0xf2f0ea);              // sneakers
  }
}


// ---- the Octane: a stand-in in its proportions (no Octane model to draw from) ----

// The toy hull's trim is sized for full-size cars, so the Octane is drawn
// DRAW times over and shrunk to its hitbox's size, centered between its axles.
const DRAW = 2.3;
const ft = OCTANE_SIZE.ft, d = (uu) => ft(uu) * DRAW;
const OCT = {
  len: d(118), w: d(84.2), wheelbase: d(85), tireR: d(15), color: 0x2a6fdb,
  low: d(24), belt: d(37), noseLen: d(30), noseY: d(31), tailLen: d(14), tailY: d(39),
  cabin: { z0: d(-38), z1: d(12), roof: d(57), front: d(19), back: d(10), side: d(8) },
};
function shrink(b, k, dz) {
  return {
    box: (x, y, z, w, h, dd, color, ry) => b.box(x * k, y * k, (z + dz) * k, w * k, h * k, dd * k, color, ry),
    geo: (g, color, x = 0, y = 0, z = 0, ...turn) => b.geo(g.scale(k, k, k), color, x * k, y * k, (z + dz) * k, ...turn),
  };
}
function drawOctane(b0) {
  const b = shrink(b0, 1 / DRAW, OCTANE_SIZE.mid * DRAW), o = OCT, half = o.len / 2;
  hull(b, o);
  // big rear haunches over the fat back tires, a ducktail spoiler, the black nose
  for (const sx of [-1, 1]) {
    b.box(sx * (o.w / 2 - 0.25), o.low, -o.wheelbase / 2, 0.55, o.belt - o.low + 0.15, d(36), o.color);
    b.geo(new THREE.CylinderGeometry(0.42, 0.42, 0.18, 14).rotateX(Math.PI / 2), LAMP, sx * 1.9, d(30), half - 0.05);
    b.box(sx * 2.1, d(33), -half + 0.05, 1.1, 0.35, 0.15, TAIL);
  }
  b.box(0, o.tailY, -half + 0.45, o.w - 0.5, 0.3, 0.9, BLACK);
  b.box(0, o.tailY + 0.3, -half + 0.2, o.w - 0.2, 0.12, 0.6, o.color);
  b.box(0, d(14), half - 0.15, o.w - 0.9, d(12), 0.3, BLACK);
}

/**
 * The Octane (octane.js): drawn in its proportions, sized and wheeled like
 * Rocket League's, driven by its own numbers. Not in FLEET: it only parks
 * in the lot while a controller is connected (outside.js setOctane).
 */
export const OCTANE_SPEC = {
  id: 'octane', name: 'Octane', kind: 'car', draw: drawOctane, color: OCT.color,
  len: OCTANE_SIZE.len, w: OCTANE_SIZE.w, wheelbase: OCTANE_SIZE.wheelbase, tireR: ft(15), tireW: ft(13),
  wheels: OCTANE_SIZE.wheels,
  rest: OCTANE_SIZE.rest,               // the center of mass's height, which it tumbles about in the air
  cockpit: false,                       // no seat view: Rocket League's car cam only (and the high one)
  modes: ['chase', 'high'],
  // a usual Rocket League camera: 270 uu back, 100 up, tipped down 3°, 110° wide
  cam: { dist: ft(270), lift: ft(100), angle: -3 * Math.PI / 180, hfov: 110, min: 2.5 },
  tune: OCTANE_TUNE,
};


// ---- the specs: model, size, seat, camera, handling ----

const mph = (v) => v * MPH;

export const FLEET = [
  { ...FERRARI, id: 'ferrari', name: 'Ferrari', draw: drawFerrari, kind: 'car',
    beltY: 2.7, roofY: 3.95, glassZ: [-3.4, 2.1], glassFront: 2.3, eye: v3(1.2, 3.55, -0.7),
    tune: { top: mph(211), boostTop: mph(240), accel: 30, aLat: 70, grip: 95, brake: 55, wheelbase: 8.8 } },
  { ...BMW, id: 'bmw', name: 'BMW', draw: drawBmw, kind: 'car',
    beltY: 3.15, roofY: 4.7, glassZ: [-4.6, 2.5], glassFront: 2.0, eye: v3(1.25, 4.05, -0.9),
    tune: { top: mph(180), boostTop: mph(210), accel: 23, aLat: 60, grip: 80, brake: 50, wheelbase: 9.4 } },
  { ...FUTURE, id: 'future', name: 'Future supercar', draw: drawFuture, kind: 'car',
    beltY: 2.45, roofY: 3.65, glassZ: [-3.2, 2.9], glassFront: 2.8, eye: v3(1.25, 3.3, -0.4),
    cam: { dist: 23, lift: 7 },
    tune: { top: mph(260), boostTop: mph(300), accel: 44, aLat: 85, grip: 110, brake: 65, wheelbase: 9.4,
      circles: [-5, 0, 5], radius: 3.3 } },
  { ...BIKE, id: 'bike', name: 'Bike', verb: 'Get on', draw: drawBike, rider: drawRider, kind: 'bike',
    eye: v3(0, 4.95, 0.5), cam: { dist: 15, lift: 6 },
    tune: { top: mph(186), boostTop: mph(205), accel: 32, aLat: 75, aLatDrift: 95, grip: 85, gripDrift: 30,
      brake: 50, wheelbase: 4.6, steerMax: 0.7, reverse: 4, reverseTop: 6, circles: [-1.7, 1.7], radius: 1.25, inertia: 6 } },
  { ...JAGUAR, id: 'jaguar', name: 'Jaguar', draw: drawJaguar, kind: 'car',
    beltY: 2.85, roofY: 4.25, glassZ: [-4.3, 0.7], glassFront: 1.9, eye: v3(1.2, 3.7, -1.6),
    tune: { top: mph(186), boostTop: mph(215), accel: 25, aLat: 64, grip: 82, brake: 52, wheelbase: 8.65 } },
  { ...ROLLS, id: 'rolls', name: 'Rolls-Royce', draw: drawRolls, kind: 'car',
    beltY: 3.55, roofY: 5.35, glassZ: [-6.2, 1.4], glassFront: 1.4, eye: v3(1.35, 4.6, -1.6),
    cam: { dist: 26, lift: 8.5 },
    tune: { top: mph(155), boostTop: mph(180), accel: 17, aLat: 46, grip: 62, brake: 38, wheelbase: 11.9,
      circles: [-6.2, 0, 6.2], radius: 3.3, inertia: 34 } },
  { ...PORSCHE, id: '911', name: 'Porsche 911', draw: drawPorsche, kind: 'car',
    beltY: 2.8, roofY: 4.2, glassZ: [-5.0, 0.9], glassFront: 1.9, eye: v3(1.2, 3.65, -0.6),
    tune: { top: mph(190), boostTop: mph(220), accel: 29, aLat: 70, grip: 92, brake: 56, wheelbase: 8.0 } },
  { ...CYBER, id: 'cyber', name: 'Cybertruck', draw: drawCyber, kind: 'car',
    beltY: 3.35, roofY: 6.25, glassZ: [-3.0, 5.4], glassFront: 3.6, eye: v3(1.35, 5.05, -0.4),
    cam: { dist: 26, lift: 9 },
    tune: { top: mph(130), boostTop: mph(160), accel: 34, aLat: 50, grip: 70, brake: 45, wheelbase: 12.3,
      circles: [-6, 0, 6], radius: 3.35, inertia: 36 } },
];
