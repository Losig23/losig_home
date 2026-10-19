# Outdoor phase: walking out and driving around town

The apartment game's second phase: walk out the front door into the
parking lot, get in the RAV4, and drive anywhere in my real hometown,
with Home, Work, the gym and the nearest gas stations marked.

This doc is the working design. The research behind it (aerial imagery
notes, routes, data coverage) lives in a private write-up, because the
repo and `/game` are both public.

## Privacy rule

The world is built from the real map, but **no street addresses, unit
numbers, street-corner names, town name or coordinates** go into anything
committed (code, docs, PR text) or shown in the UI. Places are labeled
Home / Work / Gym. Positions are feet from a local reference point.
`tests/test_game.py::test_game_ships_no_real_addresses_or_coordinates`
enforces this for the shipped game files, the baked town data and the
bake script. The bake (`scripts/build_town.py`) reads the origin, bounds
and data files from `instance/town/settings.json`, which is gitignored,
reads only shapes and a few class tags from OSM (never names or
addresses), and a test checks that the baked chunks hold nothing but
numbers and a short list of class words.

## Data sources

| Source | Used for | Ships? |
|---|---|---|
| OpenStreetMap (Overpass) | roads, sidewalks, POIs, rail, water, some buildings and poles | yes, ODbL: "© OpenStreetMap contributors" credit is shown outdoors; baked data stays ODbL |
| Microsoft Global ML Building Footprints (two zoom-9 tiles) | the ~95% of buildings OSM is missing | yes, ODbL: "buildings © Microsoft" is in the outdoor credit; `town/NOTICE.md` marks the baked data as an ODbL derivative |
| USGS NAIP aerial imagery | measuring hand-built sites (the home lot) | geometry derived from it, yes (public domain); never used as a texture |
| Google Maps satellite / Street View / directions | looking and route timings only | **no**: its terms forbid tracing or deriving data from it |

## Style guide (what the apartment does, and how it carries outdoors)

- **Engine:** Three.js r160 ES modules from an import map, no build step,
  real 3D in feet.
- **Shading:** `MeshToonMaterial` with a hard 4-texel ramp, which gives
  three flat bands. There are no image textures. Canvas textures are used
  only for lettering (labels, jersey, signs). Use `pencil(color)`, or
  `pencil(0xffffff, {vertexColors: true})` for merged scenery.
- **Line art:** a screen-space ink pass (`ink.js`), depth silhouettes plus
  normal creases in `#2a2433`. The fade band is set per area and mode:
  55–110 ft inside, 200–520 ft outside on foot, 260–950 ft driving.
- **Grade:** saturation ×1.15, blacks lifted toward violet, paper grain,
  vignette, no tone mapping.
- **Light:** sky-blue hemisphere fill and a warm sun with crisp PCF
  shadows. Outdoors the shadow box follows the player, snapped to texels.
- **Atmosphere:** sky and fog `#dde9ec`. Fog runs 170–560 ft on foot and
  420–1,600 ft while driving, and thickens into a fog bank past the edge of
  the map instead of an invisible wall.
- **Geometry:** primitives only (boxes, 14-sided cylinders, 10-sided
  cones, detail-1 icosahedra), real proportions, toy-simple, one
  recognisable part per box.
- **Outdoor palette:** grass `#a9c98b`, asphalt `#7d8188`, drives
  `#8f9399`, lot concrete `#bcb8b0`, sidewalk `#dcd8cf`, crops `#93b56c`,
  tall grass `#b9c28c`, siding `#a7b6c4`, shingles `#7f6a5d`. House siding
  comes from a small pastel set. Glass, doors, leaves, trunks, paint and
  yellow line reuse the apartment's colors.
- **Cockpit:** warm gray plastic (`#5a5560` / `#45414b`), a cloth
  headliner, white gauge faces with jersey-red needles, and Ani's hands on
  the wheel at ten and two.
