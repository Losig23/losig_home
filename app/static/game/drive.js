/*
Driving the RAV4: getting in and out, the controls, the fixed-step physics
loop, the two driving cameras and the dashboard HUD.

- Get in: at the driver's door ("Get in": E or tap the bubble) Ani steps
  in and disappears while the camera blends into the seat. Get out (E or
  the sticker) works under 5 mph; Ani pops out at the driver's door, or the
  other side if a wall is in the way, and the car stays where it stopped.
- Physics steps at a fixed 60 Hz (vehicle.js). The car is drawn
  interpolated between the last two steps so it's smooth at any frame rate,
  with a little body roll and pitch from the forces.
- Cameras: the cockpit (the default, except on portrait phones) sits at the driver's eye and glances into
  turns; the chase camera trails on a lagging yaw, backs off and widens its
  FOV with speed, and pulls in when a wall gets between it and the car.
  C or the camera sticker toggles; main.js blends every camera change.
  Hits shake both (trauma squared, so small taps barely register).
- Touch: the floating stick steers (sideways only, left side of the
  screen); Gas, Brake/Reverse, Drift and Boost stickers on the right each
  track their own finger, so any combination can be held at once.
- Boost (Shift, or the sticker) raises the top speed to 205 mph and pulls
  harder; the cameras widen a little while it's on.
- teleport() is fast travel's half: the car (and Ani, when walking) lands
  on a parking spot without any interpolation smear.
*/
import * as THREE from 'three';
import { MPH } from './vehicle.js';
import { EYE } from './car.js';

const STEP = 1 / 60;
const EXIT_MPH = 5;
const IDLE = { throttle: 0, brake: 0, steer: 0, handbrake: false };

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const ease = (k, dt) => 1 - Math.exp(-k * dt);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * area: the outdoors (car, world, heightAt); keys: main's key map;
 * stick: the touch stick ({x} in -1..1); ui: HUD elements; player: Ani.
 */
