// The Octane and its controller: the Rocket League layout mapping, controllers
// coming and going, Rocket League's numbers through the game's physics, and
// the pole rule. Run with `node --test tests/js/` (tests/test_game_js.py does).
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPPING, NEUTRAL, mapControls, createPad, deadStick } from '../../app/static/game/gamepad.js';
import { createVehicle, MPH } from '../../app/static/game/vehicle.js';
import { createSolids } from '../../app/static/game/collide.js';
import { OCTANE_TUNE, UU, RL } from '../../app/static/game/octane.js';

// ---- a fake PlayStation-style pad in the standard layout ----
function fakePad({ axes = [0, 0, 0, 0], held = {}, mapping = 'standard', index = 0 } = {}) {
  const buttons = Array.from({ length: 17 }, (_, i) => {
    const v = held[i] ?? 0;
    return { pressed: v > 0.5 || v === true, value: v === true ? 1 : v };
  });
  return { id: 'fake pad', index, mapping, connected: true, axes, buttons };
}
const B = { cross: 0, circle: 1, square: 2, triangle: 3, L1: 4, R1: 5, L2: 6, R2: 7 };

test('triggers are analog throttle and reverse, with a deadzone', () => {
  const c = mapControls(fakePad({ held: { [B.R2]: 0.8, [B.L2]: 0.03 } }));
  assert.ok(Math.abs(c.throttle - (0.8 - 0.05) / 0.95) < 1e-9);
  assert.equal(c.brake, 0);
  assert.equal(mapControls(fakePad({ held: { [B.L2]: 1 } })).brake, 1);
});

test('the left stick steers, with a radial deadzone', () => {
  assert.deepEqual(deadStick(0.1, 0.05, MAPPING.stickDeadzone), [0, 0]);
  assert.equal(mapControls(fakePad({ axes: [1, 0, 0, 0] })).steer, 1);
  assert.equal(mapControls(fakePad({ axes: [-1, 0, 0, 0] })).steer, -1);
  const half = mapControls(fakePad({ axes: [0.575, 0, 0, 0] })).steer;
  assert.ok(Math.abs(half - 0.5) < 1e-9, `${half}`);
});

test('in the air: stick forward noses down, sideways yaws, L1 turns yaw into free air roll', () => {
  assert.equal(mapControls(fakePad({ axes: [0, -1, 0, 0] })).pitch, -1);
  assert.equal(mapControls(fakePad({ axes: [0, 1, 0, 0] })).pitch, 1);
  const yaw = mapControls(fakePad({ axes: [1, 0, 0, 0] }));
  assert.equal(yaw.yaw, 1);
  assert.equal(yaw.roll, 0);
  const free = mapControls(fakePad({ axes: [1, 0, 0, 0], held: { [B.L1]: 1 } }));
  assert.equal(free.yaw, 0);
  assert.equal(free.roll, 1);
  assert.equal(free.handbrake, true);   // and on the ground it's the powerslide
  assert.equal(free.steer, 1);          // which still steers
});

test('square and circle roll left and right', () => {
  assert.equal(mapControls(fakePad({ held: { [B.square]: 1 } })).roll, -1);
  assert.equal(mapControls(fakePad({ held: { [B.circle]: 1 } })).roll, 1);
  // directional roll keeps the stick on yaw
  const both = mapControls(fakePad({ axes: [1, 0, 0, 0], held: { [B.square]: 1 } }));
  assert.equal(both.roll, -1);
  assert.equal(both.yaw, 1);
});

test('cross jumps, R1 boosts, triangle and the right stick do nothing', () => {
  assert.equal(mapControls(fakePad({ held: { [B.cross]: 1 } })).jump, true);
  assert.equal(mapControls(fakePad({ held: { [B.R1]: 1 } })).boost, true);
  assert.deepEqual(mapControls(fakePad({ axes: [0, 0, 1, -1], held: { [B.triangle]: 1 } })), { ...NEUTRAL });
});

test('a pad arriving and leaving: onChange, and the controls let go', () => {
  let pads = [];
  const seen = [];
  const pad = createPad({ onChange: (on) => seen.push(on), nav: { getGamepads: () => pads }, target: null });
  pad.poll();
  assert.equal(pad.connected, false);
  pads = [null, fakePad({ index: 1, held: { [B.R2]: 1, [B.R1]: 1 } })];
  pad.poll();
  assert.equal(pad.connected, true);
  assert.equal(pad.controls.throttle, 1);
  pads = [];
  pad.poll();
  assert.deepEqual(seen, [true, false]);
  assert.deepEqual(pad.controls, { ...NEUTRAL });
});

