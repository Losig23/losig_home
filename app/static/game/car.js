/*
Cars, in the apartment's furniture vocabulary: boxes for the body panels,
a tapered box for the glass, cylinders for wheels, thin boxes for lights.

The hero is the RAV4: a 4th-gen (2013-2018) in silver: rounded nose with
swept headlights, sloped rear hatch glass, black arch trim and rocker
cladding. Real dimensions in feet: 15.1 long, 6.05 wide, 5.5 tall, 8.7 ft
wheelbase, 28.5" tires.

createCar() turns any vehicle spec (the RAV4 here, the garage in fleet.js)
into a drivable group: a leaning chassis with its cockpit, spinning wheels,
and a merged one-mesh version for while it's parked.

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

/** One wheel (tire, hub) with its axle along x, centered at (x, y, z). */
export function drawWheelAt(b, r, width, x, y, z, hub = HUB) {
  const tire = new THREE.CylinderGeometry(r, r, width, 16);
  tire.rotateZ(Math.PI / 2);
  b.geo(tire, TIRE, x, y, z);
  const cap = new THREE.CylinderGeometry(r * 0.6, r * 0.6, width + 0.02, 10);
  cap.rotateZ(Math.PI / 2);
  b.geo(cap, hub, x, y, z);
}

// where a vehicle's wheels sit: four for a car, two in line for the bike, or the spec's own
// (the Octane's: smaller in front, not centered on its middle)
function wheelSpots(spec) {
  if (spec.wheels) return spec.wheels;
  if (spec.kind === 'bike') return [{ x: 0, z: spec.wheelbase / 2, front: true }, { x: 0, z: -spec.wheelbase / 2, front: false }];
  const out = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push({ x: sx * spec.track / 2, z: sz * spec.wheelbase / 2, front: sz > 0 });
  return out;
}

const PAD = 0x8b8d8f;   // soft contact shadow under a vehicle

/**
 * Any vehicle (a spec with draw(batch), see fleet.js) as one group, in two
 * versions. Driven: a chassis (body, cockpit, the bike's rider) that leans,
 * and wheels that spin and steer. Parked: all of it merged into one mesh, so
 * a lot full of cars costs one draw call each.
 */
export function createCar(spec) {
  const g = new THREE.Group();
  const chassis = new THREE.Group();
  g.add(chassis);
  const body = createBatch();
  spec.draw(body);
  chassis.add(body.build());
  let rider = null;
  if (spec.rider) {
    const rb = createBatch();
    spec.rider(rb);
    rider = rb.build();
    chassis.add(rider);
  }
  const width = spec.tireW ?? 0.78;
  // the bike's wheels lean with it, so they ride on the chassis
  const wheelParent = spec.kind === 'bike' ? chassis : g;
  const wheels = wheelSpots(spec).map(({ x, z, front, r = spec.tireR }) => {
    const wb = createBatch();
    drawWheelAt(wb, r, width, 0, 0, 0, spec.hub);
    const m = wb.build();
    m.position.set(x, r, z);
    m.rotation.order = 'YXZ'; // roll about the axle, then steer
    m.userData.front = front;
    wheelParent.add(m);
    return m;
  });
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(spec.w - 0.4, spec.len - 0.6), pencil(PAD));
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.03;
  pad.receiveShadow = true;
  g.add(pad);
  const cockpit = spec.cockpit === false ? { group: new THREE.Group(), steer() {} }
    : spec.kind === 'bike' ? createBikeCockpit(spec) : createCockpit(spec);
  cockpit.group.visible = false;
  chassis.add(cockpit.group);

  const pb = createBatch();
  spec.draw(pb);
  for (const w of wheelSpots(spec)) drawWheelAt(pb, w.r ?? spec.tireR, width, w.x, w.r ?? spec.tireR, w.z, spec.hub);
  pb.flat(0, 0.03, 0, spec.w - 0.4, spec.len - 0.6, PAD);
  const parked = pb.build();
  g.add(parked);
  g.traverse((m) => { if (m.isMesh && m !== pad) m.castShadow = true; });
  cockpit.group.traverse((m) => { if (m.isMesh) m.castShadow = false; });

  const live = [chassis, pad, ...(wheelParent === g ? wheels : [])];
  const model = {
    group: g, chassis, wheels, cockpit, rider, parked, pad, spec,
    /** Show the driven version (true) or the merged parked one. */
    setLive(on) {
      for (const o of live) o.visible = on;
      parked.visible = !on;
    },
  };
  model.setLive(false);
  return model;
}

