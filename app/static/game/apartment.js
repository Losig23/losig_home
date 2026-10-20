/*
The apartment, as data — v4, rebuilt from the cleaned-up floor plan
(sketch -> 2D plan -> 3D model) and the room photos.
Units are feet. x: 0 (west) -> 32 (east), z: 0 (north) -> 20 (south);
balcony extends to z=25 (visual only).

  z=0   ┌──────────┬──┬──────┬──────────────────┬┬─────┐
        │  Closet  │T │ Bath │ Kitchen  ·  Dining││Entry│  <- main entrance
        │ (sliding │u │      │ counter / sink    │└─┐  │     x 29.7-31.8
  z=6   ├──doors)──┤b ├─door─┼──stove─fridge─┐   │  │  │
        │          ├──┘      │               │   shoes │
        │          door      │   Hallway     └─open────┤
        │ My room  │         │                         │
  z=12  │          ├────door─┴──┐   Living room        │
        │          │ Guest room │   futon     desk ->  │
        │  bed     │  bed  bins │                      │
  z=20  └──win─────┴────win─────┴──blinds─[door]──AC───┘
                                 │   Balcony (5 ft)    │
                                 └─────────────────────┘

Walls are axis-aligned segments [x1, z1, x2, z2] (doors are gaps).
Furniture is boxes/cylinders/cones. Interactables link objects to data panels.
*/

export const WALL_H = 8;
export const WALL_T = 0.5;

export const WALLS = [
  // ---- exterior ----
  [0, 0, 29.7, 0], [31.8, 0, 32, 0],          // north; main entrance gap x29.7-31.8
  [0, 20, 24.7, 20], [27.1, 20, 32, 20],      // south; balcony door gap x24.7-27.1
  [0, 0, 0, 20],
  [32, 0, 32, 20],

  // ---- closet / tub alcove ----
  [0, 6, 8.85, 6],                            // closet front (sliding doors on this face)
  [8.85, 0, 8.85, 6],                         // tub alcove west (reaches into the closet)
  [8.85, 6, 12, 6],                           // tub alcove south

  // ---- my room east wall (door gap z7.5-10.3 into the hallway) ----
  [12, 6, 12, 7.5], [12, 10.3, 12, 20],

  // ---- bath ----
  [12, 6.5, 13, 6.5], [15.5, 6.5, 16.5, 6.5], // bath south; door gap x13-15.5
  [16.5, 0, 16.5, 6.5],                       // bath east / kitchen west

  // ---- kitchen south (behind stove + fridge), open to the living room past the fridge ----
  [16.5, 6.5, 23.3, 6.5],

  // ---- guest room ----
  [12, 12, 17, 12], [19.5, 12, 20, 12],       // guest north; door gap x17-19.5
  [20, 12, 20, 20],                           // guest east / living room west

  // ---- short wall between entry and kitchen ----
  [29.5, 0, 29.5, 2.25],
];

// Floor zones drawn over the carpet base: [centerX, centerZ, w, d, color].
export const FLOORS = [
  [14.25, 3.25, 4.5, 6.5, 0xcfd4d6], // bath tile
  [10.43, 3, 3.15, 6, 0xcfd4d6],     // tub alcove tile
];

