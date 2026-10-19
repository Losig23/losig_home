/*
Outside the apartment, as data: the two-building complex, its shared
parking lot, and the street frontage, at true scale.

Measured, not guessed: street, sidewalk and lot-aisle positions come from
OpenStreetMap; the buildings, stall rows, spur, walkways and trees are
measured off USGS NAIP aerial imagery (public domain), which agrees with
OSM to within a few feet. No addresses or coordinates live here on
purpose (the site is public); positions are feet from a reference point
in the middle of the lot.

Units are feet, same axes as apartment.js: x west -> east, z north -> south.

            cross street (z -230)
  ════╤═════════════════════════════════════════════
      │   sidewalk (z -173)
      │          ┌──────── north bldg ───────┐   ┌spur┐
 ave- │          └───────────────────────────┘   │ ▭  │ RAV4
 nue  │  ┌──────────────── lot ──────────────────┘ ▭  │
 (x   ├══╡ driveway   north row ▭▭▭▭▭   aisle         │   woods
 -169)│  └──────────── south row ▭▭▭▭▭ ─────────────────┘
      │          ┌──────── south bldg ───────┐
      │          └────────── door ●──────────┘   <- you come out here
*/

// ---- sidewalks along the lot's frontage: polylines [x, z], from OSM ----
// (the streets themselves, and the sidewalks beyond the frontage, are in nearby.js)
export const SIDEWALKS = [
  { pts: [[-142, -172], [-142, 151]], w: 5 },                    // east side of the avenue
  { pts: [[-142, -173], [146, -174]], w: 5 },                    // south side of the cross street
];

// ---- the lot: concrete rectangles [x1, z1, x2, z2] ----
export const PAVING = [
  [-102, -23, 148, 46],   // main lot: north row, aisle, south row
  [103, -129, 148, -23],  // spur running north along the east edge
  [-155, -2, -102, 20],   // driveway out to the avenue (the only exit)
];

// Raised concrete walks from the buildings to the lot, plus the front stoops.
export const WALKS = [
  [-99, -82, -94, -23],   // north bldg, west walk up to its end door
  [-94, -82, -82, -77],
  [33, -57, 38, -23],     // north bldg, middle walk
  [35, 46, 40, 60],       // south bldg walk (ours)
  [32, 58, 43, 65],       // our front stoop
];

// Stall rows: stripes every 9 ft from `from` to `to` along the row's axis,
// spanning `at` across it; `nose` is the heading of a car parked nose-in
// (radians, 0 = facing +z south, like the player's facing).
export const STALL_ROWS = [
  { axis: 'x', from: -95, to: 103, at: [-23, -5], nose: Math.PI },        // north row
  { axis: 'x', from: -75, to: 96, at: [28, 46], nose: 0 },                // south row
  { axis: 'z', from: -126, to: -27, at: [103, 121], nose: -Math.PI / 2 }, // spur, nose-in west
];

// ---- buildings: identical two-story garden apartments, gable + cross gables ----
export const BUILDINGS = [
  // doors: side of the building + position along that face (x for n/s, z for e/w)
  { id: 'north', x1: -82, z1: -107, x2: 73, z2: -57, doors: [{ side: 's', at: 35.5 }, { side: 'w', at: -79.5 }] },
  { id: 'south', x1: -82, z1: 65, x2: 74, z2: 115, doors: [{ side: 'n', at: 37.5 }] },
];
export const BLDG = { eave: 20, ridge: 30, gables: [-48, -4, 40] }; // gable x offsets from center

// Neighbors across the avenue (plain boxes, no detail).
export const NEIGHBORS = [
  { x1: -319, z1: -99, x2: -235, z2: -41, h: 14, c: 0xece6da, flat: true },
  { x1: -312, z1: 21, x2: -235, z2: 75, h: 16, c: 0xc9bfae },
  { x1: -84, z1: 180, x2: -58, z2: 200, h: 13, c: 0xd8cfc0 },      // house south of the complex
  { x1: 138, z1: 214, x2: 158, z2: 238, h: 11, c: 0xb9b0a3 },
  { x1: 239, z1: 216, x2: 273, z2: 246, h: 13, c: 0xd8cfc0 },
];
export const NEIGHBOR_LOTS = [
  [-342, -176, -238, -108],
  [-342, 63, -197, 153],
  [-238, 34, -183, 56],   // their driveway
];

// ---- trees: [x, z, canopy radius]. "Yard" trees stand alone and get cut away
// when they hide the player; the woods east and south are generated in outside.js.
export const YARD_TREES = [
  [-125, -126, 21], [-125, 40, 19], [-234, -90, 16], [-224, -66, 13], [-288, 45, 15],
  [181, -325, 16], [244, -316, 14], [-150, 190, 14],
];
export const WOODS = [
  { x1: 180, z1: -200, x2: 335, z2: 300, step: 27 },  // dense woods east of the lot
  { x1: -40, z1: 180, x2: 170, z2: 270, step: 34 },   // trees behind the south building
];

// ---- street furniture ----
export const LOT_LIGHTS = [[-46, -26], [62, -26], [-20, 49], [151, -84], [151, 14]];
export const UTILITY_POLES = [[-300, -203], [-120, -203], [50, -203], [220, -203]]; // with cobra-head lights over the cross street
export const STOP_SIGNS = [{ x: -151.5, z: -205, face: 0 }];  // northbound avenue at the cross street; face = heading of the sign face
export const BUS_STOP = { x: -194, z: -279 };

// ---- cars: stall indexes per row (see STALL_ROWS) ----
export const PARKED = [
  { row: 0, stalls: [1, 3, 4, 7, 9, 10, 17, 18, 20] },
  { row: 1, stalls: [0, 2, 5, 6, 8, 10, 15, 16] },
  { row: 2, stalls: [1, 3, 9] },
];
export const RAV4_SPOT = { row: 2, stall: 6 };

// ---- coming and going ----
export const ENTRY = { x: 37.5, z: 58.5, dirX: 0, dirZ: -1 };  // on the stoop, facing the lot
