/*
The apartment, as data. Units are feet. x: 0 (west) -> 32 (east),
z: 0 (north) -> 24 (south). Walls are axis-aligned segments (doors are gaps),
furniture is boxes/cylinders/cones, interactables link objects to data panels.

Layout v2 (from Ani's corrections): bedrooms side by side on the north
(bedroom | guest), bathroom at the east end of the hall, kitchen extended
east with a WIDE opening into the living room (dining table + chair at the
opening), futon against the living room's west wall facing the desk, AC on
the south wall right of the desk by the balcony door.
*/

export const WALL_H = 8;
export const WALL_T = 0.5;

export const WALLS = [
  // exterior
  [0, 0, 32, 0],
  [0, 24, 24, 24], [27, 24, 32, 24], // balcony-door gap x24-27
  [0, 0, 0, 24],
  [32, 0, 32, 24],
  // interior verticals
  [12, 0, 12, 12],   // bedroom | guest
  [20, 0, 20, 12],   // guest | kitchen
  [20, 12, 20, 13], [20, 15, 20, 19], // bath west wall, door gap z13-15
  [25, 12, 25, 19],  // bath | living
  // z=12: bedroom door x9-11, guest door x14-16, bath north, kitchen WIDE opening x25-30.5
  [0, 12, 9, 12], [11, 12, 14, 12], [16, 12, 20, 12],
  [20, 12, 25, 12],
  [30.5, 12, 32, 12],
  // z=19: bath south
  [20, 19, 25, 19],
  // hall (x0-20 z12-15) flows open into the living area south of it
];

