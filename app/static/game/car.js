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


/** The hero RAV4 as its own group: one body mesh + four wheel meshes (they'll spin and steer). */
export function createRav4() {
  const g = new THREE.Group();
  const body = createBatch();
  drawBody(body, RAV4, RAV4.color);
  g.add(body.build());
  const wheels = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const wb = createBatch();
    drawWheel(wb, RAV4, sx, sz, true);
    const m = wb.build();
    m.position.set(sx * RAV4.track / 2, RAV4.tireR, sz * RAV4.wheelbase / 2);
    g.add(m);
    wheels.push(m);
  }
  // soft contact shadow so it sits on the lot even under the sun's shadow
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(RAV4.w - 0.4, RAV4.len - 0.6), pencil(0x8b8d8f));
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.03;
  pad.receiveShadow = true;
  g.add(pad);
  return { group: g, wheels, spec: RAV4 };
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