- **HUD:** reuse the tokens `--ink --paper --sky --accent --blue`: paper
  boxes with a 3 px ink border and a 4 px offset sticker shadow. The
  prompt is the manga speech bubble, and new pieces (arrival caption,
  speedometer, pedals, camera and Get out chips) are the same stickers.
  The speedometer is a round sticker whose dial fills blue, then red past
  100 mph.
- **The one tension:** the apartment is drawn for a high, fixed dollhouse
  camera. Outdoors keeps that camera on foot. A building or tree between
  the camera and the player sinks to the apartment's 4 ft cutaway height
  and shows a hollow interior, the same trick as the apartment walls.
  Driving cameras will pull in instead of cutting.

## Technical design

- **Areas:** each walkable place (`world.js` apartment, `outside.js` lot)
  is an area with its own scene, colliders, bounds, doors, speed, ground
  height and camera framing. Doors are interactables with a `go` target.
  Using one fades to black, swaps the area and shows an arrival caption.
  The outdoors module loads on first exit.
- **Batching:** static scenery merges into vertex-colored meshes
  (`batch.js`) cut into 400 ft tiles, so off-screen tiles, and tiles
  outside the sun's shadow box, get culled. Things that change stay
  separate: cuttable buildings and trees, and the RAV4. Ani is baked into
  one mesh per moving part (`mergeMeshes`), 12 draw calls instead of ~130.
- **Ground layers:** flat ground (grass, water, fields, drives, streets,
  lots, paint) is one mesh per area or chunk whose vertices carry a
  `layer`; the shader pushes deeper layers back by a fixed depth step
  (`batch.js` GROUND). From the driver's seat, surfaces a fraction of a
  foot apart would otherwise z-fight a few hundred feet out, and one mesh
  is one draw call instead of five.
- **Primitives:** boxes, flats, discs, cylinders, blobs and gable attics
  are cached unit shapes copied and scaled, so building a street of houses
  doesn't construct thousands of geometries.
- **Scale:** true 1:1. The car is tuned instead: 0–60 mph in 4.5 s,
  0–100 in 8 s, top speed 160 mph (deliberately silly; it's a toy).
  Expected drives at a sensible pace are about 30 s to the gas station,
  about 75–90 s to the gym, and about 90 s to work. Phase 4 adds fast
  travel if that drags.
- **The bake** (`scripts/build_town.py`, Python standard library + curl):
  - One Overpass query for the town's bounds (roads, sidewalks, buildings,
    land cover, water, rail, trees, stops, signals, lamps), cached in
    `instance/town/cache/`.
  - Footprints from the two Microsoft tiles that cover the town. OSM
    buildings win; a footprint is dropped if OSM or a hand-measured
    building already has it.
  - Near-rectangles (about 90% of buildings) become boxes with gable,
    low or flat roofs and real height where the data has one; odd shapes
    extrude as flat-roofed blocks with storefront glass.
  - Curbs are worked out offline (gaps at every crossing road and lot), as
    are utility poles every ~180 ft along the bigger streets, stop signs
    where a residential street meets one, signal masts at mapped signals,
    and trees (mapped ones, woods filled on a grid, and some yard trees).
  - The hand-built blocks are a hole: roads, land, trees and furniture
    inside nearby.js's REGION are cut out exactly at its edge, so the
    streets join seamlessly.
  - Output: 1,008 chunks of 600 ft, 1.6 MB of JSON in total (11,947
    buildings, 3,800 road pieces, 1,491 props).
- **Streaming** (`chunks.js`): chunks load in a ring around a look-ahead
  point (1,200 ft on foot; 1,800 ft driving, centered 1.5 s ahead of the
  car), nearest first, and unload 500 ft beyond. Building is a generator
  stepped within a ~4 ms budget per frame (worst measured frame 5.5 ms).
  At 158 mph every chunk within 900 ft of the car was always built; the far
  ring catches up behind the fog. Each chunk is three draw calls: static
  scenery, layered ground, and its breakable props.
