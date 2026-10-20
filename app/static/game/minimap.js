/*
The minimap: a round paper sticker with an ink rim, drawn on a 2D canvas
from the street graph (roads.js).

- Streets are paper-white bands with an ink edge, wider for bigger streets,
  on pale grass, so it reads like a hand-drawn map rather than a GPS screen.
- Driving, the map turns with the car (heading up) and zooms out with speed;
  on foot it stays north-up and close in. An N tab rides the rim.
- The route draws in the HUD blue from where you are onward; places are
  little stickers, pinned to the rim when they're off the map.
- Only the streets in the grid cells around you are drawn, so a frame costs
  a few hundred line segments.
*/

const BG = '#e4ecd6';
const PAPER = '#fffdf6';
const INK = '#2a2433';
const BLUE = '#5b8def';
const RED = '#e25a5a';
const WIDTH = [5.2, 3.6, 2.3, 1.5];   // px at a 170 px map, by street class

export function createMinimap(canvas, roads, places) {
  const ctx = canvas.getContext('2d');
  let size = 0, dpr = 1;
  let rot = 0, radius = 600;

  function fit() {
    const s = canvas.clientWidth;
    const r = Math.min(2, devicePixelRatio || 1);
    if (s === size && r === dpr) return;
    size = s;
    dpr = r;
    canvas.width = canvas.height = Math.max(1, Math.round(s * dpr));
  }

  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  /**
   * me: {x, z, h, driving, speed, dirX, dirZ}; route: the active route
   * (route.js) or null; target: the routed place.
   */
  function draw(me, route, target) {
    fit();
    if (!size) return;
    const R = size / 2, k0 = size / 170;
    // driving: heading up, further out the faster you go; on foot: north up, close in
    const wantRot = me.driving ? me.h - Math.PI : 0;
    rot += wrap(wantRot - rot) * 0.25;
    const wantR = me.driving ? 700 + Math.min(1, me.speed / 150) * 1300 : 520;
    radius += (wantR - radius) * 0.08;
    const k = R / radius;               // px per foot
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const toMap = (x, z) => {
      const dx = (x - me.x) * k, dz = (z - me.z) * k;
      return [R + dx * cs - dz * sn, R + dx * sn + dz * cs];
    };

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(R, R, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, size, size);

    // streets in the cells around: ink edges first, then paper on top
    const reach = radius * 1.45, C = roads.cell;
    const seen = new Set(), byClass = [[], [], [], []];
    for (let ci = Math.floor((me.x - reach) / C); ci <= Math.floor((me.x + reach) / C); ci++) {
      for (let cj = Math.floor((me.z - reach) / C); cj <= Math.floor((me.z + reach) / C); cj++) {
        for (const [e] of roads.grid.get(`${ci},${cj}`) || []) {
          if (seen.has(e.id)) continue;
          seen.add(e.id);
          byClass[e.k].push(e);
        }
      }
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const pass of [0, 1]) {
      for (let c = 3; c >= 0; c--) {
        if (!byClass[c].length) continue;
        ctx.beginPath();
        for (const e of byClass[c]) {
          for (let i = 0; i < e.pts.length; i++) {
            const [px, py] = toMap(e.pts[i][0], e.pts[i][1]);
            if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
          }
        }
        ctx.strokeStyle = pass ? PAPER : 'rgba(42,36,51,.5)';
        ctx.lineWidth = (WIDTH[c] + (pass ? 0 : 2)) * k0;
        ctx.stroke();
      }
    }

    // the route, from here on
    if (route) {
      const pts = route.ahead(me, 1.6 * radius);
      if (pts.length > 1) {
        for (const pass of [0, 1]) {
          ctx.beginPath();
          pts.forEach(([x, z], i) => { const [px, py] = toMap(x, z); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
          ctx.strokeStyle = pass ? BLUE : INK;
          ctx.lineWidth = (pass ? 3.6 : 6) * k0;
          ctx.stroke();
        }
      }
    }
    ctx.restore();

    // places: little stickers, pinned to the rim past the edge
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of places) {
      let [px, py] = toMap(p.x, p.z);
      const dx = px - R, dy = py - R, d = Math.hypot(dx, dy), lim = R - 11 * k0;
      const out = d > lim;
      if (out) { px = R + dx / d * lim; py = R + dy / d * lim; }
      const isT = target && target.id === p.id;
      const r = (isT ? 9 : out ? 6.5 : 8) * k0;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = isT ? RED : PAPER;
      ctx.fill();
      ctx.lineWidth = 2 * k0;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.font = `${Math.round((out && !isT ? 8 : 11) * k0)}px system-ui, sans-serif`;
      ctx.fillText(p.icon, px, py + 0.5);
    }

    // north tab on the rim
    const nx = R + sn * (R - 10 * k0), ny = R - cs * (R - 10 * k0);
    ctx.beginPath();
    ctx.arc(nx, ny, 7.5 * k0, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();
    ctx.fillStyle = PAPER;
    ctx.font = `800 ${Math.round(9.5 * k0)}px "M PLUS Rounded 1c", system-ui, sans-serif`;
    ctx.fillText('N', nx, ny + 0.5);

    // you: an arrow in the middle (the car points up while driving)
    const a = me.driving ? 0 : rot + Math.atan2(me.dirZ ?? -1, me.dirX ?? 0) + Math.PI / 2;
    ctx.save();
    ctx.translate(R, R);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(0, -9 * k0);
    ctx.lineTo(6.5 * k0, 7 * k0);
    ctx.lineTo(0, 3.5 * k0);
    ctx.lineTo(-6.5 * k0, 7 * k0);
    ctx.closePath();
    ctx.fillStyle = RED;
    ctx.fill();
    ctx.lineWidth = 2 * k0;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.restore();
  }

  return { draw };
}
