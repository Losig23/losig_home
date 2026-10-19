/*
Cars, in the apartment's furniture vocabulary: boxes for the body panels,
a tapered box for the glass, cylinders for wheels, thin boxes for lights.

The hero is the RAV4: a 4th-gen (2013-2018) in silver: rounded nose with
swept headlights, sloped rear hatch glass, black arch trim and rocker
cladding. Real dimensions in feet: 15.1 long, 6.05 wide, 5.5 tall, 8.7 ft
wheelbase, 28.5" tires. Parked cars around the lot reuse the same builder
with sedan/hatch proportions and are merged into the static scenery.

Local axes: +Z is forward (like the player), so the driver's side (US,
left) is +X. Wheel openings are left as gaps between the side panels so
the tires show; the body core sits between the tires.
*/import * as THREE from 'three';
import { createBatch, taperBox } from './batch.js';
import { pencil } from './pencil.js';

const TRIM = 0x202224;    // black plastic, the apartment's near-black
const GLASS = 0x34404c;
const LAMP = 0xf4f2ec;
const TAIL = 0xc8102e;
const TIRE = 0x202224;
const HUB = 0xc7cacc;

export const RAV4 = {
  color: 0xbfc4ca, // Classic Silver Metallic
  len: 15.1, w: 6.05, wheelbase: 8.7, track: 5.15, tireR: 1.19,
  beltY: 3.3, roofY: 5.35, noseLen: 3.6, hood: 3.45,
  glassFront: 2.3, glassBack: 1.0, glassZ: [-6.7, 2.6],
  kind: 'suv',
};

export const PARKED = {
  sedan: {
    len: 15.4, w: 6.0, wheelbase: 9.1, track: 5.1, tireR: 1.08,
    beltY: 3.0, roofY: 4.75, noseLen: 3.9, hood: 3.2,
    glassFront: 2.5, glassBack: 2.1, glassZ: [-4.9, 2.4], kind: 'sedan',
  },
  hatch: {
    len: 14.2, w: 5.8, wheelbase: 8.6, track: 5.0, tireR: 1.05,
    beltY: 3.05, roofY: 4.9, noseLen: 3.3, hood: 3.25,
    glassFront: 2.3, glassBack: 0.8, glassZ: [-6.0, 2.2], kind: 'hatch',
  },
  // a bigger, squarer three-row SUV so nothing else reads as the RAV4
  suv: {
    len: 16.6, w: 6.6, wheelbase: 9.9, track: 5.6, tireR: 1.25,
    beltY: 3.6, roofY: 5.85, noseLen: 3.9, hood: 3.75,
    glassFront: 1.9, glassBack: 0.35, glassZ: [-7.6, 2.9], kind: 'suv',
  },
};


