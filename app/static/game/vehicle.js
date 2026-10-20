/*
How the RAV4 drives: 2D arcade physics on the ground plane, stepped at a
fixed 60 Hz by drive.js (which interpolates between steps for the screen).
Units are feet and seconds; heading is three.js rotation.y, so forward is
(sin h, cos h) and the car's local +X (its left, the driver's side) is
(cos h, -sin h).

- Engine: 0-60 mph in about 4.5 s, then a long pull to 160 mph. Boost
  lifts the top speed to 205 mph and pulls half again as hard. The car is
  tuned for fun, not to the real RAV4. TUNE is the RAV4; every other vehicle
  overrides a few fields (power, top speed, grip, size, weight).
- Brakes, then reverse: holding brake below ~1 ft/s backs up.
- Steering: a bicycle model. Lock narrows with speed so the front tires
  never ask for more than about 1.6 g, which keeps 150 mph drivable.
- Grip swings the velocity back toward the heading each step, up to what
  the tires can hold. The handbrake cuts it and lets the car rotate past
  its path, so the tail swings out to a held drift angle (about 35-45
  degrees) until it's released, and the car straightens out keeping most
  of its speed.
- Collision: three circles along the body against the solid boxes, with a
  light bounce (restitution 0.3), a little scraping friction and a spin
  from where the hit lands. The impact speed feeds the camera shake.
- Breakables: a pole or sign hit above 8 mph snaps off (world.onBreak
  sends it flying) and the car just loses 15% of its speed; slower, it's
  as solid as anything else.
*/

export const MPH = 1.46667; // ft/s per mph

