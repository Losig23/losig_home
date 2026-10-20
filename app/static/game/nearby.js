/*
A few blocks around the home lot, as data, so the RAV4 has somewhere to
go: the cross street from the school's stadium in the west to the
signalled corner in the east, the avenue north past the church grounds and
south around its bend, and the side streets in between.

Same sources and rules as home_lot.js. Roads and sidewalks are
OpenStreetMap centerlines, simplified to about a foot, with every name
dropped. Buildings, parking lots, fields and tree stands are measured off
USGS NAIP aerial imagery, the way the lot was. Everything here stops at
REGION's edge, where the baked town (scripts/build_town.py, chunks.js)
takes over; the bake leaves this area to the hand-built data, except for
real building footprints between the measured buildings (the houses on
the side streets southwest of the creek).

Units are feet from the lot's reference point: x west -> east, z north ->
south. A building is a box {x, z, w, d, ry, h} turned like three.js
rotation.y, with a roof (gable along its longer side, flat, or a low
pitch), a wall color c and a roof color r.

  stadium          church        fields              arterial
     ║  creek  │avenue       ┌──── long building ──┐    ║
  ═══╬═════════╪══════╤══════╧═══════ cross street ════╬═══ (signal)
     ║ trailer │      │ LOT        townhouses   fields ║
     ║  park   ╲      ╰── bend ── warehouses           ║
*/

// the hand-built area (the baked town is everything around it)
export const REGION = { x1: -1450, z1: -1250, x2: 1800, z2: 650 };