/** Draw a car body (no wheels) into a batch, in the batch's current frame. */
export function drawBody(b, spec, color) {
  const { len, w, wheelbase, tireR, beltY, roofY, noseLen, hood } = spec;
  const half = len / 2, ax = wheelbase / 2;
  const floor = 0.95;                       // bottom of the body panels
  const open = tireR + 0.35;                // half-width of a wheel opening
  const archTop = tireR * 2 + 0.22;
  const sideX = w / 2 - 0.2;

  // core between the wheels (tires sit outside it), stopping where the nose starts
  const coreZ0 = -half + 0.15, coreZ1 = half - noseLen;
  b.box(0, floor, (coreZ0 + coreZ1) / 2, w - 1.7, beltY - floor, coreZ1 - coreZ0, color);
  // side panels around the wheel openings: front fender, doors, rear quarter
  for (const sx of [-1, 1]) {
    const x = sx * sideX;
    const seg = (z1, z2, y1 = floor) => b.box(x, y1, (z1 + z2) / 2, 0.4, beltY - y1, z2 - z1, color);
    seg(ax + open, half - 0.65);
    seg(-ax + open, ax - open);
    seg(-half + 0.15, -ax - open);
    seg(ax - open, ax + open, archTop);     // over the front wheel
    seg(-ax - open, -ax + open, archTop);   // over the rear wheel
    // black rocker cladding between the arches
    b.box(x + sx * 0.03, floor - 0.05, 0, 0.42, 0.55, 2 * (ax - open), TRIM);
    // arch trim: half-rings hugging each opening
    for (const az of [ax, -ax]) {
      const arch = new THREE.TorusGeometry(open - 0.05, 0.16, 5, 12, Math.PI);
      arch.rotateY(Math.PI / 2);
      b.geo(arch, TRIM, x + sx * 0.05, tireR, az);
    }
    // side mirror on a stalk
    b.box(sx * (w / 2 + 0.15), beltY + 0.15, half - noseLen - 0.9, 0.42, 0.36, 0.55, color);
  }

  // nose: hood slopes down to a rounded-off front
  const nose = taperBox(w - 0.3, hood - floor, noseLen, 0.7, 0, 0.35);
  b.geo(nose, color, 0, floor + (hood - floor) / 2, half - noseLen / 2);
  // tail: a short deck/hatch base
  b.box(0, floor, -half + 0.6, w - 0.3, beltY - floor, 1.2, color);

  // glasshouse + roof skin + rails
  const [g0, g1] = spec.glassZ;
  const gl = g1 - g0, gh = roofY - beltY;
  b.geo(taperBox(w - 0.5, gh, gl, spec.glassFront, spec.glassBack, 0.45),
    GLASS, 0, beltY + gh / 2, (g0 + g1) / 2);
  const r0 = g0 + spec.glassBack, r1 = g1 - spec.glassFront;
  b.box(0, roofY - 0.02, (r0 + r1) / 2, w - 1.5, 0.16, r1 - r0, color);
  if (spec.kind === 'suv') {
    for (const sx of [-1, 1]) b.box(sx * (w / 2 - 0.95), roofY + 0.14, (r0 + r1) / 2, 0.14, 0.14, r1 - r0 - 0.4, TRIM);
  }

  // front: swept headlights, upper + lower grille, emblem
  for (const sx of [-1, 1]) {
    b.box(sx * (w / 2 - 0.85), hood - 0.55, half - 0.55, 1.35, 0.32, 0.6, LAMP, -sx * 0.25);
    b.box(sx * (w / 2 - 0.55), beltY - 0.15, -half + 0.1, 1.15, 0.42, 0.3, TAIL);   // taillights
  }
  b.box(0, hood - 0.62, half - 0.2, 2.3, 0.28, 0.25, TRIM);
  b.box(0, floor + 0.15, half - 0.05, w - 1.4, 0.6, 0.3, TRIM);
  b.box(0, hood - 0.6, half - 0.1, 0.36, 0.22, 0.12, HUB);                          // emblem
  b.box(0, floor - 0.05, -half + 0.05, w - 0.8, 0.55, 0.3, TRIM);                  // rear bumper trim
  b.box(0, floor + 0.85, -half - 0.03, 1.2, 0.55, 0.1, 0xf5f2ea);                  // plate
}

/** Four wheels (tire + hub) as a batch, positioned for the spec. */
export function drawWheels(b, spec) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) drawWheel(b, spec, sx, sz);
}

function drawWheel(b, spec, sx, sz, local = false) {
  const x = local ? 0 : sx * (spec.track / 2);
  const z = local ? 0 : sz * (spec.wheelbase / 2);
  const y = local ? 0 : spec.tireR;
  const tire = new THREE.CylinderGeometry(spec.tireR, spec.tireR, 0.78, 16);
  tire.rotateZ(Math.PI / 2);
  b.geo(tire, TIRE, x, y, z);
  const hub = new THREE.CylinderGeometry(spec.tireR * 0.6, spec.tireR * 0.6, 0.8, 10);
  hub.rotateZ(Math.PI / 2);
  b.geo(hub, HUB, x + sx * 0.01, y, z);
}


