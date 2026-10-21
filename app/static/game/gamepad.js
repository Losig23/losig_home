/*
Controllers, through the Gamepad API, mapped to Rocket League's layout for
the Octane (octane.js), the one vehicle a controller drives.

- Connection: gamepadconnected and gamepaddisconnected, plus a look at
  navigator.getGamepads() every frame (poll), which also catches a pad that
  went to sleep without an event. Browsers only show a pad to the page
  after one of its buttons is pressed. onChange(true) fires when the first
  pad arrives, onChange(false) when the last one leaves; the controls drop
  back to neutral at once, so nothing stays held. They also read neutral
  while the window doesn't have focus.
- MAPPING is the whole layout in one place: button and axis indices from
  the W3C "standard" gamepad layout on a PlayStation-style pad. Some
  browser and OS pairs report a pad in another order (mapping isn't
  "standard"; Firefox on macOS often does this with DualShock and DualSense
  pads), so check against /game?pad, which shows the raw values next to
  what they're mapped to.
- The sticks get a radial deadzone (and are rescaled so its edge reads 0),
  the analog triggers a small one.
- The right stick stays unbound: the driving cameras have no look control.
  Triangle is unused too (no ball cam).
*/

export const MAPPING = {
  // buttons
  jump: 0,          // ✕: jump, double jump, dodge
  rollRight: 1,     // ○: air roll right
  rollLeft: 2,      // □: air roll left
  slide: 4,         // L1: powerslide on the ground, free air roll in the air
  boost: 5,         // R1: boost (the Octane's never runs out)
  reverse: 6,       // L2 (analog): reverse / brake
  throttle: 7,      // R2 (analog): throttle
  // axes
  stickX: 0,        // left stick: steer on the ground, yaw in the air (roll with L1)
  stickY: 1,        // left stick: pitch in the air
  invertPitch: false, // Rocket League's default: stick forward noses down
  stickDeadzone: 0.15,
  triggerDeadzone: 0.05,
};

/** What a car reads with no controller (or after it's gone): nothing held. */
export const NEUTRAL = Object.freeze({
  throttle: 0, brake: 0, steer: 0, pitch: 0, yaw: 0, roll: 0,
  jump: false, boost: false, handbrake: false,
});

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** A stick with a radial deadzone, rescaled so it starts from 0 at the deadzone's edge. */
export function deadStick(x, y, dz) {
  const m = Math.hypot(x, y);
  if (m <= dz) return [0, 0];
  const k = Math.min(1, (m - dz) / (1 - dz)) / m;
  return [clamp(x * k, -1, 1), clamp(y * k, -1, 1)];
}

/** An analog trigger (0..1) with a deadzone, rescaled the same way. */
export function deadTrigger(v, dz) {
  return v <= dz ? 0 : Math.min(1, (v - dz) / (1 - dz));
}

/**
 * A pad's state as the Octane's controls, the way Rocket League reads them:
 * throttle and brake from the triggers; the stick steers, and in the air
 * pitches (stick forward: nose down) and yaws, or with free air roll (L1)
 * rolls instead of yawing; □ and ○ roll left and right on top of that.
 */
export function mapControls(gp, m = MAPPING) {
  if (!gp) return { ...NEUTRAL };
  const btn = (i) => gp.buttons[i] ?? { pressed: false, value: 0 };
  const [sx, sy] = deadStick(gp.axes[m.stickX] ?? 0, gp.axes[m.stickY] ?? 0, m.stickDeadzone);
  const slide = !!btn(m.slide).pressed;
  const dir = (btn(m.rollRight).pressed ? 1 : 0) - (btn(m.rollLeft).pressed ? 1 : 0);
  return {
    throttle: deadTrigger(btn(m.throttle).value, m.triggerDeadzone),
    brake: deadTrigger(btn(m.reverse).value, m.triggerDeadzone),
    steer: sx,
    pitch: m.invertPitch ? -sy : sy,
    yaw: slide ? 0 : sx,
    roll: clamp(dir + (slide ? sx : 0), -1, 1),
    jump: !!btn(m.jump).pressed,
    boost: !!btn(m.boost).pressed,
    handbrake: slide,
  };
}

/**
 * The controller in use: poll() once a frame reads it (and notices pads
 * coming and going); controls is the latest mapped state. nav and target
 * stand in for navigator and window in tests.
 */
export function createPad({ onChange = () => {}, nav = globalThis.navigator, target = globalThis, mapping = MAPPING } = {}) {
  let gp = null;
  let controls = { ...NEUTRAL };
  let connected = false;
  // browsers stop updating a pad for a page that isn't focused, so a trigger held as
  // the window lost focus would read as held; read nothing until focus comes back
  let away = false;

  // the first pad with the standard layout, else any connected one
  function pick() {
    const pads = [...(nav?.getGamepads?.() ?? [])].filter((p) => p && p.connected);
    return pads.find((p) => p.mapping === 'standard') ?? pads[0] ?? null;
  }

  function poll() {
    gp = pick();
    controls = gp && !away ? mapControls(gp, mapping) : { ...NEUTRAL };
    if (!!gp !== connected) {
      connected = !!gp;
      onChange(connected);
    }
    return controls;
  }

  target?.addEventListener?.('gamepadconnected', poll);
  target?.addEventListener?.('gamepaddisconnected', poll);
  target?.addEventListener?.('blur', () => { away = true; controls = { ...NEUTRAL }; });
  target?.addEventListener?.('focus', () => { away = false; });

  return {
    poll,
    get connected() { return connected; },
    get controls() { return controls; },
    /** The pad being read (its id, mapping, raw axes and buttons), or null. */
    get raw() { return gp; },
    mapping,
  };
}