test('nothing reads as held while the window is out of focus', () => {
  const target = new EventTarget();
  const pad = createPad({ nav: { getGamepads: () => [fakePad({ held: { [B.R2]: 1 } })] }, target });
  assert.equal(pad.poll().throttle, 1);
  target.dispatchEvent(new Event('blur'));
  assert.deepEqual(pad.poll(), { ...NEUTRAL });
  assert.equal(pad.connected, true);
  target.dispatchEvent(new Event('focus'));
  assert.equal(pad.poll().throttle, 1);
});

test('a standard-layout pad is preferred over another', () => {
  const odd = fakePad({ index: 0, mapping: '' }), std = fakePad({ index: 1 });
  const pad = createPad({ nav: { getGamepads: () => [odd, std] }, target: null });
  pad.poll();
  assert.equal(pad.raw, std);
});


// ---- the Octane through vehicle.js ----
const STEP = 1 / 60;
const IDLE = { throttle: 0, brake: 0, steer: 0, handbrake: false };
const uu = (ft) => ft / UU;
const open = { solids: null };
function octane(vz = 0) {
  const v = createVehicle({ tune: OCTANE_TUNE });
  v.s.vz = v.s.vf = vz * UU;
  return v;
}
function hold(v, secs, input, world = open) {
  for (let i = 0; i < Math.round(secs / STEP); i++) v.step(STEP, { ...IDLE, ...input }, world);
  return v.s;
}

test('throttle tops out at 1410 uu/s, boost at 2300', () => {
  const v = octane();
  assert.ok(Math.abs(uu(hold(v, 8, { throttle: 1 }).vf) - 1410) < 1);
  assert.ok(Math.abs(uu(hold(v, 8, { throttle: 1, boost: true }).vf) - 2300) < 1);
});

test('braking is 3500 uu/s², coasting 525', () => {
  for (const [input, rate] of [[{ brake: 1 }, 3500], [{}, 525]]) {
    const v = octane(1000);
    let t = 0;
    while (v.s.vf > 0 && t < 5) { v.step(STEP, { ...IDLE, ...input }, open); t += STEP; }
    // the last 25 uu/s stop dead, and a 60 Hz step rounds up
    assert.ok(Math.abs(t - 1000 / rate) < 0.04, `${rate}: ${t}`);
  }
});

test('reverse is the same engine curve, to 1410 uu/s', () => {
  assert.ok(Math.abs(uu(hold(octane(), 8, { brake: 1 }).vf) + 1410) < 1);
});

function flight(jumpWhile) {
  const v = octane();
  let t = 0, peak = 0;
  do { v.step(STEP, { ...IDLE, jump: jumpWhile(t) }, open); t += STEP; peak = Math.max(peak, v.s.y); } while (v.s.air && t < 6);
  return { peak: uu(peak), air: t };
}

test('a held jump peaks about 230 uu up; a tap less, a double jump about twice', () => {
  const full = flight((t) => t < 0.3), tap = flight((t) => t < 0.01), twice = flight((t) => t < 0.2 || (t > 0.3 && t < 0.4));
  assert.ok(full.peak > 215 && full.peak < 245, `${full.peak}`);
  assert.ok(tap.peak < full.peak * 0.5, `${tap.peak}`);
  assert.ok(twice.peak > full.peak * 1.8, `${twice.peak}`);
});

function dodgeFrom(speed, stick) {
  const v = octane(speed);
  hold(v, 0.1, { jump: true, boost: speed > 2000 });
  hold(v, 0.05, { boost: speed > 2000 });
  const before = { vx: v.s.vx, vz: v.s.vz };
  v.step(STEP, { ...IDLE, jump: true, ...stick }, open);
  return { v, dx: uu(v.s.vx - before.vx), dz: uu(v.s.vz - before.vz) };
}

test('dodges: 500 uu/s forward, 533 back, and the side push grows with speed', () => {
  const fwd = dodgeFrom(0, { pitch: -1 });
  assert.ok(Math.abs(fwd.dz - 500) < 1e-6 && Math.abs(fwd.dx) < 1e-6, JSON.stringify(fwd));
  assert.equal(fwd.v.s.flipping, true);
  const back = dodgeFrom(0, { pitch: 1 });
  assert.ok(Math.abs(back.dz + 500 * 16 / 15) < 1e-6);
  // heading 0: the car's right is -x. At 1150 uu/s (half of max) the side push is 500 x 1.45
  const side = dodgeFrom(1150, { yaw: 1 });
  assert.ok(Math.abs(-side.dx - 500 * (0.9 * 0.5 + 1)) < 15, `${side.dx}`);
});