/**
 * The hero RAV4 as its own group: a chassis (body, and the cockpit when you're
 * in it) that leans in turns, plus four wheel meshes that spin and steer.
 */
export function createRav4() {
  const g = new THREE.Group();
  const chassis = new THREE.Group();
  g.add(chassis);
  const body = createBatch();
  drawBody(body, RAV4, RAV4.color);
  chassis.add(body.build());
  const wheels = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const wb = createBatch();
    drawWheel(wb, RAV4, sx, sz, true);
    const m = wb.build();
    m.position.set(sx * RAV4.track / 2, RAV4.tireR, sz * RAV4.wheelbase / 2);
    m.rotation.order = 'YXZ'; // roll about the axle, then steer
    m.userData.front = sz > 0;
    g.add(m);
    wheels.push(m);
  }
  // soft contact shadow so it sits on the lot even under the sun's shadow
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(RAV4.w - 0.4, RAV4.len - 0.6), pencil(0x8b8d8f));
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.03;
  pad.receiveShadow = true;
  g.add(pad);
  const cockpit = createCockpit();
  cockpit.group.visible = false;
  chassis.add(cockpit.group);
  return { group: g, chassis, wheels, cockpit, spec: RAV4 };
}


// ---- cockpit: what you see from the driver's seat ----

const DASH = 0x5a5560;      // warm gray plastic
const DASH_LO = 0x45414b;
const HEADLINER = 0xd9d3c7;
const DOOR_IN = 0x4a4650;
const SKIN = 0xb47c5c;      // Ani's hands on the wheel
const KIT = 0xc8102e;       // gauge needles in the jersey red

/** Driver's eye in car-local feet (left seat: +X is the driver's side). */
export const EYE = new THREE.Vector3(1.25, 4.5, -0.9);

/**
 * A simple toon interior: dash with a gauge binnacle and screen, A-pillars,
 * header and headliner, door tops, rear-view mirror, and a steering wheel
 * (with Ani's hands at ten and two) that turns with the steering.
 */
