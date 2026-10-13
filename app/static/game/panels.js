/*
Interaction panels: what each object shows.

Logged out -> the same public data the site shows (public week feed, weekly
music charts, portfolio blurb). Logged in -> that plus quick log-entry forms
hitting the same POST/PUT endpoints the regular pages use.
*/const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));

const PLATFORMS = ["PS5", "PS4", "Phone", "PC", "Switch", "Other"];

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

const TITLES = {
  games: "🎮 Controller — games",
  music: "🎧 Headset — music",
  work: "💻 Laptop — work",
  gym: "💧 Water bottle — training",
  "meals-today": "🍳 Stove — today's meals",
  "meals-past": "🧊 Fridge — meal history",
  diary: "📓 Nightstand — diary",
};

function loginNote() {
  return `<p class="muted">🔒 <a href="/login">Log in</a> to add entries here.</p>`;
}

async function gamesPanel(authed) {
  if (!authed) return loginNote() + `<p class="muted">Recently played games are private.</p>`;
  const recent = await getJSON("/api/gaming/recent");
  const rows = recent.slice(0, 8).map((g) =>
    `<li><b>${esc(g.title)}</b> <span class="muted">${esc(g.platform)} · last played ${esc(g.last_played)}${g.total_minutes ? ` · ${g.total_minutes} min` : ""}</span></li>`
  ).join("");
  return `
    <h3>Recently played</h3>
    ${rows ? `<ul>${rows}</ul>` : `<p class="muted">Nothing logged yet.</p>`}
    <h3>Log a session</h3>
    <form id="p-games-form">
      <div class="row"><input name="title" placeholder="Game title" required style="flex:1"></div>
      <div class="row">
        <select name="platform">${PLATFORMS.map((p) => `<option>${p}</option>`).join("")}</select>
        <input name="duration_minutes" type="number" min="0" placeholder="minutes" style="width:7em">
      </div>
      <div class="row"><button class="btn" type="submit">Log it</button></div>
      <p class="muted" id="p-games-msg"></p>
    </form>`;
}

async function musicPanel(authed) {
  const data = await getJSON("/api/public/music");
  if (!data) return `<p class="muted">Music isn't connected on this server.</p>`;
  const tracks = data.tracks.map((t) =>
    `<li><b>${esc(t.name)}</b> <span class="muted">— ${esc(t.artist)} (${t.playcount} plays)</span></li>`).join("");
  const artists = data.artists.map((a) =>
    `<li><b>${esc(a.name)}</b> <span class="muted">(${a.playcount} plays)</span></li>`).join("");
  return `
    <h3>This week — top tracks</h3><ul>${tracks || "<li class=muted>—</li>"}</ul>
    <h3>This week — top artists</h3><ul>${artists || "<li class=muted>—</li>"}</ul>
    ${authed ? `<p><a href="/music">Open the full music room →</a></p>` : loginNote()}`;
}

function workPanel() {
  return `
    <p><b>Anirudh Yarram</b> — Software Engineer, UW–Madison '25.</p>
    <p class="muted">Python · TypeScript · C# · Flask · React · .NET — currently at Mechdyne, hunting for SE1 roles.</p>
    <p><a href="/">See the full portfolio →</a></p>`;
}

async function gymPanel(authed) {
  if (!authed) {
    const pub = await getJSON("/api/public/week");
    const days = (pub.days || []).filter((d) => (d.sessions || []).length);
    const rows = days.slice(0, 7).map((d) =>
      `<li><b>${esc(d.date)}</b> <span class="muted">${d.sessions.map((s) => esc(s.label || s.kind)).join(", ")}</span></li>`).join("");
    return `<h3>This week (public)</h3>${rows ? `<ul>${rows}</ul>` : `<p class="muted">No public sessions.</p>`}` + loginNote();
  }
  const sessions = await getJSON("/api/sessions");
  const rows = sessions.slice(0, 6).map((s) =>
    `<li><b>${esc(s.date)}</b> <span class="muted">${esc(s.kind || "")}${s.completed_sets != null ? ` · ${s.completed_sets}/${s.planned_sets} sets` : ""}</span></li>`).join("");
  return `<h3>Recent sessions</h3>${rows ? `<ul>${rows}</ul>` : `<p class="muted">Nothing logged yet.</p>`}
    <p><a href="/log">Open today's log →</a></p>`;
}