/** The hero RAV4 (see RAV4 above) as a vehicle spec. */
export const RAV4_SPEC = {
  ...RAV4, id: 'rav4', name: 'RAV4', eye: new THREE.Vector3(1.25, 4.5, -0.9),
  draw: (b) => drawBody(b, RAV4, RAV4.color),
};

/** The hero RAV4 as a drivable group (createCar). */
export function createRav4() {
  return createCar(RAV4_SPEC);
}


// ---- cockpit: what you see from the driver's seat ----

const DASH = 0x5a5560;      // warm gray plastic
const DASH_LO = 0x45414b;
const HEADLINER = 0xd9d3c7;
const DOOR_IN = 0x4a4650;
const SKIN = 0xb47c5c;      // Ani's hands on the wheel
const KIT = 0xc8102e;       // gauge needles in the jersey red

/** The RAV4 driver's eye in car-local feet (left seat: +X is the driver's side). */
export const EYE = RAV4_SPEC.eye;

/**
 * A simple toon interior: dash with a gauge binnacle and screen, A-pillars,
 * header and headliner, door tops, rear-view mirror, and a steering wheel
 * (with Ani's hands at ten and two) that turns with the steering. Laid out
 * for the RAV4 and moved to each car's beltline and seat (a supercar's dash
 * sits lower; its eye is set to see over it the same way).
 */
export function createCockpit(spec = RAV4_SPEC) {
  const group = new THREE.Group();
  const b = createBatch();
  const { w, beltY, roofY } = spec;
  const eye = spec.eye;
  const [, g1] = spec.glassZ;
  const zTop = g1 - spec.glassFront;            // where the windshield meets the roof
  // from the RAV4's layout to this car's: the dash rides on the beltline, fore-aft with the seat
  const dy = beltY - RAV4.beltY, dz = eye.z + 0.9;

  // dash: a lower block, a rounded-off top pad, the binnacle over the gauges
  b.box(0, 2.15 + dy, 2.15 + dz, w - 0.7, 1.0, 1.1, DASH_LO);
  b.geo(taperBox(w - 0.7, 0.4, 1.25, 0.15, 0.25, 0.05), DASH, 0, 3.35 + dy, 2.05 + dz);
  b.box(eye.x, 3.3 + dy, 1.55 + dz, 1.4, 0.3, 0.7, DASH);
  b.box(eye.x, 3.6 + dy, 1.6 + dz, 1.5, 0.05, 0.85, DASH_LO);                 // binnacle hood
  for (const dx of [-0.3, 0.3]) {
    const dial = new THREE.CylinderGeometry(0.17, 0.17, 0.05, 16);
    dial.rotateX(Math.PI / 2 - 0.25);
    b.geo(dial, 0xfffdf6, eye.x + dx, 3.45 + dy, 1.19 + dz);
    b.geo(new THREE.BoxGeometry(0.03, 0.12, 0.03), KIT, eye.x + dx, 3.47 + dy, 1.16 + dz, 0, -0.25, 0.7);
  }
  // the footwell: dark between the seat and the dash, over the body (low cars look down into it)
  b.box(0, beltY - 0.3, (eye.z + 0.2 + 1.7 + dz) / 2, w - 0.8, 0.34, 1.7 + dz - eye.z - 0.2, DASH_LO);
  // center screen and console
  b.geo(new THREE.BoxGeometry(0.95, 0.5, 0.08), 0x1d1b22, 0, 3.4 + dy, 1.62 + dz, 0, -0.35);
  b.box(0, Math.max(0.6, 1.2 + dy), 0.4 + dz, 0.85, 1.6, 2.6, DASH_LO);
  // A-pillars: windshield base corners up to the roof
  for (const sx of [-1, 1]) {
    const x0 = sx * (w / 2 - 0.35), x1 = sx * (w / 2 - 0.75);
    const py = roofY - beltY, pz = zTop - g1, px = x1 - x0;
    const len = Math.hypot(px, py, pz);
    b.geo(new THREE.BoxGeometry(0.24, len, 0.3), DASH, (x0 + x1) / 2, (beltY + roofY) / 2, (g1 + zTop) / 2,
      0, Math.atan2(pz, py), -Math.atan2(px, py));
    // door tops and window sills running back from the pillars
    b.box(sx * (w / 2 - 0.3), 2.2 + dy, -1.2 + dz, 0.35, 1.2, 5.2, DOOR_IN);
    b.box(sx * (w / 2 - 0.42), 3.38 + dy, -1.2 + dz, 0.42, 0.12, 5.2, DASH);
  }
  // header above the windshield, headliner, rear-view mirror
  b.box(0, roofY - 0.28, zTop - 0.05, w - 1.4, 0.2, 0.45, DASH);
  b.box(0, roofY - 0.2, zTop - 3.5, w - 1.2, 0.1, 6.5, HEADLINER);
  b.box(0, roofY - 0.42, zTop + 0.32, 0.07, 0.16, 0.07, DASH_LO);
  b.geo(new THREE.BoxGeometry(0.7, 0.2, 0.1), DASH_LO, 0, roofY - 0.52, zTop + 0.3, 0, 0.12);
  b.geo(new THREE.BoxGeometry(0.62, 0.14, 0.03), 0xbcd3e0, 0, roofY - 0.52, zTop + 0.245, 0, 0.12);
  const shell = b.build({ castShadow: false });

  // steering wheel on its column, tipped back toward the driver
  const mount = new THREE.Group();
  mount.position.set(eye.x, 3.25 + dy, 1.05 + dz);
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
    limb(wb, new THREE.Vector3(sx * 0.52, 0.3, -0.06), new THREE.Vector3(sx * 0.85, -0.75, -0.75), 0.095, SKIN);
  }
  wheel.add(wb.build({ castShadow: false }));
  group.add(shell, mount);
  return { group, wheel, steer(v) { wheel.rotation.z = v * 2.3; } };
}