test('a dodge spins the car (up to 5.5 rad/s) and a front flip pitches the nose down', () => {
  const { v } = dodgeFrom(0, { pitch: -1 });
  let most = 0;
  for (let i = 0; i < 20; i++) { v.step(STEP, { ...IDLE }, open); most = Math.max(most, Math.hypot(...v.s.w)); }
  assert.ok(Math.abs(most - RL.maxSpin) < 1e-6);
  assert.equal(v.s.flipSpin[1], -1);   // nose down
});

test('air roll: 38.3 rad/s² until 5.5 rad/s, damped when let go', () => {
  const v = octane();
  hold(v, 0.2, { jump: true });
  v.step(STEP, { ...IDLE, roll: 1 }, open);
  const first = Math.hypot(...v.s.w);
  // two 120 Hz ticks of 400 x 0.0959 rad/s², less a little damping
  assert.ok(first > 0.6 && first < 2 * (400 * 2 * Math.PI / 65536 * 1000) / 120 + 1e-9, `${first}`);
  hold(v, 0.3, { roll: 1 });
  assert.ok(Math.abs(Math.hypot(...v.s.w) - RL.maxSpin) < 1e-6);
  hold(v, 0.3, {});
  assert.ok(Math.hypot(...v.s.w) < 1.5);
});

test('it lands back on its wheels with its heading', () => {
  const v = octane(1000);
  hold(v, 3, { jump: true, throttle: 0.3, yaw: 0.4 });
  assert.equal(v.s.air, false);
  assert.ok(Math.abs(v.s.q[1] - Math.sin(v.s.h / 2)) < 1e-9 && Math.abs(v.s.q[3] - Math.cos(v.s.h / 2)) < 1e-9);
});

test('the hitbox circles reach exactly the Octane box', () => {
  const c = OCTANE_TUNE.circles;
  const ft = (x) => x * UU;
  const maxX = Math.max(...c.map(([x, , r]) => x + r)), maxZ = Math.max(...c.map(([, z, r]) => z + r)), minZ = Math.min(...c.map(([, z, r]) => z - r));
  assert.ok(Math.abs(maxX - ft(RL.hitbox.w / 2)) < 1e-9);
  assert.ok(Math.abs(maxZ - ft(RL.hitboxAt.fwd + RL.hitbox.len / 2)) < 1e-9);
  assert.ok(Math.abs(minZ - ft(RL.hitboxAt.fwd - RL.hitbox.len / 2)) < 1e-9);
});


// ---- what it breaks ----
function crashInto(kind, tune) {
  const prop = { x: 0, z: 25, hw: 0.6, hd: 0.6, ry: 0, breakable: true, id: kind, kind };
  const broken = [];
  const world = { solids: createSolids([prop]), onBreak: (box) => { box.dead = true; broken.push(box.kind); } };
  const v = createVehicle({ tune });
  v.s.vz = v.s.vf = 40 * MPH;
  let hit = 0;
  for (let i = 0; i < 120; i++) { v.step(STEP, { ...IDLE, throttle: 1 }, world); hit = Math.max(hit, v.s.impact); }
  return { broken, hit, z: v.s.z };
}

test('the Octane breaks poles, and nothing else', () => {
  assert.deepEqual(crashInto('pole', OCTANE_TUNE).broken, ['pole']);
  for (const kind of ['lamp', 'signal', 'stop', 'bus']) {
    const r = crashInto(kind, OCTANE_TUNE);
    assert.deepEqual(r.broken, [], kind);
    assert.ok(r.hit > 0 && r.z < 25, `${kind} stays solid`);
  }
});

test('the other cars are as they were: they break any prop, and the RAV4 does 0-60 in 4.5 s', () => {
  for (const kind of ['pole', 'lamp', 'signal', 'stop', 'bus']) assert.deepEqual(crashInto(kind, {}).broken, [kind]);
  const rav4 = createVehicle({});
  let t = 0;
  while (rav4.s.vf < 60 * MPH) { rav4.step(STEP, { ...IDLE, throttle: 1 }, open); t += STEP; }
  assert.ok(Math.abs(t - 4.5) < 0.1, `${t}`);
  assert.equal(rav4.s.air, undefined);
  hold(rav4, 1, { jump: true });
  assert.equal(rav4.s.air, undefined);   // only the Octane ever leaves the ground
});