// ---- roads: OSM centerlines. kind sets the look: collectors get a double
// yellow line and curbs, residential streets curbs, service drives neither ----
export const ROADS = [
  // cross street: the wide collector, east-west past the lot
  { kind: 'collector', w: 42, pts: [[1800, -232], [-171, -229], [-787, -222], [-1450, -226]] },
  // the north-south arterial at the east end (a signalled corner)
  { kind: 'collector', w: 44, pts: [[1663, 650], [1661, -232], [1664, -1250]] },
  // the avenue: north past the church grounds, south around the bend
  { kind: 'res', w: 28, pts: [[-468, -1250], [-456, -1182], [-430, -1090], [-338, -875], [-269, -721], [-205, -559], [-175, -400], [-171, -229], [-168, 215], [-150, 273], [-106, 343], [-73, 382], [-27, 425], [41, 450], [121, 464], [302, 464]] },
  // the residential street that runs south-southeast from the cross street
  { kind: 'res', w: 30, pts: [[-546, 650], [-621, 386], [-686, 181], [-776, -122], [-782, -151], [-787, -222]] },
  // side street west off it
  { kind: 'res', w: 28, pts: [[-621, 386], [-923, 470], [-966, 479], [-1003, 481], [-1450, 477]] },
  // short street north to the east lot
  { kind: 'res', w: 28, pts: [[766, -230], [768, -620]] },
  // the townhouse loop
  { kind: 'res', w: 26, pts: [[868, -230], [866, -56], [863, 82], [841, 148], [806, 178], [642, 182]] },
  // its cross drive
  { kind: 'res', w: 24, pts: [[866, -56], [554, -61]] },
  // church loop road
  { kind: 'service', w: 24, pts: [[-208, -567], [-178, -586], [-175, -601], [-176, -623], [-268, -975], [-281, -988], [-302, -993], [-388, -992]] },
  { kind: 'service', w: 24, pts: [[-178, -586], [-47, -600], [-6, -619], [35, -665], [41, -688], [34, -837], [32, -853], [24, -869], [-79, -986], [-98, -996], [-302, -993]] },
  // church parking aisles
  { kind: 'service', w: 22, pts: [[26, -655], [59, -632], [212, -625], [220, -619], [223, -609], [221, -230]] },
  { kind: 'service', w: 22, pts: [[59, -632], [60, -555], [62, -551], [66, -549], [223, -546]] },
  { kind: 'service', w: 22, pts: [[-98, -996], [192, -1002]] },
  { kind: 'service', w: 22, pts: [[-30, -930], [221, -933]] },
  { kind: 'service', w: 22, pts: [[24, -869], [226, -871]] },
  { kind: 'service', w: 22, pts: [[36, -807], [225, -806]] },
  { kind: 'service', w: 22, pts: [[38, -743], [223, -743]] },
  { kind: 'service', w: 22, pts: [[38, -677], [222, -678], [226, -871], [221, -933], [207, -953], [192, -1002]] },
  { kind: 'service', w: 22, pts: [[222, -678], [221, -617]] },
  // north of the church
  { kind: 'service', w: 22, pts: [[-431, -1094], [-377, -1119], [-354, -1145], [-339, -1186], [-337, -1236], [-338, -1250]] },
  { kind: 'service', w: 22, pts: [[-377, -1119], [-357, -1102], [-341, -1098], [-222, -1096]] },
  // apartments west of the avenue
  { kind: 'service', w: 20, pts: [[-460, -478], [-458, -644], [-302, -722], [-274, -732]] },
  // apartments west of the creek
  { kind: 'service', w: 22, pts: [[-856, -958], [-836, -948], [-822, -934], [-821, -743], [-807, -633], [-788, -508], [-774, -361], [-780, -311], [-787, -275], [-787, -222]] },
  // lot around the long one-story building
  { kind: 'service', w: 24, pts: [[766, -324], [494, -328]] },
  { kind: 'service', w: 22, pts: [[698, -325], [698, -604]] },
  { kind: 'service', w: 24, pts: [[768, -605], [451, -600]] },
  // house drive
  { kind: 'drive', w: 12, pts: [[1020, -231], [1023, -89]] },
  // church drive (south side)
  { kind: 'service', w: 20, pts: [[-1218, -225], [-1216, -155], [-1214, -135], [-1198, -112], [-1194, -94]] },
  // mobile-home park loop
  { kind: 'service', w: 22, pts: [[-686, 181], [-990, 262], [-1024, 274], [-1063, 269], [-1097, 259], [-1132, 243], [-1147, 212], [-1149, 89]] },
  // neighbor drive across the avenue
  { kind: 'drive', w: 16, pts: [[-169, 121], [-358, 112]] },
  // warehouse yard
  { kind: 'service', w: 24, pts: [[-34, 419], [-48, 440], [-87, 509], [-88, 650]] },
  // warehouse yard
  { kind: 'service', w: 24, pts: [[200, 650], [197, 464]] },
  { kind: 'service', w: 22, pts: [[200, 629], [-88, 627]] },
  // drive south of the lot
  { kind: 'drive', w: 14, pts: [[-150, 273], [167, 258], [183, 239]] },
];

export const SIDEWALKS = [
  { w: 5, pts: [[-817, -169], [-1208, -174]] },
  { w: 5, pts: [[-202, -267], [-477, -268], [-610, -245], [-745, -265]] },
  { w: 5, pts: [[-805, -266], [-984, -266], [-1003, -250], [-1450, -252]] },
  { w: 5, pts: [[-202, -267], [-202, -331], [-204, -387], [-218, -474], [-244, -584], [-290, -695], [-342, -809]] },
  { w: 5, pts: [[-499, -1250], [-498, -1233], [-485, -1171], [-448, -1060]] },
  { w: 5, pts: [[-764, -169], [-517, 650]] },
  { w: 5, pts: [[-817, -169], [-729, 163]] },
  { w: 5, pts: [[-669, 364], [-966, 454], [-1214, 452]] },
  { w: 5, pts: [[-740, 445], [-964, 511], [-1426, 507]] },
];

// ---- buildings, measured from NAIP ----
const BRICK = 0xc9a98a, BEIGE = 0xddd2bf, METAL = 0xc9ccce, WHITE = 0xece8df;
const SIDING = 0xa7b6c4, TAN = 0xd8c8a8, CREAM = 0xe8dcc8, SAGE = 0xb9c6b0;
const SHINGLE = 0x7f6a5d, GRAY = 0x5f6266, DARK = 0x6a574b, RED = 0x9c4a3c;
const FLAT = 0xe2ded6, FLAT_DARK = 0x6b7077, TIN = 0x8d949b, GREEN_ROOF = 0x4f7d62;