async function mealsTodayPanel(authed) {
  const today = new Date().toISOString().slice(0, 10);
  if (!authed) {
    const pub = await getJSON("/api/public/week");
    const day = (pub.days || []).find((d) => d.date === today) || (pub.days || [])[0];
    const meals = day?.meals || [];
    const rows = meals.map((m) =>
      `<li><b>${esc(m.description)}</b> <span class="muted">${m.calories != null ? `${m.calories} kcal` : ""}</span></li>`).join("");
    return `<h3>${esc(day?.date || today)} (public)</h3>${rows ? `<ul>${rows}</ul>` : `<p class="muted">No meals logged.</p>`}` + loginNote();
  }
  const [totals, meals] = await Promise.all([
    getJSON("/api/meals/daily"),
    getJSON("/api/meals"),
  ]);
  const rows = meals.map((m) =>
    `<li><b>${esc(m.description)}</b> <span class="muted">${m.calories != null ? `${m.calories} kcal · ` : ""}${m.protein_g != null ? `${m.protein_g}g protein` : ""}</span></li>`).join("");
  return `
    <h3>Today — ${totals.calories || 0} kcal</h3>
    <p class="muted">P ${totals.protein_g || 0}g · C ${totals.carbs_g || 0}g · F ${totals.fat_g || 0}g</p>
    ${rows ? `<ul>${rows}</ul>` : `<p class="muted">Nothing logged yet today.</p>`}
    <h3>Quick-add meal</h3>
    <form id="p-meal-form">
      <div class="row"><input name="description" placeholder="What did you eat?" required style="flex:1"></div>
      <div class="row">
        <input name="calories" type="number" min="0" step="any" placeholder="kcal" style="width:6em">
        <input name="protein_g" type="number" min="0" step="any" placeholder="protein g" style="width:7em">
      </div>
      <div class="row"><button class="btn" type="submit">Log meal</button></div>
      <p class="muted" id="p-meal-msg"></p>
    </form>`;
}

async function mealsPastPanel(authed) {
  const pub = await getJSON("/api/public/week");
  const days = (pub.days || []).filter((d) => (d.meals || []).length);
  const rows = days.slice(0, 7).map((d) => {
    const kcal = d.meals.reduce((a, m) => a + (m.calories || 0), 0);
    return `<li><b>${esc(d.date)}</b> <span class="muted">${d.meals.length} meal${d.meals.length > 1 ? "s" : ""}${kcal ? ` · ${Math.round(kcal)} kcal` : ""}</span></li>`;
  }).join("");
  return `<h3>Past week (public)</h3>${rows ? `<ul>${rows}</ul>` : `<p class="muted">No meals logged.</p>`}
    ${authed ? `<p><a href="/food">Open the food log →</a></p>` : loginNote()}`;
}

async function diaryPanel(authed) {
  if (!authed) return `<p class="muted">🔒 The diary is strictly private. <a href="/login">Log in</a> to write.</p>`;
  const today = new Date().toISOString().slice(0, 10);
  let text = "";
  try { text = (await getJSON(`/api/diary/${today}`)).text || ""; } catch { /* new entry */ }
  return `
    <h3>${esc(today)}</h3>
    <form id="p-diary-form">
      <div class="row"><textarea name="text" rows="8" style="flex:1" placeholder="Dear diary…">${esc(text)}</textarea></div>
      <div class="row"><button class="btn" type="submit">Save entry</button></div>
      <p class="muted" id="p-diary-msg"></p>
    </form>
    <p><a href="/diary">Open the full diary →</a></p>`;
}

export async function renderPanel(kind, authed) {
  const title = TITLES[kind] || "Interact";
  let html;
  try {
    switch (kind) {
      case "games": html = await gamesPanel(authed); break;
      case "music": html = await musicPanel(authed); break;
      case "work": html = workPanel(); break;
      case "gym": html = await gymPanel(authed); break;
      case "meals-today": html = await mealsTodayPanel(authed); break;
      case "meals-past": html = await mealsPastPanel(authed); break;
      case "diary": html = await diaryPanel(authed); break;
      default: html = `<p class="muted">Nothing here yet.</p>`;
    }
  } catch (e) {
    html = `<p class="muted">Couldn't load that right now (${esc(e.message)}).</p>`;
  }
  return { title, html };
}

export function bindPanel(kind, root, refresh) {
  const msg = (id, t) => { const el = root.querySelector(id); if (el) el.textContent = t; };

  const gf = root.querySelector("#p-games-form");
  if (gf) gf.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(gf);
    const body = {
      title: fd.get("title"),
      platform: fd.get("platform"),
      duration_minutes: fd.get("duration_minutes") ? Number(fd.get("duration_minutes")) : null,
    };
    const r = await fetch("/api/gaming", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (r.ok) { msg("#p-games-msg", "Logged ✓"); refresh(); }
    else msg("#p-games-msg", "Couldn't save — " + (await r.json()).error || r.status);
  });

  const mf = root.querySelector("#p-meal-form");
  if (mf) mf.addEventListener("submit", async (e) => {
    e.preventDefault();
    const r = await fetch("/api/meals", { method: "POST", body: new FormData(mf) });
    if (r.ok) { msg("#p-meal-msg", "Logged ✓"); refresh(); }
    else msg("#p-meal-msg", "Couldn't save — is the description filled in?");
  });

  const df = root.querySelector("#p-diary-form");
  if (df) df.addEventListener("submit", async (e) => {
    e.preventDefault();
    const today = new Date().toISOString().slice(0, 10);
    const r = await fetch(`/api/diary/${today}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: new FormData(df).get("text") }),
    });
    msg("#p-diary-msg", r.ok ? "Saved ✓" : "Couldn't save.");
  });
}