// Furniture: x/z = center, w/d footprint, h height, y = base height.
// shape: box | cyl (r = w/2) | cone (r = w/2). rx = tilt radians.
export const FURNITURE = [
  // ---- bedroom (his) — bed on the EAST side, closet west ----
  { n: "bed-frame", x: 9.25, z: 4.5, w: 3.5, d: 7, h: 1.0, c: 0x6b4a2f },
  { n: "mattress", x: 9.25, z: 4.5, w: 3.2, d: 6.7, h: 0.8, y: 1.0, c: 0xf5f2ea },
  { n: "blanket", x: 9.25, z: 5.6, w: 3.3, d: 3.8, h: 0.35, y: 1.8, c: 0x5fb3a8 },
  { n: "pillow", x: 9.25, z: 2.0, w: 2.4, d: 1.2, h: 0.5, y: 1.8, c: 0xffffff },
  { n: "nightstand", x: 6.6, z: 1.5, w: 1.5, d: 1.5, h: 1.8, c: 0x6b4a2f },
  { n: "closet-doors", x: 4.5, z: 0.25, w: 5, d: 0.2, h: 7, c: 0x4a3826 },

  // ---- guest room (side by side with bedroom) ----
  { n: "guest-frame", x: 16, z: 6.5, w: 5, d: 6.5, h: 1.0, c: 0x6b4a2f },
  { n: "guest-mattress", x: 16, z: 6.5, w: 4.7, d: 6.2, h: 0.8, y: 1.0, c: 0xefe9dc },
  { n: "guest-headboard", x: 16, z: 3.1, w: 5, d: 0.3, h: 3.5, c: 0xb8964a },

  // ---- bathroom (end of the hall) ----
  { n: "vanity", x: 21.3, z: 17.2, w: 2.2, d: 1.6, h: 2.8, c: 0xe8e2d4 },
  { n: "sink", x: 21.3, z: 17.2, w: 1.2, d: 0.9, h: 0.4, y: 2.8, c: 0xffffff, shape: "cyl" },
  { n: "toilet-base", x: 24, z: 13.5, w: 1.6, d: 2.0, h: 1.4, c: 0xf4f4f4 },
  { n: "toilet-tank", x: 24, z: 12.6, w: 1.6, d: 0.6, h: 2.4, c: 0xf4f4f4 },
  { n: "shower-curtain", x: 24, z: 17.8, w: 2, d: 0.15, h: 6, c: 0xbcd3e0 },

  // ---- kitchen (extended east; wide opening to living at z=12) ----
  { n: "stove", x: 21.25, z: 2.5, w: 2.5, d: 2.5, h: 3.0, c: 0xf2f0eb },
  { n: "stove-top", x: 21.25, z: 2.5, w: 2.5, d: 2.5, h: 0.15, y: 3.0, c: 0x3a3a3e },
  { n: "fridge", x: 30.75, z: 5, w: 2.5, d: 2.5, h: 6.0, c: 0xeef0f2 },
  { n: "counter", x: 26, z: 1.2, w: 6, d: 2.4, h: 3, c: 0xb98a5a },
  { n: "counter-top", x: 26, z: 1.2, w: 6.2, d: 2.6, h: 0.15, y: 3.0, c: 0xd9d4c7 },
  { n: "sink-basin", x: 26, z: 1.2, w: 1.6, d: 1.4, h: 0.1, y: 3.15, c: 0x8a8f94 },
  { n: "uppers", x: 26, z: 1.2, w: 5, d: 1.8, h: 2.5, y: 5.5, c: 0xb98a5a },
  { n: "dining-table", x: 25.5, z: 9.5, w: 4, d: 4, h: 2.5, c: 0xa5713f, shape: "cyl" },
  { n: "dining-chair", x: 25.5, z: 12.3, w: 1.6, d: 1.6, h: 3, c: 0xa83a3a },

  // ---- living room ----
  { n: "rug", x: 27, z: 19.5, w: 8, d: 6, h: 0.06, y: 0.01, c: 0xd9c9a8 },
  { n: "desk-top", x: 30.5, z: 17.25, w: 3, d: 2.5, h: 0.2, y: 2.5, c: 0xa5713f },
  { n: "desk-panel", x: 30.5, z: 18.4, w: 3, d: 0.15, h: 2.5, c: 0x8a5f36 },
  { n: "monitor", x: 31.2, z: 16.9, w: 1.8, d: 0.25, h: 1.1, y: 2.7, c: 0x1c1c1e },
  { n: "monitor-glow", x: 31.2, z: 17.05, w: 1.6, d: 0.05, h: 0.9, y: 2.8, c: 0x9fc3e0 },
  { n: "ps5", x: 30.0, z: 16.6, w: 0.8, d: 1.1, h: 1.4, y: 2.7, c: 0x141416 },
  { n: "controller", x: 29.6, z: 17.7, w: 0.7, d: 0.5, h: 0.22, y: 2.7, c: 0x2a2a2e },
  { n: "headphones", x: 31.3, z: 18.0, w: 0.9, d: 0.7, h: 0.3, y: 2.7, c: 0x7c3aed },
  { n: "laptop-base", x: 29.7, z: 16.4, w: 1.4, d: 1.0, h: 0.1, y: 2.7, c: 0x9aa0a6 },
  { n: "laptop-screen", x: 29.7, z: 16.0, w: 1.4, d: 0.08, h: 0.9, y: 2.75, c: 0x3c4043, rx: -0.35 },
  { n: "bottle", x: 30.3, z: 17.9, w: 0.5, d: 0.5, h: 1.0, y: 2.7, c: 0x2563eb, shape: "cyl" },
  { n: "chair-seat", x: 29.0, z: 17.5, w: 1.8, d: 1.8, h: 0.4, y: 1.6, c: 0x333336 },
  { n: "chair-back", x: 29.0, z: 18.3, w: 1.8, d: 0.35, h: 2.2, y: 1.8, c: 0x333336 },
  // futon: pushed against the west wall (opposite the desk), facing east
  // futon: against the south wall west of the balcony door, facing the desk
  { n: "futon-base", x: 21.5, z: 22.3, w: 5, d: 2.6, h: 1.4, c: 0x232326 },
  { n: "futon-back", x: 21.5, z: 23.4, w: 5, d: 0.6, h: 2.6, c: 0x232326 },
  { n: "plant-pot", x: 18.3, z: 22.8, w: 1.6, d: 1.6, h: 1.2, c: 0x2b2b2e, shape: "cyl" },
  { n: "plant-1", x: 18.0, z: 22.6, w: 0.7, d: 0.7, h: 2.6, y: 1.2, c: 0x3f7d3a, shape: "cone" },
  { n: "plant-2", x: 18.6, z: 23.0, w: 0.6, d: 0.6, h: 2.1, y: 1.2, c: 0x4c8f45, shape: "cone" },
  { n: "plant-3", x: 18.3, z: 22.7, w: 0.5, d: 0.5, h: 3.0, y: 1.2, c: 0x35702f, shape: "cone" },
  { n: "red-chair", x: 24.5, z: 16.5, w: 1.8, d: 1.8, h: 2.8, c: 0xa83a3a },
  { n: "lamp-pole", x: 28.5, z: 14.5, w: 0.25, d: 0.25, h: 6, c: 0x2b2b2e, shape: "cyl" },
  { n: "lamp-shade", x: 28.5, z: 14.5, w: 1.6, d: 1.6, h: 1.0, y: 6, c: 0xe8d9a8, shape: "cone" },
  { n: "balcony-frame", x: 25.5, z: 23.9, w: 3.2, d: 0.25, h: 6.5, y: 0.5, c: 0x4a3a28 },
  { n: "balcony-glass", x: 25.5, z: 23.9, w: 2.8, d: 0.1, h: 6.0, y: 0.7, c: 0xa8c8d8 },
  // AC: south wall, right of the desk, next to the balcony door
  { n: "wall-ac", x: 28.5, z: 23.7, w: 3, d: 0.9, h: 1.4, y: 5.5, c: 0xd8d8d8 },
  { n: "shoe-rack", x: 31, z: 22.5, w: 1.5, d: 3, h: 3.5, c: 0x3a3a3a },
  { n: "main-door", x: 31.9, z: 20.5, w: 0.25, d: 3, h: 7, c: 0x4a3a28 },
];

// Walk-up-and-press-E objects. x/z is the object; the player just needs to
// get within r of it (they can't stand inside furniture, the radius covers it).
export const INTERACTABLES = [
  { id: "controller", label: "Pick up controller", x: 29.6, z: 17.7, r: 2.6, kind: "games" },
  { id: "headphones", label: "Put on headphones", x: 31.3, z: 18.0, r: 2.6, kind: "music" },
  { id: "laptop", label: "Open laptop", x: 29.7, z: 16.4, r: 2.6, kind: "work" },
  { id: "bottle", label: "Grab water bottle", x: 30.3, z: 17.9, r: 2.6, kind: "gym" },
  { id: "stove", label: "Check the stove", x: 21.25, z: 2.5, r: 2.8, kind: "meals-today" },
  { id: "fridge", label: "Open the fridge", x: 30.75, z: 5, r: 2.8, kind: "meals-past" },
  { id: "nightstand", label: "Open nightstand drawer", x: 6.6, z: 1.5, r: 2.6, kind: "diary" },
];

export const SPAWN = { x: 26, z: 18 };