// Furniture: x/z = center, w/d footprint, h height, y = base height.
// shape: box | cyl (r = w/2) | cone (r = w/2). rx = tilt radians.
// Pieces with y >= 4 (lamp heads, shades) don't block walking.
// wall: true = mounted on/in a wall; clipped to the cutaway wall height (world.js).
export const FURNITURE = [
  // ---- closet (not enterable; two sliding doors) ----
  { n: "closet-door-l", x: 2.8, z: 6.33, w: 3.6, d: 0.15, h: 6.8, c: 0x5a3622, wall: true },
  { n: "closet-door-r", x: 6.0, z: 6.46, w: 3.6, d: 0.15, h: 6.8, c: 0x4a2c1c, wall: true },

  // ---- my room: brass bed under the south window, teal comforter ----
  { n: "bed-frame", x: 5.4, z: 16.4, w: 5.2, d: 6.4, h: 1.1, c: 0x5e5a55 },
  { n: "mattress", x: 5.4, z: 16.4, w: 5.1, d: 6.3, h: 0.8, y: 1.1, c: 0xf5f2ea },
  { n: "blanket", x: 5.7, z: 15.2, w: 4.0, d: 3.0, h: 0.4, y: 1.9, c: 0x5fc6be },
  { n: "pillow", x: 4.3, z: 18.7, w: 2.3, d: 1.1, h: 0.4, y: 1.9, c: 0x4d5156 },
  { n: "headboard", x: 5.4, z: 19.65, w: 5.2, d: 0.15, h: 4.2, c: 0xc9a24b },
  { n: "nightstand", x: 9.1, z: 18.8, w: 1.6, d: 1.4, h: 2.0, c: 0x6b4a2f },
  { n: "room-window", x: 5.75, z: 20, w: 7.5, d: 0.6, h: 3.4, y: 3, c: 0xbcd3e0, wall: true },

  // ---- bath: tub on the west (in the closet notch), toilet + vanity east ----
  { n: "tub", x: 10.45, z: 3.0, w: 2.7, d: 5.6, h: 1.6, c: 0xf4f4f4 },
  { n: "tub-basin", x: 10.45, z: 3.0, w: 2.1, d: 5.0, h: 0.05, y: 1.6, c: 0xdfe6ea },
  { n: "shower-curtain", x: 11.85, z: 2.4, w: 0.08, d: 4.0, h: 4.9, y: 1.7, c: 0x93a9cb, wall: true },
  { n: "toilet-base", x: 15.4, z: 1.5, w: 1.4, d: 1.8, h: 1.4, c: 0xf4f4f4 },
  { n: "toilet-tank", x: 15.4, z: 0.6, w: 1.6, d: 0.6, h: 2.6, c: 0xf4f4f4 },
  { n: "vanity", x: 15.5, z: 3.7, w: 1.6, d: 2.6, h: 2.8, c: 0xe8e2d4 },
  { n: "sink", x: 15.4, z: 3.7, w: 1.1, d: 1.1, h: 0.15, y: 2.8, c: 0xffffff, shape: "cyl" },
  { n: "mirror", x: 16.2, z: 3.7, w: 0.08, d: 2.2, h: 2.4, y: 4.0, c: 0xc9d6dd, wall: true },

  // ---- kitchen: sink counter on the north wall, stove + fridge facing it ----
  { n: "counter", x: 20.4, z: 1.2, w: 7.3, d: 2.0, h: 2.9, c: 0xb98a5a },
  { n: "counter-top", x: 20.4, z: 1.2, w: 7.5, d: 2.2, h: 0.15, y: 2.9, c: 0xe6e6e3 },
  { n: "dishwasher", x: 17.65, z: 2.25, w: 1.9, d: 0.06, h: 2.7, y: 0.1, c: 0xeee6d2 },
  { n: "sink-basin", x: 20.4, z: 1.2, w: 2.4, d: 1.3, h: 0.08, y: 3.05, c: 0x8a8f94 },
  { n: "uppers-n", x: 20.3, z: 0.75, w: 7.4, d: 1.2, h: 2.6, y: 4.6, c: 0xb98a5a, wall: true },
  { n: "stove", x: 18.75, z: 5.25, w: 2.5, d: 2.1, h: 3.0, c: 0xf2f0eb },
  { n: "stove-top", x: 18.75, z: 5.25, w: 2.5, d: 2.1, h: 0.12, y: 3.0, c: 0x2a2a2e },
  { n: "stove-back", x: 18.75, z: 6.1, w: 2.5, d: 0.3, h: 0.9, y: 3.0, c: 0xf2f0eb },
  { n: "fridge", x: 21.7, z: 5.0, w: 2.6, d: 2.6, h: 5.6, c: 0xeef0f2 },
  { n: "uppers-s", x: 20.2, z: 5.75, w: 7.2, d: 1.2, h: 1.9, y: 6.0, c: 0xb98a5a, wall: true },
  { n: "trash-can", x: 24.6, z: 0.8, w: 1.0, d: 1.0, h: 2.2, c: 0x232326, shape: "cyl" },

  // ---- dining: round table, red chair, drawer tower ----
  { n: "dining-table", x: 26.5, z: 3.5, w: 3.6, d: 3.6, h: 2.5, c: 0x9c6b3e, shape: "cyl" },
  { n: "dchair-s", x: 26.5, z: 5.6, w: 1.4, d: 1.4, h: 1.7, c: 0x8c2c2d },
  { n: "dchair-s-back", x: 26.5, z: 6.25, w: 1.4, d: 0.15, h: 1.8, y: 1.7, c: 0x8c2c2d },
  { n: "drawer-tower", x: 28.8, z: 0.85, w: 1.0, d: 1.1, h: 2.8, c: 0x202224 },
  { n: "produce-box", x: 28.8, z: 0.85, w: 1.1, d: 1.2, h: 0.8, y: 2.8, c: 0xc49a6c },

  // ---- entry: front door, mat, shoe rack, tree lamp, ironing board ----
  { n: "main-door", x: 30.75, z: 0.3, w: 2.1, d: 0.2, h: 6.8, c: 0x3b2419, wall: true },
  { n: "door-mat", x: 30.6, z: 1.6, w: 1.6, d: 1.1, h: 0.04, y: 0.01, c: 0x5a5048 },
  { n: "shoe-rack", x: 31.4, z: 5.2, w: 0.7, d: 3.4, h: 3.4, c: 0x202224 },
  { n: "shoe-tray", x: 31.4, z: 4.6, w: 0.7, d: 2.0, h: 0.5, y: 3.4, c: 0xf5f5f5 },
  { n: "tree-lamp", x: 28.9, z: 7.9, w: 0.2, d: 0.2, h: 5.8, c: 0x202224, shape: "cyl" },
  { n: "tree-lamp-1", x: 29.25, z: 8.05, w: 0.55, d: 0.55, h: 0.7, y: 4.4, c: 0x202224, shape: "cone" },
  { n: "tree-lamp-2", x: 28.6, z: 7.6, w: 0.55, d: 0.55, h: 0.7, y: 5.0, c: 0x202224, shape: "cone" },
  { n: "tree-lamp-3", x: 29.05, z: 7.55, w: 0.55, d: 0.55, h: 0.7, y: 5.5, c: 0x202224, shape: "cone" },
  { n: "ironing-board", x: 31.15, z: 9.35, w: 1.1, d: 3.1, h: 0.12, y: 2.9, c: 0xe9e3d6 },
  { n: "ironing-legs", x: 31.15, z: 9.35, w: 0.1, d: 2.0, h: 2.9, c: 0xc7cacc },

  // ---- living room: futon facing the desk, plant, arc lamp ----
  { n: "futon-frame", x: 21.75, z: 16.0, w: 2.5, d: 5.0, h: 0.9, c: 0x202224 },
  { n: "futon-seat", x: 21.85, z: 16.0, w: 2.3, d: 5.0, h: 0.6, y: 0.9, c: 0x1e1f22 },
  { n: "futon-back", x: 20.75, z: 16.0, w: 0.6, d: 5.0, h: 2.0, y: 1.4, c: 0x1e1f22 },
  { n: "towel", x: 20.85, z: 16.1, w: 0.7, d: 1.1, h: 1.0, y: 2.5, c: 0xf1efea },
  { n: "plant-pot", x: 20.9, z: 12.8, w: 1.0, d: 1.0, h: 1.1, c: 0x202224, shape: "cyl" },
  { n: "plant-1", x: 20.8, z: 12.7, w: 0.6, d: 0.6, h: 2.6, y: 1.1, c: 0x3f7e3a, shape: "cone" },
  { n: "plant-2", x: 21.05, z: 12.95, w: 0.5, d: 0.5, h: 2.1, y: 1.1, c: 0x4c8f45, shape: "cone" },
  { n: "arc-lamp", x: 20.75, z: 19.2, w: 0.12, d: 0.12, h: 5.4, c: 0xc7cacc, shape: "cyl" },
  { n: "arc-lamp-shade", x: 21.2, z: 19.2, w: 0.8, d: 0.8, h: 0.5, y: 5.0, c: 0xf4f2ec, shape: "cone" },

  // desk on the east wall, north -> south: headset, bottle, controller (by monitor), laptop
  { n: "desk-top", x: 30.9, z: 14.3, w: 1.8, d: 6.0, h: 0.12, y: 2.4, c: 0xc9a877 },
  { n: "desk-leg-n", x: 30.9, z: 11.4, w: 1.8, d: 0.12, h: 2.4, c: 0x202224 },
  { n: "desk-leg-s", x: 30.9, z: 17.2, w: 1.8, d: 0.12, h: 2.4, c: 0x202224 },
  { n: "monitor", x: 31.45, z: 14.3, w: 0.15, d: 3.2, h: 1.65, y: 2.95, c: 0x101215 },
  { n: "monitor-stand", x: 31.45, z: 14.3, w: 0.3, d: 0.4, h: 0.45, y: 2.52, c: 0x202224 },
  { n: "headset", x: 30.6, z: 12.0, w: 0.7, d: 0.8, h: 0.35, y: 2.52, c: 0x7c3aed },
  { n: "bottle", x: 30.4, z: 13.1, w: 0.35, d: 0.35, h: 0.9, y: 2.52, c: 0x2563eb, shape: "cyl" },
  { n: "controller", x: 30.55, z: 15.0, w: 0.6, d: 0.45, h: 0.15, y: 2.52, c: 0xf0f0f0 },
  { n: "laptop-base", x: 30.7, z: 16.3, w: 1.0, d: 1.3, h: 0.06, y: 2.52, c: 0x9aa0a6 },
  { n: "laptop-screen", x: 31.15, z: 16.3, w: 0.06, d: 1.3, h: 0.85, y: 2.58, c: 0x3c4043 },
  { n: "chair-seat", x: 29.0, z: 14.3, w: 1.2, d: 1.2, h: 0.16, y: 1.5, c: 0x3a2c27 },
  { n: "chair-back", x: 28.45, z: 14.3, w: 0.15, d: 1.2, h: 1.6, y: 1.66, c: 0x3a2c27 },
  { n: "chair-rail-n", x: 29.0, z: 13.75, w: 1.4, d: 0.08, h: 1.5, c: 0xc7cacc },
  { n: "chair-rail-s", x: 29.0, z: 14.85, w: 1.4, d: 0.08, h: 1.5, c: 0xc7cacc },
  { n: "jacket", x: 28.4, z: 14.3, w: 0.3, d: 1.3, h: 1.4, y: 1.8, c: 0x202224 },
  { n: "ps5", x: 30.6, z: 18.2, w: 1.0, d: 0.8, h: 0.4, c: 0xf7f7f7 },
  { n: "ps5-core", x: 30.6, z: 18.2, w: 1.0, d: 0.4, h: 0.1, y: 0.4, c: 0x202224 },

  // south wall: blinds, sliding balcony door, AC unit
  { n: "blinds", x: 23.6, z: 19.68, w: 2.2, d: 0.08, h: 6.6, y: 0.3, c: 0xedebe6, wall: true },
  { n: "balcony-frame", x: 25.9, z: 20, w: 2.4, d: 0.4, h: 6.8, c: 0xf4f2ec, wall: true },
  { n: "balcony-glass", x: 25.9, z: 20, w: 1.9, d: 0.5, h: 5.3, y: 1.0, c: 0xa8c8d8, wall: true },
  { n: "wall-ac", x: 30.75, z: 19.55, w: 1.9, d: 0.9, h: 1.3, y: 2.65, c: 0xc9c4b8, wall: true },

  // ---- guest room: bed on the west wall, bins in the SW corner ----
  { n: "guest-frame", x: 14.0, z: 15.3, w: 3.2, d: 5.8, h: 1.0, c: 0xd8d2c4 },
  { n: "guest-mattress", x: 14.0, z: 15.3, w: 3.1, d: 5.7, h: 0.75, y: 1.0, c: 0xc8bed4 },
  { n: "guest-quilt", x: 14.1, z: 14.6, w: 2.3, d: 3.2, h: 0.55, y: 1.75, c: 0xcdbb98 },
  { n: "storage-bin", x: 13.4, z: 19.0, w: 1.6, d: 1.3, h: 1.5, c: 0x8a8f92 },
  { n: "suitcase", x: 13.6, z: 19.0, w: 2.1, d: 1.1, h: 0.85, y: 1.5, c: 0x2b4e91 },
  { n: "clear-bin", x: 15.2, z: 19.0, w: 1.5, d: 1.3, h: 1.1, c: 0xdce3e8 },
  { n: "guest-pillows", x: 15.2, z: 19.0, w: 1.2, d: 1.0, h: 0.45, y: 1.1, c: 0xe9c9be },
  { n: "box", x: 16.9, z: 19.2, w: 1.2, d: 0.9, h: 0.8, c: 0xc49a6c },
  { n: "instant-pot", x: 18.0, z: 19.3, w: 0.9, d: 0.9, h: 1.0, c: 0x2a2a2e, shape: "cyl" },
  { n: "toaster-oven", x: 19.0, z: 19.2, w: 1.0, d: 1.4, h: 0.9, c: 0xa7abae },
  { n: "guest-window", x: 16.1, z: 20, w: 5.0, d: 0.6, h: 3.4, y: 3, c: 0xbcd3e0, wall: true },

  // ---- balcony (visual only, 5 ft deep, locked) ----
  { n: "balcony-floor", x: 26.15, z: 22.5, w: 11.7, d: 5, h: 0.15, y: -0.15, c: 0x9a938a },
  { n: "balcony-rail", x: 26.15, z: 24.9, w: 11.7, d: 0.15, h: 3.2, c: 0x5e5650 },
  { n: "balcony-rail-w", x: 20.38, z: 22.5, w: 0.15, d: 5, h: 3.2, c: 0x5e5650 },
  { n: "balcony-rail-e", x: 31.92, z: 22.5, w: 0.15, d: 5, h: 3.2, c: 0x5e5650 },
  { n: "balcony-chair", x: 26.25, z: 22.5, w: 1.5, d: 1.5, h: 1.4, c: 0xf4f2ec },
  { n: "balcony-chair-back", x: 26.25, z: 23.2, w: 1.5, d: 0.15, h: 1.5, y: 1.4, c: 0xf4f2ec },
];

