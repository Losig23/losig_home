/*
The apartment, as data — built from the dimensioned floor plan (v3).
Units are feet. x: 0 (west) -> 32 (east), z: 0 (north) -> 20 (south);
balcony extends to z=25 (visual only).

  z=0  ┌───────┬───────┬───────────────────┐
       │Closet │ Bath  │      Kitchen      │
       │12x6   │ 8x8   │      12x8         │
  z=8  ├───────┼───┬───┴─────┬─────────────┤
       │       │   │ Hallway │ Living room │
       │My room│   │         │ 12 ft incl. │
       │12 ft  │ G │ 8x4     │    desk     │
       │wide   │ u │         │             │
       │       │ e │         │             │
  z=20 └───────┴───┴─────────┴─────────────┘
                     │ Balcony (5 ft)  │
                     └─────────────────┘

Walls are axis-aligned segments (doors are gaps). Furniture is
boxes/cylinders/cones. Interactables link objects to data panels.
*/

export const WALL_H = 8;
export const WALL_T = 0.5;

export const WALLS = [
  // exterior
  [0, 0, 32, 0],
  [0, 20, 24, 20], [29, 20, 32, 20], // balcony-door gap x24-29
  [0, 0, 0, 20],
  [32, 0, 32, 20],
  // closet south / my-room north
  [0, 6, 12, 6],
  // my-room east wall (door gap z10-12 into hallway)
  [12, 6, 12, 10], [12, 12, 12, 20],
  // bath west
  [12, 0, 12, 8],
  // bath east / kitchen west
  [20, 0, 20, 8],
  // bath south (door gap x16-18 into hallway)
  [12, 8, 16, 8], [18, 8, 20, 8],
  // kitchen south (WIDE opening x24-30 into living room)
  [20, 8, 24, 8], [30, 8, 32, 8],
  // guest north (door gap x14-16 from hallway)
  [12, 12, 14, 12], [16, 12, 20, 12],
  // hallway east wall (door gap z9-11 into living room)
  [20, 8, 20, 9], [20, 11, 20, 20],
];

