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
  as solid as anything else. A tune can name the kinds it breaks (`breaks`).
- The Octane (octane.js) brings Rocket League's numbers in `tune.rl`: on
  the ground its throttle, braking, coasting, boost and steering-lock curves
  replace the arcade ones above (the bicycle model, grip, drift and
  collisions are shared); and it can leave the ground: jump, double jump,
  dodges and air control, with a height and a full orientation while
  airborne. It ticks at Rocket League's 120 Hz. Every other vehicle has no
  `rl` and never leaves the ground.
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

/** A piecewise-linear curve [[x, y], ...] (Rocket League's tables), flat past its ends. */
export function curve(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    if (x <= x1) {
      const [x0, y0] = pts[i - 1];
      return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
    }
  }
  return pts[pts.length - 1][1];
}

// quaternions [x, y, z, w] for a car in the air (three.js order and handedness)
const yawQuat = (h) => [0, Math.sin(h / 2), 0, Math.cos(h / 2)];
function qmul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
/** (x, y, z) turned by q. */
function rotate(q, x, y, z) {
  const [qx, qy, qz, qw] = q;
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  return [x + qw * tx + qy * tz - qz * ty, y + qw * ty + qz * tx - qx * tz, z + qw * tz + qx * ty - qy * tx];
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const addTo = (v, axis, k) => { v[0] += axis[0] * k; v[1] += axis[1] * k; v[2] += axis[2] * k; };

/** tune: any TUNE fields this vehicle does differently (each car and the bike has its own). */
export function createVehicle({ x = 0, z = 0, heading = 0, tune = {} } = {}) {
  const T = { ...TUNE, ...tune };
  const rl = T.rl ?? null;
  // the body as circles: a number is one on the center line (radius T.radius), [x, z, r] one anywhere
  const body = T.circles.map((c) => (typeof c === 'number' ? { x: 0, z: c, r: T.radius } : { x: c[0], z: c[1], r: c[2] }));
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
  if (rl) Object.assign(s, airborne(heading));
  const contacts = [];

  /** Circle centers in world space (for drawing debug, Ani's collision, etc). */
  function circles(out = []) {
    const sn = Math.sin(s.h), cs = Math.cos(s.h);
    out.length = 0;
    for (const b of body) out.push({ x: s.x + cs * b.x + sn * b.z, z: s.z - sn * b.x + cs * b.z, r: b.r });
    return out;
  }

  /**
   * input: {throttle 0..1, brake 0..1, steer -1..1, handbrake bool}, and for
   * the Octane also {boost, jump bool, pitch (nose up), yaw (nose right),
   * roll (right side down), each -1..1}
   * world: {solids, surface(x, z) -> true on pavement, bounds {x1, z1, x2, z2, margin}}
   */
  function step(dt, input, world) {
    if (!rl) return tick(dt, input, world);
    // Rocket League ticks at 120 Hz: two of them per 60 Hz step
    const n = Math.max(1, Math.round(dt * rl.hz));
    let impact = 0, broke = false;
    for (let i = 0; i < n; i++) {
      tick(dt / n, input, world);
      impact = Math.max(impact, s.impact);
      broke ||= s.broke;
    }
    s.impact = impact;
    s.broke = broke;
    return s;
  }

  function tick(dt, input, world) {
    if (rl) {
      const pressed = !!input.jump && !s.lastJump;
      s.lastJump = !!input.jump;
      if (s.air || pressed) return fly(dt, input, world, pressed);
      s.slide = clamp(s.slide + (input.handbrake ? rl.slideRise : -rl.slideFall) * dt, 0, 1);
    }
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
    if (rl) vf = rlDrive(vf, input, dt);
    else {
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
    }

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
    const lock = rl
      ? curve(rl.steer, sp) + (curve(rl.slideSteer, sp) - curve(rl.steer, sp)) * s.slide
      : Math.min(T.steerMax, Math.atan(T.wheelbase * aLat / Math.max(sp * sp, 1)));
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

    move(dt, world);
    s.vf = s.vx * Math.sin(s.h) + s.vz * Math.cos(s.h);
    s.spin += (s.vf / (T.wheelR ?? 1.19)) * dt;
    if (rl) s.q = yawQuat(s.h);
    return s;
  }

  // move in small substeps so 160 mph can't tunnel through a pole
  function move(dt, world) {
    s.impact = 0;
    s.broke = false;
    const n = Math.max(1, Math.ceil(Math.hypot(s.vx, s.vz) * dt / 1.2));
    for (let k = 0; k < n; k++) {
      s.x += s.vx * dt / n;
      s.z += s.vz * dt / n;
      if (world.solids) resolve(world);
    }

    // hard stop at the far side of the fog bank
    const B = world.bounds;
    if (B) {
      const m = B.margin;
      const cx = clamp(s.x, B.x1 - m, B.x2 + m), cz = clamp(s.z, B.z1 - m, B.z2 + m);
      if (cx !== s.x) { s.x = cx; s.vx *= -0.2; }
      if (cz !== s.z) { s.z = cz; s.vz *= -0.2; }
    }
  }

  // push each body circle out of anything it overlaps and bounce off it;
  // poles and signs hit above BREAK_SPEED snap off instead (world.onBreak)
  function resolve(world) {
    for (let pass = 0; pass < 2; pass++) {
      let any = false;
      for (const b of body) {
        const sn = Math.sin(s.h), cs = Math.cos(s.h);
        const ox = cs * b.x + sn * b.z, oz = -sn * b.x + cs * b.z;
        world.solids.contacts(s.x + ox, s.z + oz, b.r, contacts);
        for (const c of contacts) {
          if (c.box.breakable && !c.box.dead && world.onBreak && (!T.breaks || T.breaks.includes(c.box.kind))) {
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
          const rx = ox - c.nx * b.r, rz = oz - c.nz * b.r;
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

  // ---- the Octane on the ground: Rocket League's engine and brakes ----
  // One signed throttle (gas minus reverse). The engine pulls along a speed
  // curve that runs out at 1410 uu/s; throttle against the way the car is
  // rolling brakes hard; letting go coasts on a light brake (and stops dead
  // below 25 uu/s); boost adds its own push and full throttle, up to 2300.
  // Powersliding leaves the throttle alone and never brakes.
  function rlDrive(vf, input, dt) {
    const sp = Math.abs(vf);
    s.boosting = !!input.boost;
    let t = s.boosting ? 1 : clamp((input.throttle || 0) - (input.brake || 0), -1, 1);
    let brake = 0;
    if (!input.handbrake) {
      if (Math.abs(t) < rl.deadzone) {
        t = 0;
        brake = sp < rl.stop ? 1 : rl.coast;
      } else if (sp > rl.stop && Math.sign(t) !== Math.sign(vf)) {
        t = 0;
        brake = 1;
      }
    }
    vf += t * curve(rl.throttle, sp) * dt;
    if (s.boosting) vf += rl.boostGround * dt;
    // coasting on grass drags like it does for every car
    const slow = brake * rl.brake + (s.offroad && !t ? T.grassDrag : 0);
    vf -= Math.sign(vf) * Math.min(Math.abs(vf), slow * dt);
    return clamp(vf, -rl.maxSpeed, rl.maxSpeed);
  }

  // ---- the Octane in the air: Rocket League's jump, double jump, dodges and air control ----
  function fly(dt, input, world, pressed) {
    if (!s.air) {
      // take off: the jump's kick along the roof (the ground is flat, so straight up),
      // keeping the car's speed and turning its turn into spin
      Object.assign(s, airborne(s.h), { air: true, lastJump: true, jumping: true, jumped: true, w: [0, s.yaw, 0] });
      s.vy = rl.jumpImpulse;
      pressed = false;
    }
    const fwd = rotate(s.q, 0, 0, 1), up = rotate(s.q, 0, 1, 0), right = rotate(s.q, -1, 0, 0);
    const pitch = clamp(input.pitch || 0, -1, 1), yaw = clamp(input.yaw || 0, -1, 1), roll = clamp(input.roll || 0, -1, 1);
    const t = clamp((input.throttle || 0) - (input.brake || 0), -1, 1);
    const v = [s.vx, s.vy, s.vz];

    // spin: a dodge turns the car by itself; otherwise air control, against a little damping
    let control = true;
    if (s.flipping) s.flipping = s.flipT < rl.flipTime;
    if (s.flipping) {
      const [fr, fp] = s.flipSpin;
      if (fr || fp) {
        control = false;
        // pulling the stick against a dodge's pitch cancels it and hands back air control
        let k = 1;
        if (fp * pitch < 0) { k = 1 - Math.min(1, Math.abs(pitch)); control = true; }
        addTo(s.w, fwd, fr * rl.flipRoll * dt);
        addTo(s.w, right, fp * k * rl.flipPitch * dt);
      }
    }
    if (control) {
      // pitch stays locked through a dodge and for a moment after it
      const ps = s.flipping || (s.flipped && s.flipT < rl.flipTime + rl.pitchLock) ? 0 : 1;
      const [tp, ty, tr] = rl.airTorque, [dp, dy, dr] = rl.airDamp;
      const wp = dot(s.w, right), wy = dot(s.w, up), wr = dot(s.w, fwd);
      addTo(s.w, right, (pitch * ps * tp - wp * dp * (1 - Math.abs(pitch * ps))) * dt);
      addTo(s.w, up, (-yaw * ty - wy * dy * (1 - Math.abs(yaw))) * dt);
      addTo(s.w, fwd, (roll * tr - wr * dr) * dt);
    }
    if (t) addTo(v, fwd, t * rl.airThrottle * dt);

    // the jump: held, it keeps pushing for up to 0.2 s
    if (s.jumping) s.jumping = s.jumpT < rl.jumpMin || (!!input.jump && s.jumpT < rl.jumpMax);
    if (s.jumping) addTo(v, up, rl.jumpAccel * (s.jumpT < rl.jumpMin ? rl.jumpPreMin : 1) * dt);
    if (s.jumping || s.jumped) s.jumpT += dt;

    // a second press within 1.25 s of the jump: a double jump, or with the stick, a dodge
    s.sinceJump = s.jumped && !s.jumping ? s.sinceJump + dt : 0;
    if (pressed && s.sinceJump < rl.doubleJump && !s.doubled && !s.flipped) {
      if (Math.abs(pitch) + Math.abs(yaw) + Math.abs(roll) >= rl.dodgeDeadzone) dodge(v, fwd, pitch, yaw, roll);
      else {
        addTo(v, up, rl.jumpImpulse);
        s.doubled = true;
      }
    }
    if (s.flipping) {
      s.flipT += dt;
      // a dodge floats: it holds back the fall for a while
      if (s.flipT <= rl.flipTime && s.flipT >= rl.zDampStart && (v[1] < 0 || s.flipT < rl.zDampEnd)) v[1] *= Math.pow(1 - rl.zDamp, dt * 120);
    } else if (s.flipped) s.flipT += dt;

    // boost along the nose, gravity, and Rocket League's speed and spin limits
    s.boosting = !!input.boost;
    if (s.boosting) addTo(v, fwd, rl.boostAir * dt);
    v[1] -= rl.gravity * dt;
    const sp = Math.hypot(v[0], v[1], v[2]);
    if (sp > rl.maxSpeed) for (let i = 0; i < 3; i++) v[i] *= rl.maxSpeed / sp;
    const ws = Math.hypot(s.w[0], s.w[1], s.w[2]);
    if (ws > rl.maxSpin) for (let i = 0; i < 3; i++) s.w[i] *= rl.maxSpin / ws;
    [s.vx, s.vy, s.vz] = v;

    // turn; the heading follows the spin about the vertical, so it holds steady through flips
    const wm = Math.hypot(s.w[0], s.w[1], s.w[2]);
    if (wm > 1e-9) {
      const a = wm * dt / 2, k = Math.sin(a) / wm;
      const q = qmul([s.w[0] * k, s.w[1] * k, s.w[2] * k, Math.cos(a)], s.q), n = Math.hypot(...q);
      s.q = q.map((c) => c / n);
    }
    s.h += s.w[1] * dt;
    s.yaw = s.w[1];
    s.steer = clamp(input.steer || 0, -1, 1);
    s.wheel = s.steer * curve(rl.steer, 0);

    // across the ground plane against the solids like any car (a hit spins it), then up and down
    move(dt, world);
    s.w[1] = s.yaw;
    s.y += s.vy * dt;
    s.drifting = s.offroad = false;
    s.accel = s.lat = s.slip = 0;
    if (s.y <= 0 && s.vy <= 0) land();
    s.vf = s.vx * Math.sin(s.h) + s.vz * Math.cos(s.h);
    s.spin += (s.vf / (T.wheelR ?? 1.19)) * dt;
    return s;
  }

  // a dodge: spin the way the stick points, and a push along the ground that's
  // stronger to the side (and backward) the faster the car is going
  function dodge(v, fwd, pitch, yaw, roll) {
    s.flipped = s.flipping = true;
    s.flipT = 0;
    let dx = -pitch, dy = yaw + roll;              // toward the nose, toward the right
    if (Math.abs(dy) < 0.1 && Math.abs(dx) < 0.1) dx = dy = 0;   // a stall: no spin, no push
    else {
      const m = Math.hypot(dx, dy);
      dx /= m;
      dy /= m;
    }
    s.flipSpin = [dy, -dx];                        // roll right, nose up
    if (Math.abs(dx) < 0.1) dx = 0;
    if (Math.abs(dy) < 0.1) dy = 0;
    if (!dx && !dy) return;
    const speed = dot(v, fwd), k = Math.abs(speed) / rl.maxSpeed;
    const back = Math.abs(speed) < rl.dodgeBackCut ? dx < 0 : (dx >= 0) !== (speed >= 0);
    let ix = dx * rl.dodge * (((back ? rl.dodgeBack : 1) - 1) * k + 1);
    const iy = dy * rl.dodge * ((rl.dodgeSide - 1) * k + 1);
    if (back) ix *= rl.dodgeBackX;
    // the nose and the car's right, flat on the ground
    const hl = Math.hypot(fwd[0], fwd[2]);
    const fx = hl > 1e-6 ? fwd[0] / hl : Math.sin(s.h), fz = hl > 1e-6 ? fwd[2] / hl : Math.cos(s.h);
    v[0] += ix * fx - iy * fz;
    v[2] += ix * fz + iy * fx;
  }

  // back on the ground: on its wheels if it came down roughly upright; on its side or
  // roof it rights itself (the ground is one flat plane, so there's no turtling) and
  // loses half its speed
  function land() {
    const up = rotate(s.q, 0, 1, 0), fwd = rotate(s.q, 0, 0, 1);
    if (Math.hypot(fwd[0], fwd[2]) > 0.2) s.h = Math.atan2(fwd[0], fwd[2]);
    if (up[1] < rl.upright) {
      s.vx *= 0.5;
      s.vz *= 0.5;
    }
    Object.assign(s, airborne(s.h), { yaw: s.w[1], lastJump: s.lastJump });
  }

  function place(x, z, heading) {
    Object.assign(s, { x, z, h: heading, vx: 0, vz: 0, yaw: 0, vf: 0, steer: 0, wheel: 0 });
    if (rl) Object.assign(s, airborne(heading));
  }

  function stop() {
    s.vx = s.vz = s.yaw = s.vf = 0;
    if (rl) Object.assign(s, airborne(s.h));
  }

  return { s, step, circles, place, stop, tune: T };
}

// the Octane's state on top of a ground car's: settled on its wheels, nothing used
function airborne(h) {
  return {
    y: 0, vy: 0,          // its center of mass above where it rests (ft), and how fast that climbs
    air: false,
    q: yawQuat(h),        // orientation: all of it in the air, just the heading on the ground
    w: [0, 0, 0],         // spin in the air (rad/s, world axes)
    slide: 0,             // powerslide, 0..1: it ramps in and out like Rocket League's
    lastJump: false, jumping: false, jumpT: 0, jumped: false, sinceJump: 0,
    doubled: false, flipped: false, flipping: false, flipT: 0,
    flipSpin: [0, 0],     // a dodge's spin in the car's own axes: [roll right, nose up]
  };
}
