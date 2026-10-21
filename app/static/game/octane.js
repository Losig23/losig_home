/*
The Octane: Rocket League's default car, driven by a controller in Rocket
League's layout (gamepad.js) and only there while one is connected
(main.js, outside.js). Its look is a stand-in, the garage's toy body in the
Octane's proportions (fleet.js); this file is how it's built and how it
drives, for vehicle.js.

Everything is Rocket League's own numbers in unreal units (uu, 1 uu = 1 cm)
or radians, converted once below to this game's feet. Sources:
- RocketSim (github.com/ZealanL/RocketSim), a reverse-engineered copy of the
  game's physics: RLConst.h for gravity, the speed limits, the throttle,
  steering and powerslide curves, braking, coasting, boost, the jump, the
  dodges and air control; CarConfig.cpp for the Octane's hitbox offset and
  its wheels (where they sit, how big they are).
- Psyonix's published hitbox presets: the Octane is 118.01 x 84.20 x 36.16.
  (RocketSim simulates a box 2.5 uu bigger each way.)
- RLBot's game values: 1 uu = 1 cm; braking 3500 and coasting 525 uu/s²;
  boost 991.67 uu/s² on the ground and 1058.33 in the air; the Octane rests
  with its center of mass 17.01 uu up.

At true size that's a car 3.9 ft long that tops out at 51 mph: Rocket
League's cars are that small (its goals are 6.4 m tall), and this town is
1:1 too. UU is the one number to change to make it bigger; lengths, speeds
and accelerations all scale with it, so it handles the same, just larger.

How it maps onto the game's engine (vehicle.js):
- The center of mass is the car's origin: it turns about it, and the
  hitbox sits 13.88 uu ahead of it (and 20.76 up).
- The engine collides circles, so the box is two circles as wide as the box
  down its middle plus a ring of small ones (4 uu) hugging its edges and
  corners: walls and poles meet it at the box's own flat sides and square
  corners; only a sharp corner of something can poke in between the small
  circles, by up to about 4 inches.
- On the ground the shared bicycle model steers with Rocket League's
  steering-angle-from-speed curve (and the powerslide one, blended in as L1
  ramps up), on its wheelbase. Grip isn't a Rocket League constant: it's set
  high enough that the car holds that curve's tightest line at any speed
  without sliding, as Rocket League's cars do, and powersliding cuts it to
  a tenth (Rocket League's handbrake lateral friction factor).
- Collisions with the world bounce with Rocket League's car-on-world
  restitution and friction (0.3 each).
- Of the breakables it only breaks poles (`breaks`); signs, lights and
  everything else stay solid.
- Boost is infinite: there's no meter and nothing to pick up.
*/

import { curve } from './vehicle.js';

export const UU = 0.0328084;      // ft per unreal unit (1 uu = 1 cm)
const TORQUE = 2 * Math.PI / (1 << 16) * 1000;   // Rocket League's air-control torque scale

/** The Octane in Rocket League's units: uu, uu/s, uu/s², radians, seconds. */
export const RL = {
  hitbox: { len: 118.0074, w: 84.1994, h: 36.1591 },
  hitboxAt: { fwd: 13.8757, up: 20.755 },     // hitbox center from the center of mass
  rest: 17.01,                                // center of mass above the ground, at rest
  wheels: {
    front: { fwd: 51.25, side: 25.90, r: 12.5 },
    back: { fwd: -33.75, side: 29.50, r: 15 },
  },
  maxSpeed: 2300,
  supersonic: 2200,
  // throttle acceleration by forward speed: 1600 uu/s² from a stop, nothing past 1410
  throttle: [[0, 1600], [1400, 160], [1410, 0]],
  deadzone: 0.001,
  brake: 3500,
  coast: 0.15,                                // coasting brakes at this share of `brake`
  stop: 25,                                   // coasting below this speed stops dead
  boostGround: 2975 / 3,
  boostAir: 3175 / 3,
  airThrottle: 200 / 3,
  // max steering angle by forward speed; powersliding blends toward the second curve
  steer: [[0, 0.53356], [500, 0.31930], [1000, 0.18203], [1500, 0.10570], [1750, 0.08507], [3000, 0.03454]],
  slideSteer: [[0, 0.39235], [2500, 0.12610]],
  slideRise: 5,                               // powerslide ramps in and out, per second
  slideFall: 2,
  slideGrip: 0.1,
  gravity: 650,
  jumpImpulse: 875 / 3,                       // the jump's kick and the double jump's
  jumpAccel: 4375 / 3,                        // while it's held
  jumpPreMin: 0.62,                           // (at this share for the first 25 ms)
  jumpMin: 0.025,
  jumpMax: 0.2,
  doubleJump: 1.25,                           // seconds after the jump to double jump or dodge
  dodgeDeadzone: 0.5,                         // |pitch| + |yaw| + |roll| for a dodge instead of a double jump
  dodge: 500,
  dodgeSide: 1.9,                             // side push scale at top speed
  dodgeBack: 2.5,                             // backward push scale at top speed
  dodgeBackX: 16 / 15,
  dodgeBackCut: 100,
  flipTime: 0.65,
  pitchLock: 0.3,                             // after the dodge, before pitch comes back
  flipRoll: 260,                              // rad/s² while a dodge spins the car
  flipPitch: 224,
  zDamp: 0.35,                                // per 1/120 s, from 0.15 s into a dodge
  zDampStart: 0.15,
  zDampEnd: 0.21,
  airTorque: [130 * TORQUE, 95 * TORQUE, 400 * TORQUE],   // pitch, yaw, roll (rad/s²)
  airDamp: [30 * TORQUE, 20 * TORQUE, 50 * TORQUE],
  maxSpin: 5.5,
  restitution: 0.3,
  friction: 0.3,
  hz: 120,
};