export const TUNE = {
  top: 160 * MPH,       // ft/s
  boostTop: 205 * MPH,
  boostAccel: 1.5,
  accel: 19.8,          // ft/s^2 off the line; falls off as (v/top)^3
  curve: 3,
  brake: 45,            // ~1.4 g
  reverse: 14,
  reverseTop: 30,       // ~20 mph
  roll: 1.2,            // coasting: rolling resistance + air drag
  drag: 1.2e-4,
  handbrake: 14,
  wheelbase: 8.7,
  steerMax: 0.6,        // ~34 deg at parking speeds
  aLat: 52,             // how hard the fronts may turn at speed (ft/s^2)
  aLatDrift: 110,
  grip: 70,             // how hard the tires can swing the velocity around (ft/s^2)
  gripDrift: 24,
  scrub: 20,            // speed lost sliding fully sideways (ft/s^2)
  steerRate: 3.2,       // how fast the wheel winds on / returns (input units/s)
  steerReturn: 5,
  grassTop: 70 * MPH,   // off the pavement: soft ground holds you back
  grassDrag: 8,
  restitution: 0.3,
  friction: 0.25,
  circles: [-4.6, 0, 4.6], // along the body (local z)
  radius: 3.05,
  inertia: 22,          // (len^2 + w^2) / 12 for unit mass
  breakSpeed: 8 * MPH,  // poles and signs snap off above this
  breakDrag: 0.15,      // and cost this much of the car's speed
};

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const smooth = (a, b, v) => { const k = clamp((v - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };

/** tune: any TUNE fields this vehicle does differently (each car and the bike has its own). */
export function createVehicle({ x = 0, z = 0, heading = 0, tune = {} } = {}) {
  const T = { ...TUNE, ...tune };
  const s = {
    x, z, h: heading,
    vx: 0, vz: 0,
    yaw: 0,        // heading rate (rad/s)
    steer: 0,      // smoothed steering input, -1 (left) .. 1 (right)
    wheel: 0,      // front wheel angle (rad, + = right)
    spin: 0,       // wheel roll angle
    grip: T.grip,
    drifting: false,
    boosting: false,
    offroad: false,
    vf: 0,         // forward speed, signed
    accel: 0,      // forward acceleration this step (body pitch)
    lat: 0,        // sideways acceleration this step (body roll)
    slip: 0,       // angle between where it's pointing and where it's going (rad)
    impact: 0,     // strongest hit this step (ft/s into the wall)
  };
  const contacts = [];

  /** Circle centers in world space (for drawing debug, Ani's collision, etc). */
  function circles(out = []) {
    const sn = Math.sin(s.h), cs = Math.cos(s.h);
    out.length = 0;
    for (const oz of T.circles) out.push({ x: s.x + sn * oz, z: s.z + cs * oz, r: T.radius });
    return out;
  }

  /**
   * input: {throttle 0..1, brake 0..1, steer -1..1, handbrake bool}
   * world: {solids, surface(x, z) -> true on pavement, bounds {x1, z1, x2, z2, margin}}
   */
  function step(dt, input, world) {
    const sn0 = Math.sin(s.h), cs0 = Math.cos(s.h);
    let vf = s.vx * sn0 + s.vz * cs0;
    const vl = s.vx * cs0 - s.vz * sn0;
    const v0 = vf;

    // ---- steering input: winds on at a fixed rate, comes back quicker ----
    const winding = Math.abs(input.steer) > Math.abs(s.steer) && input.steer * s.steer >= 0;
    const rate = winding ? T.steerRate : T.steerReturn;
    s.steer += clamp(input.steer - s.steer, -rate * dt, rate * dt);

    // ---- longitudinal ----
    s.offroad = world.surface ? !world.surface(s.x, s.z) : false;
    s.boosting = !!input.boost && input.throttle > 0 && !s.offroad && vf > 0;
    const top = s.offroad ? T.grassTop : s.boosting ? T.boostTop : T.top;
    if (input.throttle > 0) {
      if (vf < -1) vf = Math.min(0, vf + T.brake * input.throttle * dt); // stop the reverse first
      else vf += T.accel * (s.boosting ? T.boostAccel : 1) * input.throttle * (1 - Math.pow(Math.max(0, vf) / top, T.curve)) * dt;
    }
    if (input.brake > 0) {
      if (vf > 1) vf = Math.max(0, vf - T.brake * input.brake * dt);
      else vf = Math.max(-T.reverseTop, vf - T.reverse * input.brake * dt);
    }
    if (input.handbrake) vf -= Math.sign(vf) * Math.min(Math.abs(vf), T.handbrake * dt);
    // coasting drag; under power the engine curve already tops out (except on grass)
    const resist = input.throttle > 0
      ? (s.offroad && vf > top ? T.grassDrag : 0)
      : T.roll + T.drag * vf * vf + (s.offroad ? T.grassDrag : 0);
    vf -= Math.sign(vf) * Math.min(Math.abs(vf), resist * dt);

    // past the edge of the drivable map the fog thickens and the car bogs down
    const B = world.bounds;
    if (B) {
      const out = Math.max(B.x1 - s.x, s.x - B.x2, B.z1 - s.z, s.z - B.z2, 0);
      if (out > 0) {
        const k = Math.min(1, out / B.margin);
        vf -= Math.sign(vf) * Math.min(Math.abs(vf), (10 + 70 * k * k) * dt);
      }
    }

    // ---- yaw: bicycle model, lock limited by speed ----
    const sp = Math.abs(vf);
    s.drifting = !!input.handbrake && sp > 15;
    const aLat = s.drifting ? T.aLatDrift : T.aLat;
    const lock = Math.min(T.steerMax, Math.atan(T.wheelbase * aLat / Math.max(sp * sp, 1)));
    s.wheel = s.steer * lock;
    let yawTarget = -vf * Math.tan(s.wheel) / T.wheelbase;
    if (s.drifting) {
      // swing the tail out, but ease off past ~35 degrees of slide so it holds an angle
      // instead of spinning; countersteer (yaw against the slide) is never held back
      yawTarget *= 1.35;
      if (yawTarget * s.slip < 0) yawTarget *= 1 - smooth(0.5, 0.85, Math.abs(s.slip));
    }
    s.yaw += (yawTarget - s.yaw) * (1 - Math.exp(-(s.drifting ? 4 : 12) * dt));
    s.grip += ((s.drifting ? T.gripDrift : T.grip) - s.grip) * (1 - Math.exp(-(s.drifting ? 10 : 2.5) * dt));
    s.h += s.yaw * dt;

    // ---- grip: turning leaves the velocity pointing off the nose; the tires swing
    // it back toward the heading, up to their limit, keeping the speed (less a
    // little scrub while it's sliding) ----
    const wx = vf * sn0 + vl * cs0, wz = vf * cs0 - vl * sn0;
    const sn = Math.sin(s.h), cs = Math.cos(s.h);
    let nf = wx * sn + wz * cs, nl = wx * cs - wz * sn;
    const speed = Math.hypot(nf, nl);
    s.lat = 0;
    if (speed > 0.01) {
      const dirn = nf < 0 ? -1 : 1;                 // backing up: measure from the tail
      const slip = Math.atan2(nl, Math.abs(nf));
      const turn = clamp(slip, -s.grip * dt / speed, s.grip * dt / speed);
      s.slip = slip - turn;
      const sp = Math.max(0, speed - T.scrub * Math.abs(Math.sin(s.slip)) * dt);
      nf = dirn * sp * Math.cos(s.slip);
      nl = sp * Math.sin(s.slip);
      s.lat = (turn * speed) / dt;
    } else {
      s.slip = 0;
    }
    s.vx = nf * sn + nl * cs;
    s.vz = nf * cs - nl * sn;
    s.accel = (nf - v0) / dt;

    // ---- move in small substeps so 160 mph can't tunnel through a pole ----
    s.impact = 0;
    s.broke = false;
    const n = Math.max(1, Math.ceil(Math.hypot(s.vx, s.vz) * dt / 1.2));
    for (let k = 0; k < n; k++) {
      s.x += s.vx * dt / n;
      s.z += s.vz * dt / n;
      if (world.solids) resolve(world);
    }

    // hard stop at the far side of the fog bank
    if (B) {
      const m = B.margin;
      const cx = clamp(s.x, B.x1 - m, B.x2 + m), cz = clamp(s.z, B.z1 - m, B.z2 + m);
      if (cx !== s.x) { s.x = cx; s.vx *= -0.2; }
      if (cz !== s.z) { s.z = cz; s.vz *= -0.2; }
    }

    s.vf = s.vx * Math.sin(s.h) + s.vz * Math.cos(s.h);
    s.spin += (s.vf / 1.19) * dt;
    return s;
  }

  // push each body circle out of anything it overlaps and bounce off it;
  // poles and signs hit above BREAK_SPEED snap off instead (world.onBreak)
  function resolve(world) {
    for (let pass = 0; pass < 2; pass++) {
      let any = false;
      for (const oz of T.circles) {
        const sn = Math.sin(s.h), cs = Math.cos(s.h);
        const cx = s.x + sn * oz, cz = s.z + cs * oz;
        world.solids.contacts(cx, cz, T.radius, contacts);
        for (const c of contacts) {
          if (c.box.breakable && !c.box.dead && world.onBreak) {
            if (Math.hypot(s.vx, s.vz) > T.breakSpeed) {
              world.onBreak(c.box, s.vx, s.vz);
              s.vx *= 1 - T.breakDrag;
              s.vz *= 1 - T.breakDrag;
              s.broke = true;
              continue;
            }
          }
          any = true;
          s.x += c.nx * c.depth;
          s.z += c.nz * c.depth;
          // contact point relative to the car's center
          const rx = sn * oz - c.nx * T.radius, rz = cs * oz - c.nz * T.radius;
          const pvx = s.vx + s.yaw * rz, pvz = s.vz - s.yaw * rx;
          const vn = pvx * c.nx + pvz * c.nz;
          if (vn >= 0) continue;
          const rn = rz * c.nx - rx * c.nz;
          const j = (-(1 + T.restitution) * vn) / (1 + (rn * rn) / T.inertia);
          s.vx += j * c.nx;
          s.vz += j * c.nz;
          s.yaw += (rn * j) / T.inertia;
          // scrape along the wall
          const tx = -c.nz, tz = c.nx;
          const vt = pvx * tx + pvz * tz;
          const rt = rz * tx - rx * tz;
          const jt = clamp(-vt / (1 + (rt * rt) / T.inertia), -T.friction * j, T.friction * j);
          s.vx += jt * tx;
          s.vz += jt * tz;
          s.yaw += (rt * jt) / T.inertia;
          s.impact = Math.max(s.impact, -vn);
        }
      }
      if (!any) break;
    }
  }

  function place(x, z, heading) {
    Object.assign(s, { x, z, h: heading, vx: 0, vz: 0, yaw: 0, vf: 0, steer: 0, wheel: 0 });
  }

  function stop() {
    s.vx = s.vz = s.yaw = s.vf = 0;
  }

  return { s, step, circles, place, stop, tune: T };
}