- **Collision per chunk:** each chunk builds its own 40 ft grid; `collide.js`
  `createWorld` queries the hand-built area plus whichever chunks a circle
  (plus 150 ft of overhang) can touch. Odd-shaped buildings collide as
  polygons. Each chunk also brings its sidewalk heights and a 4 ft
  pavement raster for the grass drag.
- **Physics** (`vehicle.js`): no engine; 2D arcade physics on a flat
  ground plane at a fixed 60 Hz, drawn interpolated between steps.
  - The car collides as three circles (r 3.05 ft, along its length)
    against boxes, axis-aligned or turned, from a 40 ft grid
    (`collide.js`). Hits push out, bounce with restitution 0.3, scrape
    with a little friction, spin the car from where they land, and shake
    the camera (trauma squared). Fast moves are sub-stepped so 160 mph
    can't tunnel through a pole.
  - A bicycle model handles steering. Lock narrows with speed so the
    fronts never ask for more than about 1.6 g: a 38 ft turning radius at
    30 mph, 150 ft at 60, 600 ft at 120.
  - Grip swings the velocity back toward the heading, keeping speed. The
    handbrake (Space / Drift) cuts grip and lets the car over-rotate to a
    held ~45° slide; letting go straightens it within a second.
  - Holding brake at a standstill reverses (up to 20 mph). Grass is
    drivable but drags the car down to about 70 mph (a 4 ft pavement
    raster answers "is this road?").
  - Curbs and sidewalks don't collide; the body bumps up 3 in onto
    sidewalks.
  - Breakables (`breakables.js`): utility poles, lot lights, stop signs,
    the bus stop and signal masts. Hit one above 8 mph and the car loses
    15% of its speed while the prop's vertices collapse out of its merged
    mesh and a copy topples from the base the way you were going (light
    signs fly off spinning). Pieces lie there 20 s, then shrink away;
    knocked props stay down for the visit. Slower than 8 mph they're
    solid.
- **Cameras:** every camera writes a wanted pose each frame and `main.js`
  blends any change (0.75 s getting in, 0.6 s getting out, 0.4 s toggling).
  - On foot: the follow camera, closer outdoors (27 ft up, 25 back),
    still north-up (yaw rotation is deferred).
  - Cockpit (`drive.js`, the default): at the driver's eye, glancing a
    little into turns, FOV widening slightly with speed. Phones in
    portrait start in chase instead, because a portrait cockpit is mostly
    headliner and dash.
  - Chase: trails on a lagging yaw (wider in drifts), 22 ft back and
    7.5 ft up, backing off and widening its FOV from 58° to 74° with
    speed. A wall between it and the car pulls it in, up and looking
    further down the road, instead of the cutaway.
  - `C` or the camera chip toggles.
- **Getting in and out:** the driver's door is an interactable that
  follows the car ("Get in": E or tap the bubble). Ani shrinks into the
  seat. Get out (E or the chip) only works under 5 mph and puts Ani at the
  driver's door, or the passenger side, behind or in front if that's
  blocked. The parked car joins the collision grid as three moving circles.
- **Touch driving:** a floating steer stick (sideways only) that starts on
  the left 62% of the screen; Gas, Brake/Reverse and Drift stickers on the
  right, each tracking its own finger so any combination can be held; the
  camera and Get out chips at the top right, the speedometer top left.
- **The hand-built blocks** (`nearby.js`, built by `town.js`): the cross
  street from the stadium to the signalled corner (about 3,250 ft), the
  avenue north past the church grounds and south around its bend, and the
  side streets between. Roads and sidewalks are OSM centerlines with
  names dropped; about 55 buildings, the lots, fields, tree stands, the
  stadium and the ball diamond are measured off NAIP. Since Phase 3 the
  houses between them are real footprints from the bake, and the town
  continues past every edge.
- **The edge of town:** the drivable map is the baked bounds (about
  19,000 × 20,000 ft). A fog bank closes in over the last 400 ft and the
  car bogs down instead of hitting an invisible wall.