export function createCockpit() {
  const group = new THREE.Group();
  const b = createBatch();
  const { w, beltY, roofY } = RAV4;
  const [, g1] = RAV4.glassZ;
  const zTop = g1 - RAV4.glassFront;            // where the windshield meets the roof

  // dash: a lower block, a rounded-off top pad, the binnacle over the gauges
  b.box(0, 2.15, 2.15, w - 0.7, 1.0, 1.1, DASH_LO);
  b.geo(taperBox(w - 0.7, 0.4, 1.25, 0.15, 0.25, 0.05), DASH, 0, 3.15 + 0.2, 2.05);
  b.box(EYE.x, 3.3, 1.55, 1.4, 0.3, 0.7, DASH);
  b.box(EYE.x, 3.6, 1.6, 1.5, 0.05, 0.85, DASH_LO);                 // binnacle hood
  for (const dx of [-0.3, 0.3]) {
    const dial = new THREE.CylinderGeometry(0.17, 0.17, 0.05, 16);
    dial.rotateX(Math.PI / 2 - 0.25);
    b.geo(dial, 0xfffdf6, EYE.x + dx, 3.45, 1.19);
    b.geo(new THREE.BoxGeometry(0.03, 0.12, 0.03), KIT, EYE.x + dx, 3.47, 1.16, 0, -0.25, 0.7);
  }
  // center screen and console
  b.geo(new THREE.BoxGeometry(0.95, 0.5, 0.08), 0x1d1b22, 0, 3.4, 1.62, 0, -0.35);
  b.box(0, 1.2, 0.4, 0.85, 1.6, 2.6, DASH_LO);
  // A-pillars: windshield base corners up to the roof
  for (const sx of [-1, 1]) {
    const x0 = sx * (w / 2 - 0.35), x1 = sx * (w / 2 - 0.75);
    const dy = roofY - beltY, dz = zTop - g1, dx = x1 - x0;
    const len = Math.hypot(dx, dy, dz);
    b.geo(new THREE.BoxGeometry(0.24, len, 0.3), DASH, (x0 + x1) / 2, (beltY + roofY) / 2, (g1 + zTop) / 2,
      0, Math.atan2(dz, dy), -Math.atan2(dx, dy));
    // door tops and window sills running back from the pillars
    b.box(sx * (w / 2 - 0.3), 2.2, -1.2, 0.35, 1.2, 5.2, DOOR_IN);
    b.box(sx * (w / 2 - 0.42), 3.38, -1.2, 0.42, 0.12, 5.2, DASH);
  }
  // header above the windshield, headliner, rear-view mirror
  b.box(0, roofY - 0.28, zTop - 0.05, w - 1.4, 0.2, 0.45, DASH);
  b.box(0, roofY - 0.2, -2.9, w - 1.2, 0.1, 6.5, HEADLINER);
  b.box(0, roofY - 0.42, zTop + 0.32, 0.07, 0.16, 0.07, DASH_LO);
  b.geo(new THREE.BoxGeometry(0.7, 0.2, 0.1), DASH_LO, 0, roofY - 0.52, zTop + 0.3, 0, 0.12);
  b.geo(new THREE.BoxGeometry(0.62, 0.14, 0.03), 0xbcd3e0, 0, roofY - 0.52, zTop + 0.245, 0, 0.12);
  const shell = b.build({ castShadow: false });

  // steering wheel on its column, tipped back toward the driver
  const mount = new THREE.Group();
  mount.position.set(EYE.x, 3.25, 1.05);
  mount.rotation.x = 0.42;
  const wheel = new THREE.Group();
  mount.add(wheel);
  const wb = createBatch();
  wb.geo(new THREE.TorusGeometry(0.6, 0.085, 6, 24), 0x26232b);
  wb.geo(new THREE.CylinderGeometry(0.2, 0.2, 0.14, 12), DASH, 0, 0, 0.02, 0, Math.PI / 2);
  for (const a of [Math.PI / 2, -Math.PI / 2, Math.PI]) {
    // spokes at three, nine and six o'clock
    wb.geo(new THREE.BoxGeometry(0.5, 0.09, 0.05), DASH, Math.cos(a) * 0.36, Math.sin(a) * 0.36, 0.02, 0, 0, a);
  }
  wb.geo(new THREE.CylinderGeometry(0.09, 0.11, 1.1, 8), DASH_LO, 0, 0, 0.58, 0, Math.PI / 2); // column
  for (const sx of [-1, 1]) {
    // hands at ten and two, forearms running back toward the seat and out of view
    const hand = new THREE.Vector3(sx * 0.52, 0.3, -0.06);
    const elbow = new THREE.Vector3(sx * 0.85, -0.75, -0.75);
    const blob = new THREE.SphereGeometry(1, 10, 8);
    blob.scale(0.12, 0.14, 0.1);
    wb.geo(blob, SKIN, hand.x, hand.y, hand.z);
    const dir = elbow.clone().sub(hand);
    const arm = new THREE.CapsuleGeometry(0.095, dir.length(), 3, 8);
    arm.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()));
    const mid = hand.clone().add(elbow).multiplyScalar(0.5);
    wb.geo(arm, SKIN, mid.x, mid.y, mid.z);
  }
  wheel.add(wb.build({ castShadow: false }));
  group.add(shell, mount);
  return { group, wheel };
}

/** A parked car merged into static scenery. heading: radians, 0 = facing +Z. */
export function drawParkedCar(b, kind, color, x, z, heading) {
  const spec = PARKED[kind];
  b.frame(x, z, heading);
  drawBody(b, spec, color);
  drawWheels(b, spec);
  b.endFrame();
  return spec;
}
