/*
The town's streets as a graph (town/roads.json, baked by
scripts/build_town.py): the minimap draws it and the Places router searches
it.

- Vertices are where ways meet or end; each edge keeps its simplified shape
  and a class (0 collector, 1 residential, 2 service, 3 drive).
- snap() finds the nearest point on any street (a 500 ft grid of edge
  segments keeps it quick).
- route() runs A* between two snapped points. Bigger streets cost less per
  foot, so a route takes the collector rather than threading a parking lot;
  the straight-line distance is the heuristic, which never overestimates
  because no street costs less than its length. One-way streets aren't in the
  data, so routes ignore them (it's a toy).
- Each route comes back as one polyline with the turns along it (where the
  way bends more than 30 degrees at a junction), for the turn card.
*/

const COST = [1, 1.15, 1.6, 3];   // per foot, by class
const CELL = 500;

export async function loadRoads(url = '/static/game/town/roads.json') {
  const g = await (await fetch(url)).json();
  const nv = g.nodes.length / 2;
  const vx = new Float64Array(nv), vz = new Float64Array(nv);
  for (let i = 0; i < nv; i++) { vx[i] = g.nodes[2 * i]; vz[i] = g.nodes[2 * i + 1]; }
  const adj = Array.from({ length: nv }, () => []);
  const grid = new Map();
  const edges = g.edges.map(([a, b, k, mid], id) => {
    const pts = [[vx[a], vz[a]]];
    for (let i = 0; i < mid.length; i += 2) pts.push([mid[i], mid[i + 1]]);
    pts.push([vx[b], vz[b]]);
    // cumulative length at each point
    const at = [0];
    for (let i = 1; i < pts.length; i++) at.push(at[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const e = { id, a, b, k, pts, at, len: at[at.length - 1] };
    adj[a].push(e);
    if (b !== a) adj[b].push(e);
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, z1] = pts[i], [x2, z2] = pts[i + 1];
      for (let ci = Math.floor(Math.min(x1, x2) / CELL); ci <= Math.floor(Math.max(x1, x2) / CELL); ci++) {
        for (let cj = Math.floor(Math.min(z1, z2) / CELL); cj <= Math.floor(Math.max(z1, z2) / CELL); cj++) {
          const key = `${ci},${cj}`;
          if (!grid.has(key)) grid.set(key, []);
          grid.get(key).push([e, i]);
        }
      }
    }
    return e;
  });
  // the town is one connected network except a couple of stray loops: route only on the big one
  const comp = new Int32Array(nv).fill(-1);
  let best = 0, bestSize = 0;
  for (let s = 0, c = 0; s < nv; s++) {
    if (comp[s] >= 0) continue;
    let size = 0;
    const stack = [s];
    comp[s] = c;
    while (stack.length) {
      const v = stack.pop();
      size++;
      for (const e of adj[v]) {
        const o = e.a === v ? e.b : e.a;
        if (comp[o] < 0) { comp[o] = c; stack.push(o); }
      }
    }
    if (size > bestSize) { bestSize = size; best = c; }
    c++;
  }
  const main = (e) => comp[e.a] === best;

  /** Nearest point on a street to (x, z): {e, i (segment), t (feet along e), x, z, d}, or null past maxD. */
  function snap(x, z, maxD = 3000) {
    let hit = null;
    for (let r = 0; r <= Math.ceil(maxD / CELL); r++) {
      // search rings of cells outward until a hit can't be beaten
      for (let ci = Math.floor(x / CELL) - r; ci <= Math.floor(x / CELL) + r; ci++) {
        for (let cj = Math.floor(z / CELL) - r; cj <= Math.floor(z / CELL) + r; cj++) {
          if (Math.max(Math.abs(ci - Math.floor(x / CELL)), Math.abs(cj - Math.floor(z / CELL))) !== r) continue;
          for (const [e, i] of grid.get(`${ci},${cj}`) || []) {
            if (!main(e)) continue;
            const [x1, z1] = e.pts[i], [x2, z2] = e.pts[i + 1];
            const dx = x2 - x1, dz = z2 - z1, L2 = dx * dx + dz * dz || 1;
            const u = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / L2));
            const px = x1 + dx * u, pz = z1 + dz * u, d = Math.hypot(x - px, z - pz);
            if (!hit || d < hit.d) hit = { e, i, t: e.at[i] + u * Math.sqrt(L2), x: px, z: pz, d };
          }
        }
      }
      if (hit && hit.d < r * CELL) break;
    }
    return hit && hit.d <= maxD ? hit : null;
  }

  // the part of an edge's shape between distances t0 and t1 along it (either order)
  function piece(e, t0, t1) {
    const fwd = t1 >= t0, lo = Math.min(t0, t1), hi = Math.max(t0, t1);
    const out = [pointAt(e, lo)];
    for (let i = 1; i < e.pts.length - 1; i++) if (e.at[i] > lo && e.at[i] < hi) out.push(e.pts[i]);
    out.push(pointAt(e, hi));
    return fwd ? out : out.reverse();
  }
  function pointAt(e, t) {
    let i = 0;
    while (i < e.pts.length - 2 && e.at[i + 1] < t) i++;
    const L = e.at[i + 1] - e.at[i] || 1, u = Math.max(0, Math.min(1, (t - e.at[i]) / L));
    return [e.pts[i][0] + (e.pts[i + 1][0] - e.pts[i][0]) * u, e.pts[i][1] + (e.pts[i + 1][1] - e.pts[i][1]) * u];
  }

  /** A* from one snapped point to another: {pts, length, turns: [{at, dir, angle}]}, or null. */
  function route(from, to) {
    if (!from || !to) return null;
    const START = nv, GOAL = nv + 1;
    const g2 = new Float64Array(nv + 2).fill(Infinity);
    const prev = new Array(nv + 2).fill(null);   // [vertex, edge, t0, t1] we came by
    const closed = new Uint8Array(nv + 2);
    const h = (v) => (v === GOAL ? 0 : Math.hypot((v === START ? from.x : vx[v]) - to.x, (v === START ? from.z : vz[v]) - to.z));
    const heap = [];
    const push = (v, f) => {
      heap.push([f, v]);
      for (let i = heap.length - 1; i > 0;) {
        const p = (i - 1) >> 1;
        if (heap[p][0] <= heap[i][0]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
      }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        for (let i = 0; ;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };
    const relax = (v, cost, via) => {
      if (cost < g2[v]) { g2[v] = cost; prev[v] = via; push(v, cost + h(v)); }
    };
    g2[START] = 0;
    push(START, h(START));
    while (heap.length) {
      const [, v] = pop();
      if (closed[v]) continue;
      closed[v] = 1;
      if (v === GOAL) break;
      const outs = v === START
        ? [[from.e, from.t]]
        : adj[v].flatMap((e) => (e.a === e.b ? [[e, 0], [e, e.len]] : [[e, e.a === v ? 0 : e.len]]));
      for (const [e, t] of outs) {
        const w = COST[e.k];
        // to the goal if it's on this edge, else to the edge's far ends
        if (e === to.e) relax(GOAL, g2[v] + Math.abs(to.t - t) * w, [v, e, t, to.t]);
        if (v === START || t === 0) relax(e.b, g2[v] + (e.len - t) * w, [v, e, t, e.len]);
        if (v === START || t === e.len) relax(e.a, g2[v] + t * w, [v, e, t, 0]);
      }
    }
    if (!prev[GOAL]) return null;
    // walk back, then stitch the pieces into one line
    const legs = [];
    for (let v = GOAL; v !== START;) {
      const [u, e, t0, t1] = prev[v];
      legs.push({ e, t0, t1, junction: u });
      v = u;
    }
    legs.reverse();
    const pts = [];
    const turns = [];
    let length = 0;
    for (const [n, leg] of legs.entries()) {
      const p = piece(leg.e, leg.t0, leg.t1);
      if (n > 0 && adj[leg.junction].length >= 3) turns.push({ at: length, v: leg.junction });
      for (const q of pts.length ? p.slice(1) : p) pts.push(q);
      length += Math.abs(leg.t1 - leg.t0);
    }
    return { pts, length, turns: turnsAlong(pts, turns) };
  }

  return { edges, nodes: { x: vx, z: vz }, snap, route, cell: CELL, grid };
}

// how the way bends at each junction: compare the heading 40 ft before and after it
function turnsAlong(pts, junctions) {
  const at = [0];
  for (let i = 1; i < pts.length; i++) at.push(at[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = at[at.length - 1];
  const point = (s) => {
    s = Math.max(0, Math.min(total, s));
    let i = 0;
    while (i < pts.length - 2 && at[i + 1] < s) i++;
    const L = at[i + 1] - at[i] || 1, u = (s - at[i]) / L;
    return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u];
  };
  const out = [];
  for (const j of junctions) {
    if (j.at < 20 || j.at > total - 20) continue;
    const [ax, az] = point(j.at - 40), [bx, bz] = point(j.at), [cx, cz] = point(j.at + 40);
    const h1 = Math.atan2(bz - az, bx - ax), h2 = Math.atan2(cz - bz, cx - bx);
    const a = Math.atan2(Math.sin(h2 - h1), Math.cos(h2 - h1));   // + = clockwise on the map = a right turn (z is south)
    if (Math.abs(a) < Math.PI / 6) continue;
    out.push({ at: j.at, angle: a, dir: Math.abs(a) > 2.4 ? 'u' : Math.abs(a) < 0.95 ? (a > 0 ? 'slight right' : 'slight left') : a > 0 ? 'right' : 'left' });
  }
  return out;
}

/** Cumulative lengths along a polyline. */
export function lengths(pts) {
  const at = [0];
  for (let i = 1; i < pts.length; i++) at.push(at[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return at;
}