const ft = (uu) => uu * UU;
const scaleCurve = (pts, ys) => pts.map(([v, y]) => [ft(v), ys ? ft(y) : y]);
const HB = RL.hitbox, WHEELBASE = RL.wheels.front.fwd - RL.wheels.back.fwd;

// the hitbox as circles [x (left), z (forward), r], in feet from the center of mass
function hitboxCircles() {
  const hx = HB.w / 2, hz = HB.len / 2, at = RL.hitboxAt.fwd, r = 4;
  const out = [[0, at - (hz - hx), hx], [0, at + (hz - hx), hx]];
  for (let i = 0; i <= 5; i++) {
    const z = at - (hz - r) + (2 * (hz - r) * i) / 5;
    for (const sx of [-1, 1]) out.push([sx * (hx - r), z, r]);
  }
  for (const x of [-(hx - r) / 3, (hx - r) / 3]) for (const sz of [-1, 1]) out.push([x, at + sz * (hz - r), r]);
  return out.map(([x, z, rr]) => [ft(x), ft(z), ft(rr)]);
}

// the tightest line Rocket League's steering curve asks for, as sideways acceleration
function hardestTurn() {
  let most = 0;
  for (let v = 0; v <= RL.maxSpeed; v += 50) most = Math.max(most, v * v * Math.tan(curve(RL.steer, v)) / WHEELBASE);
  return most;
}

const GRIP = ft(hardestTurn() * 1.25);

/** vehicle.js's tune for the Octane: the shared fields in feet, and Rocket League's in `rl`. */
export const OCTANE_TUNE = {
  top: ft(RL.maxSpeed),                     // the speedometer fills here
  wheelbase: ft(WHEELBASE),
  steerRate: 1000,                          // the stick turns the wheels directly
  steerReturn: 1000,
  grip: GRIP,
  gripDrift: GRIP * RL.slideGrip,
  handbrake: 0,
  restitution: RL.restitution,
  friction: RL.friction,
  circles: hitboxCircles(),
  inertia: ft(ft(HB.len * HB.len + HB.w * HB.w)) / 12,    // a box's, for unit mass
  breaks: ['pole'],
  wheelR: ft(RL.wheels.back.r),
  rl: {
    ...RL,
    maxSpeed: ft(RL.maxSpeed),
    throttle: scaleCurve(RL.throttle, true),
    stop: ft(RL.stop),
    brake: ft(RL.brake),
    boostGround: ft(RL.boostGround),
    boostAir: ft(RL.boostAir),
    airThrottle: ft(RL.airThrottle),
    steer: scaleCurve(RL.steer, false),
    slideSteer: scaleCurve(RL.slideSteer, false),
    gravity: ft(RL.gravity),
    jumpImpulse: ft(RL.jumpImpulse),
    jumpAccel: ft(RL.jumpAccel),
    dodge: ft(RL.dodge),
    dodgeBackCut: ft(RL.dodgeBackCut),
    upright: 0.5,                           // landing with the roof within 60° of up counts as on its wheels
  },
};

/** Sizes the stand-in model and the cameras need, in feet from the center of mass. */
export const OCTANE_SIZE = {
  len: ft(HB.len),
  w: ft(HB.w),
  rest: ft(RL.rest),
  wheelbase: ft(WHEELBASE),
  wheels: ['front', 'back'].flatMap((k) => {
    const w = RL.wheels[k];
    return [1, -1].map((sx) => ({ x: sx * ft(w.side), z: ft(w.fwd), r: ft(w.r), front: k === 'front' }));
  }),
  // midway between the axles, where the body is drawn around
  mid: ft((RL.wheels.front.fwd + RL.wheels.back.fwd) / 2),
  ft,
};