export function createDriver({ area, keys, stick, ui, player }) {
  const { rav4, vehicle } = area.car;
  const s = vehicle.s;
  const prev = { x: s.x, z: s.z, h: s.h };
  const pose = { x: s.x, z: s.z, h: s.h };
  let acc = 0;
  let active = false;
  let mode = null;              // first time in: cockpit, or chase on a portrait phone
  let enterT = 0;
  let trauma = 0, shakeT = 0;
  let y = 0, roll = 0, pitch = 0, boostK = 0;
  let hop = null;               // Ani stepping in or out
  const chase = { yaw: s.h, dist: 22, lift: 7.5 };

  // ---- touch pedals: each sticker remembers which fingers are on it ----
  const pedals = { gas: new Set(), brake: new Set(), drift: new Set(), boost: new Set() };
  for (const [name, el] of Object.entries({ gas: ui.gas, brake: ui.brake, drift: ui.drift, boost: ui.boost })) {
    const up = (e) => {
      pedals[name].delete(e.pointerId);
      el.classList.toggle('on', pedals[name].size > 0);
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      pedals[name].add(e.pointerId);
      el.classList.add('on');
      try { el.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    });
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  const releasePedals = () => {
    for (const [name, set] of Object.entries(pedals)) { set.clear(); ui[name].classList.remove('on'); }
  };

  function input() {
    const k = keys;
    const steer = ((k.d || k.arrowright) ? 1 : 0) - ((k.a || k.arrowleft) ? 1 : 0);
    return {
      throttle: (k.w || k.arrowup || pedals.gas.size) ? 1 : 0,
      brake: (k.s || k.arrowdown || pedals.brake.size) ? 1 : 0,
      steer: steer || stick.x,
      handbrake: !!(k[' '] || pedals.drift.size),
      boost: !!(k.shift || pedals.boost.size),
    };
  }

  // where Ani stands to get in or out: beside a door, 4.5 ft off the centerline
  function doorSpot(side = 1, along = 0.6) {
    const sn = Math.sin(s.h), cs = Math.cos(s.h), lx = side * (rav4.spec.w / 2 + 1.5);
    return { x: s.x + lx * cs + along * sn, z: s.z - lx * sn + along * cs, dirX: side * cs, dirZ: -side * sn };
  }

  // Ani on foot at the driver's door, else the passenger side, else behind or in front
  function standBeside() {
    const tries = [doorSpot(1), doorSpot(-1), doorSpot(1, -9.5), doorSpot(1, 9.5)];
    const free = tries.find((p) => !area.world.solids.hit(p.x, p.z, player.radius + 0.3)) || tries[0];
    const st = player.state;
    Object.assign(st, { x: free.x, z: free.z, dirX: free.dirX, dirZ: free.dirZ });
    st.y = area.heightAt(free.x, free.z);
    player.group.position.set(st.x, st.y, st.z);
    player.group.rotation.y = Math.atan2(st.dirX, st.dirZ);
    player.group.visible = true;
  }

  function drawCar(dt) {
    rav4.group.position.set(pose.x, y, pose.z);
    rav4.group.rotation.y = pose.h;
    // lean out of turns, squat under power, dive under braking
    roll += (clamp(-s.lat * 0.0011, -0.055, 0.055) - roll) * ease(7, dt);
    pitch += (clamp(-s.accel * 0.0012, -0.04, 0.035) - pitch) * ease(7, dt);
    rav4.chassis.rotation.set(active ? pitch : 0, 0, active ? roll : 0);
    for (const w of rav4.wheels) {
      w.rotation.x = s.spin;
      if (w.userData.front) w.rotation.y = -s.wheel;
    }
    rav4.cockpit.wheel.rotation.z = s.steer * 2.3;
  }

  function update(dt) {
    if (hop) {
      // Ani shrinks into the seat / pops out of the door
      hop.t += dt;
      const k = Math.min(1, hop.t / 0.22);
      const st = player.state;
      if (hop.in) {
        st.x = hop.x + (hop.tx - hop.x) * k;
        st.z = hop.z + (hop.tz - hop.z) * k;
        player.group.position.set(st.x, st.y, st.z);
        player.group.scale.setScalar(1 - k * k);
        if (k === 1) player.group.visible = false;
      } else {
        player.group.scale.setScalar(k < 1 ? 0.3 + 0.7 * k + Math.sin(k * Math.PI) * 0.15 : 1);
      }
      if (k === 1) hop = null;
    }
    if (!active) return;
    enterT += dt;
    const inp = enterT < 0.45 ? IDLE : input();
    acc += dt;
    while (acc >= STEP) {
      prev.x = s.x; prev.z = s.z; prev.h = s.h;
      vehicle.step(STEP, inp, area.world);
      if (s.impact > 4) trauma = Math.min(1, trauma + s.impact / 40);
      acc -= STEP;
    }
    const a = acc / STEP;
    pose.x = prev.x + (s.x - prev.x) * a;
    pose.z = prev.z + (s.z - prev.z) * a;
    pose.h = prev.h + (s.h - prev.h) * a;
    y += (area.heightAt(pose.x, pose.z) - y) * ease(22, dt);
    trauma = Math.max(0, trauma - dt * 1.4);
    boostK += ((s.boosting ? 1 : 0) - boostK) * ease(3, dt);
    shakeT += dt;
    drawCar(dt);
    hud();
  }

  // ---- cameras: each writes a pose; main.js blends between them ----
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler(0, 0, 0, 'YXZ');
  const look = new THREE.Vector3();

  function shake(out) {
    // rough ground adds a little rumble on top of impacts
    const rumble = s.offroad ? Math.min(1, Math.abs(s.vf) / 60) * 0.18 : 0;
    const amt = trauma * trauma + rumble * rumble;
    if (amt <= 0.0001) return 0;
    const t = shakeT * 31;
    out.position.x += Math.sin(t * 1.3) * Math.cos(t * 0.7) * amt * 0.6;
    out.position.y += Math.sin(t * 1.9 + 1) * amt * 0.45;
    out.position.z += Math.cos(t * 1.1 + 2) * amt * 0.6;
    return Math.sin(t * 1.7) * amt * 0.05;
  }

  function cockpitPose(out, aspect) {
    rav4.group.updateMatrixWorld(true);
    out.position.copy(EYE).applyMatrix4(rav4.chassis.matrixWorld);
    // glance into the turn a little, more when moving
    const glance = -s.steer * 0.13 * Math.min(1, Math.abs(s.vf) / 30 + 0.3);
    const r = shake(out);
    _e.set(-0.05, Math.PI + glance, r);
    out.quaternion.setFromEuler(_e);
    rav4.chassis.getWorldQuaternion(_q);
    out.quaternion.premultiply(_q);
    out.fov = fovFor(62 + 6 * Math.min(1, Math.abs(s.vf) / (120 * MPH)) + 5 * boostK, aspect);
    out.near = 0.25;
  }

  function chasePose(out, dt, aspect) {
    const speed = Math.abs(s.vf);
    // yaw trails the heading (swings wide in drifts); reversing keeps it behind
    chase.yaw += wrap(pose.h - chase.yaw) * ease(s.drifting ? 2.2 : 3.6, dt);
    const want = 22 + speed * 0.03 + clamp(s.accel, -30, 30) * 0.05;
    chase.dist += (want - chase.dist) * ease(3, dt);
    chase.lift += (7.5 + speed * 0.008 - chase.lift) * ease(3, dt);
    const sn = Math.sin(chase.yaw), cs = Math.cos(chase.yaw);
    let dist = chase.dist;
    // a wall between the car and the camera pulls it in (instead of the cutaway)
    const ex = pose.x - sn * dist, ez = pose.z - cs * dist;
    const t = area.world.solids.ray(pose.x, pose.z, ex, ez, 1.2);
    if (t < 1) dist = Math.max(9, dist * t - 0.8);
    // pulled in, it rises to look down over the roof
    out.position.set(pose.x - sn * dist, y + chase.lift * (1.5 - 0.5 * dist / chase.dist), pose.z - cs * dist);
    const r = shake(out);
    // pulled in tight, look further up the road rather than down at the roof
    const ahead = 6 + 26 * (1 - dist / chase.dist);
    look.set(pose.x + Math.sin(pose.h) * ahead, y + 3.6, pose.z + Math.cos(pose.h) * ahead);
    _m.lookAt(out.position, look, THREE.Object3D.DEFAULT_UP);
    out.quaternion.setFromRotationMatrix(_m);
    if (r) out.quaternion.multiply(_q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), r));
    out.fov = fovFor(58 + 16 * Math.min(1, speed / (130 * MPH)) + 6 * boostK, aspect);
    out.near = 0.5;
  }

  // keep a usable horizontal view on portrait phones
  function fovFor(v, aspect) {
    const h = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(v) / 2) * aspect);
    const minH = THREE.MathUtils.degToRad(64);
    if (h >= minH) return v;
    return Math.min(96, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(minH / 2) / aspect)));
  }

  function cameraPose(out, dt, aspect) {
    if (mode === 'cockpit') cockpitPose(out, aspect);
    else chasePose(out, dt, aspect);
  }

  // ---- HUD ----
  let shownMph = -1, shownGear = '';
  function hud() {
    const mph = Math.round(Math.abs(s.vf) / MPH);
    if (mph !== shownMph) {
      shownMph = mph;
      ui.mph.textContent = mph;
      ui.dial.style.setProperty('--k', Math.min(1, mph / 160).toFixed(3));
      ui.out.classList.toggle('off', mph >= EXIT_MPH);
    }
    const gear = s.vf < -1 ? 'R' : s.drifting ? 'DRIFT' : s.boosting ? 'BOOST' : '';
    if (gear !== shownGear) {
      shownGear = gear;
      ui.gear.textContent = gear;
    }
  }

  function setMode(m) {
    mode = m;
    rav4.cockpit.group.visible = active && mode === 'cockpit';
    ui.cam.querySelector('.label').textContent = mode === 'cockpit' ? 'chase cam' : 'cockpit';
  }

  return {
    get active() { return active; },
    get mode() { return mode; },
    get canExit() { return Math.abs(s.vf) < EXIT_MPH * MPH; },
    get speed() { return Math.abs(s.vf); },
    pose,
    update,
    cameraPose,

    enter() {
      if (active) return;
      const d = doorSpot();
      const st = player.state;
      hop = { in: true, t: 0, x: st.x, z: st.z, tx: d.x - d.dirX * 1.2, tz: d.z - d.dirZ * 1.2 };
      st.dirX = -d.dirX; st.dirZ = -d.dirZ;
      player.group.rotation.y = Math.atan2(st.dirX, st.dirZ);
      Object.assign(prev, { x: s.x, z: s.z, h: s.h });
      Object.assign(pose, prev);
      acc = 0; enterT = 0; trauma = 0;
      chase.yaw = s.h;
      // a portrait phone's cockpit is mostly headliner and dash, so it starts behind the car
      if (mode === null) mode = innerWidth < innerHeight ? 'chase' : 'cockpit';
      y = area.heightAt(s.x, s.z);
      active = true;
      area.car.parked = false;
      setMode(mode);
      ui.root.dataset.mode = 'drive';
    },

    /** Get out if slow enough; returns false (and nudges the HUD) otherwise. */
    exit() {
      if (!active) return true;
      if (!this.canExit) {
        ui.out.classList.remove('nudge');
        void ui.out.offsetWidth; // restart the wiggle
        ui.out.classList.add('nudge');
        return false;
      }
      vehicle.stop();
      Object.assign(prev, { x: s.x, z: s.z, h: s.h });
      Object.assign(pose, prev);
      acc = 0;
      active = false;
      releasePedals();
      drawCar(1);
      area.car.parked = true;
      standBeside();
      player.group.scale.setScalar(0.3);
      hop = { in: false, t: 0 };
      setMode(mode);
      delete ui.root.dataset.mode;
      return true;
    },

    toggleCam() {
      if (active) setMode(mode === 'cockpit' ? 'chase' : 'cockpit');
    },

    /** Fast travel: put the car on (x, z) facing h, stopped; a walking Ani lands at its door. */
    teleport(x, z, h) {
      vehicle.place(x, z, h);
      Object.assign(prev, { x, z, h });
      Object.assign(pose, prev);
      acc = 0; trauma = 0;
      chase.yaw = h;
      y = area.heightAt(x, z);
      drawCar(1);
      if (!active) {
        standBeside();
        player.group.scale.setScalar(1);
        hop = null;
      }
    },

  };
}