// Walk-up-and-press-E objects. x/z is the object; the player just needs to
// get within r of it (they can't stand inside furniture, the radius covers it).
export const INTERACTABLES = [
  { id: "headset", label: "Put on headset", x: 30.6, z: 12.0, r: 2.6, kind: "music" },
  { id: "bottle", label: "Grab water bottle", x: 30.4, z: 13.1, r: 2.6, kind: "gym" },
  { id: "controller", label: "Pick up controller", x: 30.55, z: 15.0, r: 2.6, kind: "games" },
  { id: "laptop", label: "Open laptop", x: 30.7, z: 16.3, r: 2.6, kind: "work" },
  { id: "stove", label: "Check the stove", x: 18.75, z: 5.25, r: 2.8, kind: "meals-today" },
  { id: "fridge", label: "Open the fridge", x: 21.7, z: 5.0, r: 2.8, kind: "meals-past" },
  { id: "nightstand", label: "Open nightstand drawer", x: 9.1, z: 18.8, r: 2.6, kind: "diary" },
  // the front door goes somewhere instead of opening a panel; tight radius so
  // it only asks once you walk up to it, not while standing on the mat
  { id: "front-door", label: "Head outside", x: 30.75, z: 0.8, r: 0.85, go: "outside" },
];

// Walkable box: inside the shell (the balcony is visual only).
export const BOUNDS = { x1: 0.8, z1: 0.8, x2: 31.2, z2: 19.2 };

// Start just inside the main entrance, on the mat, facing into the apartment.
export const SPAWN = { x: 30.45, z: 1.7, dirX: 0, dirZ: 1 };

// Floating room labels (dollhouse pills), x/z centers.
export const LABELS = [
  { t: "CLOSET", x: 4.4, z: 3 },
  { t: "BATH", x: 13.8, z: 3.4 },
  { t: "KITCHEN", x: 20.5, z: 3.3 },
  { t: "ENTRY", x: 30.7, z: 2.6 },
  { t: "MY ROOM", x: 6, z: 10.5 },
  { t: "HALLWAY", x: 16, z: 9.2 },
  { t: "GUEST ROOM", x: 16, z: 15.5 },
  { t: "LIVING ROOM", x: 25.5, z: 11.5 },
  { t: "BALCONY", x: 26.2, z: 22.5 },
];