- **Mobile budget** (measured in Phase 2; Phase 3 in town: 35–38 draw
  calls and 64–147k triangles in the color pass, about 10 calls and 46k
  in the shadow pass):
  - At most 150 draw calls per pass. Driving views run 26–58 in the color
    pass and about 20 in the shadow pass; the whole map from above is
    about 145.
  - About 300k visible triangles. The whole Phase 2 scene is 267k; a
    driving view draws 106–166k plus about 120k in the shadow pass. Trees
    are most of it, so stands of trees use a lighter four-blob tree.
  - Pixel ratio capped at 1.5 outdoors on touch devices (done); dynamic
    resolution is Phase 4.
  - 1024² shadows on touch devices.
  - 2× MSAA on touch devices (done).

## Phases

1. **Out the door and across the lot**: this PR.
   - Area switching with a fade.
   - The home lot measured from OSM plus NAIP: both buildings, stalls,
     spur, driveway, street frontage, sidewalks, trees, lights, parked
     cars, and the RAV4 as a solid prop.
   - Outdoors Ani walks at 9 ft/s; **R** (or the Run sticker on touch)
     toggles a 20 ft/s sprint, also 11 ft/s in the apartment.
   - A "MY RAV4" speech-bubble marker floats over the car.
   - The dollhouse cutaway, the following sun, the OSM credit and a
     privacy test.
2. **A drivable RAV4**: this PR too.
   - Get in and out at the driver's door; the car stays where you leave it.
   - Arcade handling at a fixed 60 Hz: 0–60 in 4.5 s, 160 mph, a handbrake
     drift, brake-to-reverse, wheels that spin and steer, body lean.
   - Cockpit and chase cameras with blends, shake on impact, and per-mode
     fog and ink distances.
   - Three-circle collisions against a grid of boxes; curbs and sidewalks
     are visual only.
   - Touch pedals, a sideways steer stick, and a speedometer sticker.
   - A few blocks of the avenue and cross street to drive, with a fog bank
     at the edges.
   - Ani merged to 12 meshes; outdoor run raised to 30 ft/s (about 20 mph).
3. **The whole town**: this PR too.
   - The bake script and 1,008 baked chunks: roads, curbs, sidewalks,
     land, water, rail, 11,947 buildings, trees, poles and signs.
   - Streaming around a look-ahead point within a per-frame budget.
   - Collision per chunk, polygon buildings, and breakable poles and signs.
   - Real footprints replace the placeholder houses; the fog bank moves to
     the edge of town.
   - Storefront glass on shops, STOP lettering in block strokes.
4. **Places and polish**: Work, gym, gas stations and groceries; minimap,
   waypoints and GPS route; arrival panels; fast travel; speedometer;
   performance tuning.

## Phase 1 screenshots

| | |
|---|---|
| ![Front door prompt](phase1-door.jpg) | ![Arriving in the lot](phase1-arrive.jpg) |
| ![Running across the lot](phase1-run.jpg) | ![The RAV4 in the spur](phase1-rav4.jpg) |
| ![Street corner](phase1-corner.jpg) | ![Phone, portrait](phase1-phone.jpg) |

![The lot from above (debug camera, same renderer)](phase1-overview.jpg)

## Phase 2 screenshots

| | |
|---|---|
| ![Get in at the driver's door](phase2-getin.jpg) | ![Cockpit at 87 mph on the cross street](phase2-cockpit.jpg) |
| ![Chase cam, mid-drift](phase2-drift.jpg) | ![Phone, portrait, driving](phase2-phone.jpg) |

![The drivable blocks from above (debug camera, same renderer)](phase2-overview.jpg)

## Phase 3 screenshots

| | |
|---|---|
| ![A residential street of real footprints](phase3-street.jpg) | ![Downtown storefronts from the cockpit](phase3-downtown.jpg) |
| ![A utility pole knocked over](phase3-pole.jpg) | ![A stop sign](phase3-stop.jpg) |