/**
 * From the bike's saddle: clip-on bars with Ani's hands on the grips, the
 * instrument pod and the top of the fairing; the bars turn with the steering.
 */
export function createBikeCockpit(spec) {
  const group = new THREE.Group();
  const eye = spec.eye;
  const bars = new THREE.Group();
  bars.position.set(0, eye.y - 1.45, eye.z + 2.05);
  const b = createBatch();
  b.box(0, -0.06, 0, 1.9, 0.12, 0.14, 0x26232b);                      // the bar
  for (const sx of [-1, 1]) {
    b.cyl(sx * 0.95, -0.09, 0, 0.09, 0.4, 0x1d1b22, 8);               // grips stand in as stubs
    limb(b, new THREE.Vector3(sx * 0.9, 0.06, -0.05), new THREE.Vector3(sx * 0.75, 0.4, -1.4), 0.1, SKIN);
    b.box(sx * 0.95, 0.06, 0.02, 0.2, 0.16, 0.24, SKIN);
  }
  b.box(0, -0.02, 0.4, 0.48, 0.2, 0.22, 0x1d1b22);                     // instrument pod
  b.geo(new THREE.CylinderGeometry(0.08, 0.08, 0.03, 14).rotateX(Math.PI / 2 - 0.5), 0xfffdf6, 0, 0.1, 0.32);
  bars.add(b.build({ castShadow: false }));
  group.add(bars);
  return { group, steer(v) { bars.rotation.y = -v * 0.45; } };
}

// a capsule between two points (forearms, legs)
export function limb(b, a, c, r, color) {
  const dir = c.clone().sub(a);
  const g = new THREE.CapsuleGeometry(r, dir.length(), 3, 8);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  const mid = a.clone().add(c).multiplyScalar(0.5);
  b.geo(g, color, mid.x, mid.y, mid.z);
}