// Furniture: x/z = center, w/d footprint, h height, y = base height.
// shape: box | cyl (r = w/2) | cone (r = w/2). rx = tilt radians.
export const FURNITURE = [
  // ---- my room (12 ft wide; bed east side, green blanket) ----
  { n: "bed-frame", x: 9, z: 13, w: 3.5, d: 7, h: 1.0, c: 0x6b4a2f },
  { n: "mattress", x: 9, z: 13, w: 3.2, d: 6.7, h: 0.8, y: 1.0, c: 0xf5f2ea },
  { n: "blanket", x: 9, z: 14, w: 3.3, d: 3.8, h: 0.35, y: 1.8, c: 0x86d8cc },
  { n: "pillow", x: 9, z: 10.5, w: 2.4, d: 1.2, h: 0.5, y: 1.8, c: 0xffffff },
  { n: "nightstand", x: 6.5, z: 8, w: 1.5, d: 1.5, h: 1.8, c: 0x6b4a2f },
  { n: "room-window", x: 6, z: 19.9, w: 4, d: 0.2, h: 3, y: 3, c: 0xbcd3e0 },

  // ---- closet (separate room; sliding doors, not enterable) ----
  { n: "closet-door-l", x: 4, z: 0.25, w: 3.5, d: 0.2, h: 7, c: 0x4a3826 },
  { n: "closet-door-r", x: 8, z: 0.25, w: 3.5, d: 0.2, h: 7, c: 0x54432e },

  // ---- bath (tub west, toilet + vanity east) ----
  { n: "tub", x: 13.75, z: 4, w: 2.5, d: 6, h: 2.0, c: 0xf4f4f4 },
  { n: "toilet-base", x: 18.5, z: 2.5, w: 1.6, d: 2.0, h: 1.4, c: 0xf4f4f4 },
  { n: "toilet-tank", x: 18.5, z: 1.6, w: 1.6, d: 0.6, h: 2.4, c: 0xf4f4f4 },
  { n: "vanity", x: 18.5, z: 5.5, w: 2, d: 1.6, h: 2.8, c: 0xe8e2d4 },
  { n: "sink", x: 18.5, z: 5.5, w: 1.2, d: 0.9, h: 0.4, y: 2.8, c: 0xffffff, shape: "cyl" },

  // ---- kitchen (sink north, stove west, fridge mid, table east, entry NE) ----
  { n: "counter", x: 26, z: 1, w: 10, d: 2, h: 3, c: 0xb98a5a },
  { n: "counter-top", x: 26, z: 1, w: 10.2, d: 2.2, h: 0.15, y: 3.0, c: 0xd9d4c7 },
  { n: "sink-basin", x: 23, z: 1, w: 1.6, d: 1.4, h: 0.1, y: 3.15, c: 0x8a8f94 },
  { n: "uppers", x: 26, z: 1, w: 8, d: 1.8, h: 2.5, y: 5.5, c: 0xb98a5a },
  { n: "stove", x: 21, z: 5, w: 2, d: 2.5, h: 3.0, c: 0xf2f0eb },
  { n: "stove-top", x: 21, z: 5, w: 2, d: 2.5, h: 0.15, y: 3.0, c: 0x3a3a3e },
  { n: "fridge", x: 26, z: 5, w: 2.5, d: 2.5, h: 6.0, c: 0xeef0f2 },
  { n: "dining-table", x: 29.3, z: 4.8, w: 3, d: 3, h: 2.5, c: 0xa5713f, shape: "cyl" },
  { n: "dchair-s", x: 29.3, z: 7.0, w: 1.2, d: 1.2, h: 2.5, c: 0xc0392b },
  { n: "dchair-w", x: 27.4, z: 4.8, w: 1.2, d: 1.2, h: 2.5, c: 0xc0392b },
  { n: "dchair-e", x: 31.2, z: 4.8, w: 1.2, d: 1.2, h: 2.5, c: 0xc0392b },
  { n: "main-door", x: 30, z: 0.25, w: 2.5, d: 0.25, h: 7, c: 0x4a3a28 },
  { n: "shoe-rack", x: 31.25, z: 4, w: 1.5, d: 2.5, h: 3.5, c: 0x3a3a3a },

  // ---- hallway ----
  { n: "hall-rug", x: 16, z: 10, w: 3, d: 2.5, h: 0.06, y: 0.01, c: 0xd9c9a8 },

  // ---- guest room (8x8) ----
  { n: "guest-frame", x: 16, z: 16.5, w: 5, d: 6, h: 1.0, c: 0x6b4a2f },
  { n: "guest-mattress", x: 16, z: 16.5, w: 4.7, d: 5.7, h: 0.8, y: 1.0, c: 0xefe9dc },
  { n: "guest-headboard", x: 13.7, z: 16.5, w: 0.3, d: 6, h: 3.5, c: 0xb8964a },
  { n: "guest-window", x: 16, z: 19.9, w: 4, d: 0.2, h: 3, y: 3, c: 0xbcd3e0 },

  // ---- living room (12 ft incl. desk) ----
  { n: "rug", x: 26, z: 15, w: 7, d: 5, h: 0.06, y: 0.01, c: 0xd9c9a8 },
  // futon: west side, facing the desk (east)
  { n: "futon-base", x: 22.5, z: 14.5, w: 2.6, d: 5, h: 1.4, c: 0x232326 },
  { n: "futon-back", x: 22.2, z: 14.5, w: 0.6, d: 5, h: 2.6, c: 0x232326 },
  // armchair (circle on plan)
  { n: "armchair", x: 26, z: 14, w: 2, d: 2, h: 2.5, c: 0x8a6f4d, shape: "cyl" },
  // desk strip on the east wall: headset, laptop, controller, PS5 north->south
  { n: "desk-top", x: 30.75, z: 14, w: 2.5, d: 7, h: 0.2, y: 2.5, c: 0xa5713f },
  { n: "desk-leg-n", x: 30.75, z: 10.8, w: 2.5, d: 0.3, h: 2.5, c: 0x8a5f36 },
  { n: "desk-leg-s", x: 30.75, z: 17.2, w: 2.5, d: 0.3, h: 2.5, c: 0x8a5f36 },
  { n: "headset", x: 30.75, z: 10.8, w: 0.9, d: 0.7, h: 0.3, y: 2.7, c: 0x7c3aed },
  { n: "laptop-base", x: 30.75, z: 12.8, w: 1.4, d: 1.0, h: 0.1, y: 2.7, c: 0x9aa0a6 },
  { n: "laptop-screen", x: 30.75, z: 12.4, w: 1.4, d: 0.08, h: 0.9, y: 2.75, c: 0x3c4043, rx: -0.35 },
  { n: "bottle", x: 30.2, z: 13.8, w: 0.5, d: 0.5, h: 1.0, y: 2.7, c: 0x2563eb, shape: "cyl" },
  { n: "controller", x: 30.75, z: 15.2, w: 0.7, d: 0.5, h: 0.22, y: 2.7, c: 0x2a2a2e },
  { n: "ps5", x: 30.75, z: 17, w: 0.8, d: 1.1, h: 1.4, y: 2.7, c: 0x141416 },
  { n: "monitor", x: 31.2, z: 16.2, w: 0.25, d: 1.6, h: 1.1, y: 2.7, c: 0x1c1c1e },
  { n: "chair-seat", x: 29, z: 14, w: 1.8, d: 1.8, h: 0.4, y: 1.6, c: 0x333336 },
  { n: "chair-back", x: 29, z: 14.9, w: 1.8, d: 0.35, h: 2.2, y: 1.8, c: 0x333336 },
  // AC: south-east, by the balcony door
  { n: "wall-ac", x: 30.75, z: 19.2, w: 2.5, d: 0.8, h: 1.2, y: 5.5, c: 0xd8d8d8 },
  { n: "balcony-frame", x: 26.5, z: 19.9, w: 3.5, d: 0.25, h: 6.5, y: 0.5, c: 0x4a3a28 },
  { n: "balcony-glass", x: 26.5, z: 19.9, w: 3, d: 0.1, h: 6.0, y: 0.7, c: 0xa8c8d8 },
  { n: "plant-pot", x: 22.5, z: 18.5, w: 1.6, d: 1.6, h: 1.2, c: 0x2b2b2e, shape: "cyl" },
  { n: "plant-1", x: 22.2, z: 18.3, w: 0.7, d: 0.7, h: 2.6, y: 1.2, c: 0x3f7d3a, shape: "cone" },
  { n: "plant-2", x: 22.8, z: 18.7, w: 0.6, d: 0.6, h: 2.1, y: 1.2, c: 0x4c8f45, shape: "cone" },
  { n: "lamp-pole", x: 24.5, z: 18.5, w: 0.25, d: 0.25, h: 6, c: 0x2b2b2e, shape: "cyl" },
  { n: "lamp-shade", x: 24.5, z: 18.5, w: 1.6, d: 1.6, h: 1.0, y: 6, c: 0xe8d9a8, shape: "cone" },

  // ---- balcony (visual only, 5 ft deep, locked) ----
  { n: "balcony-floor", x: 27.5, z: 22.5, w: 7, d: 5, h: 0.2, y: 0, c: 0x9a938a },
  { n: "balcony-rail", x: 27.5, z: 24.8, w: 7, d: 0.2, h: 3, y: 0.2, c: 0x4a3a28 },
];