export const BUILDINGS = [
  // north of the cross street: the church, its sheds, the long one-story building
  { x: -144, z: -912, w: 70, d: 65, ry: 0.52, h: 18, roof: 'flat', c: BEIGE, r: FLAT },
  { x: -75, z: -830, w: 100, d: 80, ry: 0.3, h: 22, roof: 'flat', c: BEIGE, r: FLAT_DARK },
  { x: -95, z: -733, w: 160, d: 120, h: 26, roof: 'flat', c: BEIGE, r: FLAT },
  { x: -22, z: -762, w: 87, d: 35, h: 13, roof: 'flat', c: BEIGE, r: GREEN_ROOF },
  { x: 228, z: -998, w: 37, d: 61, h: 13, roof: 'gable', c: METAL, r: TIN },
  { x: 100, z: -355, w: 40, d: 34, h: 10, roof: 'gable', c: CREAM, r: GRAY },
  { x: 388, z: -485, w: 47, d: 290, h: 14, roof: 'flat', c: BRICK, r: WHITE },
  { x: 466, z: -467, w: 257, d: 41, h: 14, roof: 'flat', c: BRICK, r: WHITE },
  { x: 517, z: -484, w: 55, d: 188, h: 14, roof: 'flat', c: BRICK, r: WHITE },
  { x: 615, z: -466, w: 50, d: 223, h: 14, roof: 'flat', c: BRICK, r: WHITE },
  { x: 494, z: -652, w: 32, d: 25, h: 11, roof: 'gable', c: CREAM, r: GRAY },
  // the shop building and the houses facing the cross street toward the east end
  { x: 935, z: -445, w: 90, d: 260, h: 20, roof: 'low', c: METAL, r: TIN },
  { x: 955, z: -588, w: 40, d: 25, h: 12, roof: 'flat', c: METAL, r: FLAT },
  { x: 1036, z: -330, w: 48, d: 30, h: 16, roof: 'gable', c: CREAM, r: GRAY },
  { x: 1075, z: -346, w: 30, d: 28, h: 13, roof: 'gable', c: CREAM, r: GRAY },
  { x: 1135, z: -316, w: 60, d: 32, h: 16, roof: 'gable', c: TAN, r: RED },
  { x: 1202, z: -314, w: 45, d: 32, h: 16, roof: 'gable', c: SIDING, r: GRAY },
  { x: 1211, z: -375, w: 17, d: 30, h: 10, roof: 'gable', c: CREAM, r: SHINGLE },
  { x: 1421, z: -312, w: 47, d: 29, h: 16, roof: 'gable', c: SAGE, r: GRAY },
  { x: 1456, z: -341, w: 23, d: 22, h: 12, roof: 'gable', c: CREAM, r: SHINGLE },
  { x: 1498, z: -315, w: 53, d: 46, h: 18, roof: 'gable', c: CREAM, r: RED },
  { x: 1481, z: -418, w: 33, d: 27, h: 12, roof: 'gable', c: METAL, r: GRAY },
  { x: 1572, z: -345, w: 35, d: 50, h: 17, roof: 'gable', c: TAN, r: DARK },
  { x: 1535, z: -552, w: 60, d: 85, h: 18, roof: 'gable', c: CREAM, r: RED },
  { x: 1522, z: -685, w: 85, d: 70, h: 18, roof: 'gable', c: SIDING, r: GRAY },
  // apartments along the avenue and across the creek (two-story, gabled)
  { x: -330, z: -472, w: 80, d: 250, h: 26, roof: 'gable', c: TAN, r: GRAY },
  { x: -933, z: -970, w: 57, d: 176, h: 26, roof: 'gable', c: SIDING, r: GRAY },
  { x: -868, z: -907, w: 73, d: 50, h: 24, roof: 'gable', c: SIDING, r: GRAY },
  { x: -901, z: -774, w: 73, d: 152, h: 26, roof: 'gable', c: SIDING, r: GRAY },
  { x: -897, z: -463, w: 65, d: 241, ry: 0.3, h: 26, roof: 'gable', c: SIDING, r: GRAY },
  { x: -402, z: -58, w: 80, d: 52, ry: 0.18, h: 24, roof: 'gable', c: CREAM, r: GRAY },
  { x: -393, z: 50, w: 80, d: 50, ry: -0.55, h: 24, roof: 'gable', c: TAN, r: SHINGLE },
  { x: -677, z: -35, w: 40, d: 125, ry: 0.33, h: 22, roof: 'gable', c: TAN, r: SHINGLE },
  { x: -624, z: 145, w: 40, d: 125, ry: 0.33, h: 22, roof: 'gable', c: TAN, r: SHINGLE },
  // the stadium's field house and stands
  { x: -1156, z: -790, w: 117, d: 40, h: 14, roof: 'flat', c: WHITE, r: FLAT },
  { x: -1345, z: -793, w: 210, d: 43, h: 10, roof: 'stands', c: 0x9aa0a6, r: 0x8a9096 },
  { x: -1360, z: -1140, w: 150, d: 30, h: 8, roof: 'stands', c: 0x9aa0a6, r: 0x8a9096, flip: true },
  // south of the cross street: the church on the corner, the mobile-home park
  { x: -1235, z: -50, w: 80, d: 70, h: 22, roof: 'gable', c: CREAM, r: DARK },
  { x: -999, z: -59, w: 115, d: 38, h: 11, roof: 'low', c: WHITE, r: FLAT },
  { x: -862, z: -26, w: 105, d: 35, ry: -0.14, h: 11, roof: 'low', c: CREAM, r: FLAT },
  { x: -1095, z: 27, w: 35, d: 100, ry: 0.49, h: 11, roof: 'low', c: SAGE, r: FLAT },
  { x: -809, z: 97, w: 42, d: 121, h: 11, roof: 'low', c: WHITE, r: FLAT },
  { x: -1060, z: 160, w: 35, d: 112, ry: 0.43, h: 11, roof: 'low', c: SIDING, r: FLAT },
  { x: -930, z: 168, w: 128, d: 38, ry: 0.24, h: 11, roof: 'low', c: CREAM, r: FLAT },
  // the townhouse rows east of the woods
  { x: 603, z: -135, w: 137, d: 60, h: 22, roof: 'gable', c: CREAM, r: GRAY },
  { x: 766, z: -135, w: 137, d: 60, h: 22, roof: 'gable', c: CREAM, r: GRAY },
  { x: 602, z: 15, w: 135, d: 60, h: 22, roof: 'gable', c: CREAM, r: GRAY },
  { x: 766, z: 15, w: 137, d: 60, h: 22, roof: 'gable', c: CREAM, r: GRAY },
  { x: 719, z: 110, w: 142, d: 60, h: 22, roof: 'gable', c: CREAM, r: GRAY },
  { x: 726, z: 250, w: 152, d: 60, h: 22, roof: 'gable', c: CREAM, r: GRAY },
  { x: 928, z: -87, w: 67, d: 135, h: 22, roof: 'gable', c: CREAM, r: GRAY },
  { x: 928, z: 67, w: 67, d: 135, h: 22, roof: 'gable', c: CREAM, r: GRAY },
  { x: 1090, z: -112, w: 50, d: 45, h: 16, roof: 'gable', c: CREAM, r: RED },
  { x: 1085, z: -62, w: 40, d: 45, h: 13, roof: 'gable', c: CREAM, r: RED },
  // warehouses south of the bend
  { x: 35, z: 546, w: 220, d: 72, h: 18, roof: 'low', c: METAL, r: FLAT_DARK },
  { x: 250, z: 671, w: 90, d: 227, h: 18, roof: 'low', c: METAL, r: FLAT_DARK },
];

