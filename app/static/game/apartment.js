/*
The apartment, as data. Units are feet. x: 0 (west) -> 32 (east),
z: 0 (north) -> 24 (south). Everything the world builder needs:
walls (axis-aligned segments, doors are gaps), furniture pieces, and
the interactable objects with their data mapping.

Layout mirrors the floor-plan sketch: bedroom 12x12 NW, bathroom N,
kitchen NE, entry E, hallway, guest room SW, living room E/S.
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
  [12, 0, 12, 12],   // bedroom | bathroom
  [18, 0, 18, 12],   // bathroom | kitchen
  [27, 0, 27, 12],   // kitchen | entry
  [12, 15, 12, 24],  // guest | living
  // z=12: doors -> bedroom x9-11, bath x14-16, kitchen x23-25, entry x28-30
  [0, 12, 9, 12], [11, 12, 14, 12], [16, 12, 18, 12],
  [18, 12, 23, 12], [25, 12, 27, 12],
  [27, 12, 28, 12], [30, 12, 32, 12],
  // z=15: guest north wall, door x4-6
  [0, 15, 4, 15], [6, 15, 12, 15],
  // x=18 z12-15 and z=15 x12-18 stay open: hall flows into living
];

// Furniture: x/z = center, w/d footprint, h height, y = base height.
// shape: box | cyl (r = w/2) | cone (r = w/2). rx = tilt radians (laptop screens).
export const FURNITURE = [
  // ---- bedroom ----
  { n: "bed-frame", x: 2.75, z: 4.5, w: 3.5, d: 7, h: 1.0, c: 0x6b4a2f },
  { n: "mattress", x: 2.75, z: 4.5, w: 3.2, d: 6.7, h: 0.8, y: 1.0, c: 0xf5f2ea },
  { n: "blanket", x: 2.75, z: 5.6, w: 3.3, d: 3.8, h: 0.35, y: 1.8, c: 0x5fb3a8 },
  { n: "pillow", x: 2.75, z: 2.0, w: 2.4, d: 1.2, h: 0.5, y: 1.8, c: 0xffffff },
  { n: "nightstand", x: 5.6, z: 1.5, w: 1.5, d: 1.5, h: 1.8, c: 0x6b4a2f },
  { n: "closet-doors", x: 8.5, z: 0.25, w: 5, d: 0.2, h: 7, c: 0x4a3826 },

  // ---- bathroom ----
  { n: "vanity", x: 16.5, z: 2.0, w: 3, d: 1.8, h: 2.8, c: 0xe8e2d4 },
  { n: "sink", x: 16.5, z: 2.0, w: 1.4, d: 1.0, h: 0.4, y: 2.8, c: 0xffffff, shape: "cyl" },
  { n: "toilet-base", x: 13.5, z: 2.0, w: 1.8, d: 2.2, h: 1.4, c: 0xf4f4f4 },
  { n: "toilet-tank", x: 13.5, z: 1.0, w: 1.8, d: 0.7, h: 2.4, c: 0xf4f4f4 },
  { n: "shower-curtain", x: 13, z: 10.5, w: 3, d: 0.15, h: 6, c: 0xbcd3e0 },

  // ---- kitchen ----
  { n: "stove", x: 19.25, z: 2.25, w: 2.5, d: 2.5, h: 3.0, c: 0xf2f0eb },
  { n: "stove-top", x: 19.25, z: 2.25, w: 2.5, d: 2.5, h: 0.15, y: 3.0, c: 0x3a3a3e },
  { n: "fridge", x: 25.75, z: 2.25, w: 2.5, d: 2.5, h: 6.0, c: 0xeef0f2 },
  { n: "counter", x: 26, z: 8, w: 2, d: 6, h: 3, c: 0xb98a5a },
  { n: "counter-top", x: 26, z: 8, w: 2.2, d: 6.2, h: 0.15, y: 3.0, c: 0xd9d4c7 },
  { n: "sink-basin", x: 26, z: 7, w: 1.4, d: 1.8, h: 0.1, y: 3.15, c: 0x8a8f94 },
  { n: "uppers", x: 26, z: 8, w: 1.6, d: 6, h: 2.5, y: 5.5, c: 0xb98a5a },
  { n: "dining-table", x: 22.5, z: 8.5, w: 4, d: 4, h: 2.5, c: 0xa5713f, shape: "cyl" },
  { n: "dining-chair", x: 22.5, z: 11.2, w: 1.6, d: 1.6, h: 3, c: 0xa83a3a },

  // ---- entry ----
  { n: "shoe-rack", x: 31, z: 3.5, w: 1.5, d: 3, h: 3.5, c: 0x3a3a3a },
  { n: "main-door", x: 31.9, z: 6.5, w: 0.25, d: 3, h: 7, c: 0x4a3a28 },

  // ---- guest room ----
  { n: "guest-frame", x: 6, z: 19.5, w: 5, d: 6.5, h: 1.0, c: 0x6b4a2f },
  { n: "guest-mattress", x: 6, z: 19.5, w: 4.7, d: 6.2, h: 0.8, y: 1.0, c: 0xefe9dc },
  { n: "guest-headboard", x: 6, z: 16.1, w: 5, d: 0.3, h: 3.5, c: 0xb8964a },
  { n: "guest-window", x: 6, z: 23.85, w: 4, d: 0.2, h: 3, y: 3, c: 0xbcd3e0 },

  // ---- living room ----
  { n: "rug", x: 24, z: 19, w: 9, d: 7, h: 0.06, y: 0.01, c: 0xd9c9a8 },
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
  { n: "futon-base", x: 22.5, z: 21.5, w: 5.5, d: 2.6, h: 1.4, c: 0x232326 },
  { n: "futon-back", x: 22.5, z: 22.9, w: 5.5, d: 0.6, h: 2.6, c: 0x232326 },
  { n: "plant-pot", x: 26.5, z: 21, w: 1.6, d: 1.6, h: 1.2, c: 0x2b2b2e, shape: "cyl" },
  { n: "plant-1", x: 26.2, z: 20.8, w: 0.7, d: 0.7, h: 2.6, y: 1.2, c: 0x3f7d3a, shape: "cone" },
  { n: "plant-2", x: 26.8, z: 21.2, w: 0.6, d: 0.6, h: 2.1, y: 1.2, c: 0x4c8f45, shape: "cone" },
  { n: "plant-3", x: 26.5, z: 20.9, w: 0.5, d: 0.5, h: 3.0, y: 1.2, c: 0x35702f, shape: "cone" },
  { n: "red-chair", x: 27.8, z: 21.0, w: 1.8, d: 1.8, h: 2.8, c: 0xa83a3a },
  { n: "lamp-pole", x: 21.5, z: 16, w: 0.25, d: 0.25, h: 6, c: 0x2b2b2e, shape: "cyl" },
  { n: "lamp-shade", x: 21.5, z: 16, w: 1.6, d: 1.6, h: 1.0, y: 6, c: 0xe8d9a8, shape: "cone" },
  { n: "balcony-frame", x: 25.5, z: 23.9, w: 3.2, d: 0.25, h: 6.5, y: 0.5, c: 0x4a3a28 },
  { n: "balcony-glass", x: 25.5, z: 23.9, w: 2.8, d: 0.1, h: 6.0, y: 0.7, c: 0xa8c8d8 },
  { n: "wall-ac", x: 21, z: 12.3, w: 3, d: 0.9, h: 1.4, y: 5.5, c: 0xd8d8d8 },
];

// Walk-up-and-press-E objects. kind selects the panel in panels.js.
// Walk-up-and-press-E objects. x/z is the object; the player just needs to
// get within r of it (they can't stand inside furniture, the radius covers it).
export const INTERACTABLES = [
  { id: "controller", label: "Pick up controller", x: 29.6, z: 17.7, r: 2.6, kind: "games" },
  { id: "headphones", label: "Put on headphones", x: 31.3, z: 18.0, r: 2.6, kind: "music" },
  { id: "laptop", label: "Open laptop", x: 29.7, z: 16.4, r: 2.6, kind: "work" },
  { id: "bottle", label: "Grab water bottle", x: 30.3, z: 17.9, r: 2.6, kind: "gym" },
  { id: "stove", label: "Check the stove", x: 19.25, z: 2.25, r: 2.8, kind: "meals-today" },
  { id: "fridge", label: "Open the fridge", x: 25.75, z: 2.25, r: 2.8, kind: "meals-past" },
  { id: "nightstand", label: "Open nightstand drawer", x: 5.6, z: 1.5, r: 2.6, kind: "diary" },
];

export const SPAWN = { x: 25, z: 19.5 };