// Walk-up-and-press-E objects. x/z is the object; the player just needs to
// get within r of it (they can't stand inside furniture, the radius covers it).
export const INTERACTABLES = [
  { id: "headset", label: "Put on headset", x: 30.75, z: 10.8, r: 2.6, kind: "music" },
  { id: "laptop", label: "Open laptop", x: 30.75, z: 12.8, r: 2.6, kind: "work" },
  { id: "bottle", label: "Grab water bottle", x: 30.2, z: 13.8, r: 2.6, kind: "gym" },
  { id: "controller", label: "Pick up controller", x: 30.75, z: 15.2, r: 2.6, kind: "games" },
  { id: "stove", label: "Check the stove", x: 21, z: 5, r: 2.8, kind: "meals-today" },
  { id: "fridge", label: "Open the fridge", x: 26, z: 5, r: 2.8, kind: "meals-past" },
  { id: "nightstand", label: "Open nightstand drawer", x: 6.5, z: 8, r: 2.6, kind: "diary" },
];

export const SPAWN = { x: 26, z: 16 };

// Floating room labels (dollhouse pills), x/z centers, y height.
export const LABELS = [
  { t: "CLOSET", x: 6, z: 3 },
  { t: "BATH", x: 16, z: 4 },
  { t: "KITCHEN", x: 26, z: 3 },
  { t: "MY ROOM", x: 5, z: 14 },
  { t: "HALLWAY", x: 16, z: 10 },
  { t: "GUEST ROOM", x: 16, z: 16.5 },
  { t: "LIVING ROOM", x: 25, z: 16 },
  { t: "BALCONY", x: 27.5, z: 22.5 },
];