// ---- flat ground: parking (concrete), gravel yards, fields, tall grass ----
export const LOTS = [
  [-55, -1030, 235, -675],     // church parking
  [50, -675, 230, -530],       // its newer asphalt lot
  [475, -390, 745, -290],      // around the long building
  [450, -635, 725, -610],
  [650, -600, 745, -300],
  [-480, -670, -420, -465],    // apartments west of the avenue
  [-880, -1050, -800, -880],   // apartments across the creek
  [-865, -880, -795, -690],
  [-1170, 75, -1105, 205],     // trailer park
  [-1075, -165, -810, -95],
  [-1320, 80, -1180, 230],
  [540, -104, 835, -15],       // townhouse drives
  [655, 140, 790, 170],
  [655, 192, 800, 220],
  [870, -150, 895, 130],
  [-660, 10, -570, 50],        // apartments on the side street
  [-600, 195, -520, 235],
];
export const GRAVEL = [
  [800, -600, 890, -250],      // shop yard
  [-100, 590, 210, 740],       // warehouse yard
];
export const FIELDS = [
  // crop fields: north of the church grounds, and southeast of the lot
  [[-100, -1250], [1620, -1250], [1620, -770], [765, -770], [765, -865], [285, -865], [285, -1060], [-100, -1060]],
  [[1165, -185], [1595, -185], [1595, 650], [350, 650], [350, 310], [1020, 310], [1020, 110], [1165, 110]],
];
export const MEADOWS = [
  [[-350, 150], [-80, 150], [-80, 380], [-180, 330], [-190, 650], [-350, 650]],     // wet prairie along the creek
  [[400, -190], [500, -190], [500, 270], [400, 270]],
];

// ---- trees: stands are filled in outside.js like the lot's woods; lines are single trees ----
export const WOODS = [
  { x1: -830, z1: -1230, x2: -690, z2: -290, step: 30 },   // along the creek
  { x1: -1000, z1: -1230, x2: -880, z2: -1080, step: 34 },
  { x1: -590, z1: -1070, x2: -410, z2: -690, step: 32 },   // grove west of the avenue
  { x1: -460, z1: 150, x2: -330, z2: 640, step: 30 },      // creek south of the cross street
  { x1: 980, z1: -680, x2: 1150, z2: -555, step: 34 },
  { x1: -1450, z1: 280, x2: -1240, z2: 360, step: 36 },
];
export const TREES = [
  [245, -930, 13], [245, -888, 13], [245, -846, 13], [245, -804, 13], [245, -762, 13], [245, -720, 13], [245, -678, 12], [245, -636, 12],
  [35, -305, 14], [110, -470, 12], [160, -440, 11], [-20, -470, 11], [-55, -560, 13],
  [1150, -500, 14], [1230, -520, 12], [1300, -495, 15], [1380, -510, 13], [1440, -470, 12], [1600, -500, 14],
  [1260, -360, 12], [1330, -380, 13], [1560, -420, 12],
  [-1240, -330, 12], [-1120, -340, 13], [-990, -330, 11], [-520, -330, 12], [-600, -360, 14],
  [-1290, -150, 13], [-1150, -120, 12], [-700, 260, 13], [-560, 280, 12], [-740, 120, 12],
  [1000, -40, 12], [1010, 60, 11], [1110, 10, 13], [480, 120, 13], [460, 40, 12],
];

// ---- the school stadium (track and field) and the ball diamond, flat ----
export const STADIUM = { x: -1360, z: -967, len: 580, wide: 305 };
export const DIAMOND = { x: -1062, z: -628 };
export const POOL = [-500, -435, -430, -380];
export const COURT = [-555, -665, -500, -550];

// ---- street furniture ----
export const SIGNAL = { x: 1661, z: -232 };                 // the signalled corner at the east end
// utility poles with street lights, south side of the cross street (the lot's run continues)
export const POLES = [-1320, -1150, -980, -640, -470, 390, 560, 730, 900, 1070, 1240, 1410, 1580];
