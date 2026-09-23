"""Live gym logging pages: pick a day, then log sets with a rest timer.

GET /log -> day picker (1-5 + travel), creates a session, redirects.
GET /sessions/<id>/log -> the live page: per-exercise log rows, a count-up
rest timer per exercise, PR stars. Vanilla JS + fetch, no frameworks,
usable on a phone. No auth (same as the rest of this backend-first API).
"""
import html

from flask import Blueprint

live_bp = Blueprint("live", __name__)

BASE_STYLE = """<style>
body{font-family:system-ui,sans-serif;max-width:720px;margin:1rem auto;
padding:0 1rem;color:#111827}
button{font-size:1rem;padding:.6rem 1rem;border-radius:8px;
border:1px solid #d1d5db;background:#f3f4f6;cursor:pointer}
button.primary{background:#2563eb;color:#fff;border-color:#2563eb}
button:active{transform:scale(.97)}
.daybtn{display:block;width:100%;margin:.5rem 0;padding:1rem;font-size:1.2rem;
text-align:left}
.ex{border:1px solid #e5e7eb;border-radius:10px;margin:.8rem 0;overflow:hidden}
.exhead{padding:.7rem 1rem;background:#f9fafb;font-weight:600;cursor:pointer;
display:flex;justify-content:space-between;align-items:center}
.exbody{padding:.7rem 1rem;display:none}
.ex.open .exbody{display:block}
.planned{color:#6b7280;font-size:.9rem;margin-bottom:.5rem}
.logged{font-size:.95rem;margin:.3rem 0}
.star{color:#f59e0b}
.logrow{display:flex;gap:.4rem;margin-top:.6rem;flex-wrap:wrap;align-items:end}
.logrow label{font-size:.8rem;color:#6b7280;display:flex;
flex-direction:column;gap:.2rem}
.logrow input{font-size:1.1rem;padding:.5rem;width:5.2rem;border:1px solid
#d1d5db;border-radius:8px}
.timer{display:flex;gap:.6rem;align-items:center;margin-top:.6rem}
.tdisp{font-variant-numeric:tabular-nums;font-size:1.4rem;font-weight:700;
min-width:4.2rem}
a{color:#2563eb}
.meta{color:#6b7280;font-size:.9rem}
.thumb{width:42px;height:42px;border:1px solid #e5e7eb;border-radius:8px;
background:#fff;flex:none;cursor:zoom-in}
.thumb.big{width:150px;height:150px;cursor:zoom-out}
.exname{display:flex;align-items:center;gap:.6rem;flex:1;min-width:0}
</style>"""


def render_log_picker():
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Start live session — losig_home</title>{BASE_STYLE}</head><body>
<h1>Start live session</h1>
<p class="meta">Pick a day — a session is created and you start logging.</p>
<div id="days"><p>loading…</p></div>
<script>
async function load(){{
  const days = await (await fetch("/api/routine")).json();
  const el = document.getElementById("days");
  el.innerHTML = "";
  days.forEach(d => {{
    const b = document.createElement("button");
    b.className = "daybtn";
    b.textContent = "Day " + d.day_number + " — " + d.name;
    b.onclick = () => start({{day_number: d.day_number}});
    el.appendChild(b);
  }});
  const t = document.createElement("button");
  t.className = "daybtn";
  t.textContent = "✈️ Travel day (push-ups / sit-ups)";
  t.onclick = () => start({{travel_mode: true}});
  el.appendChild(t);
}}
async function start(body){{
  const r = await fetch("/api/sessions", {{method: "POST",
    headers: {{"Content-Type": "application/json"}},
    body: JSON.stringify(body)}});
  const j = await r.json();
  if (j.id) location.href = "/sessions/" + j.id + "/log";
  else alert(j.error || "could not start session");
}}
load();
</script>
</body></html>"""


def render_session_log(session_id):
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Live log — losig_home</title>{BASE_STYLE}</head><body>
<p><a href="/log">← new session</a> · <a href="/analysis">analysis</a></p>
<h1 id="title">loading…</h1>
<div id="content"></div>
<script>
const SESSION_ID = {session_id};
const timers = {{}};  // eid -> {{start, iv}}

function esc(s){{
  return String(s).replace(/[&<>"']/g, c =>
    ({{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}})[c]);
}}
function fmt(s){{
  const m = Math.floor(s / 60), r = s % 60;
  return String(m).padStart(2, "0") + ":" + String(r).padStart(2, "0");
}}
async function api(path, method, body){{
  const r = await fetch(path, {{method,
    headers: {{"Content-Type": "application/json"}},
    body: body ? JSON.stringify(body) : undefined}});
  return r.json();
}}

function startRest(eid){{
  stopRest(eid);
  const inp = document.getElementById("rest-" + eid);
  inp.dataset.dirty = "";
  timers[eid] = {{start: Date.now()}};
  timers[eid].iv = setInterval(() => tick(eid), 500);
  tick(eid);
}}
function tick(eid){{
  const t = timers[eid];
  if (!t) return;
  const s = Math.floor((Date.now() - t.start) / 1000);
  document.getElementById("tdisp-" + eid).textContent = fmt(s);
  const inp = document.getElementById("rest-" + eid);
  if (!inp.dataset.dirty && document.activeElement !== inp) inp.value = s;
}}
function stopRest(eid){{
  const t = timers[eid];
  if (t) clearInterval(t.iv);
  delete timers[eid];
  const d = document.getElementById("tdisp-" + eid);
  if (d) d.textContent = "00:00";
}}
function elapsed(eid){{
  const t = timers[eid];
  return t ? Math.floor((Date.now() - t.start) / 1000) : 0;
}}

async function logSet(eid){{
  const w = document.getElementById("w-" + eid).value.trim();
  const r = document.getElementById("r-" + eid).value.trim();
  const restInp = document.getElementById("rest-" + eid);
  if (timers[eid] && !restInp.dataset.dirty)
    restInp.value = elapsed(eid);  // auto-fill from the running timer
  const body = {{exercise_id: eid}};
  if (w !== "") body.weight_lb = parseFloat(w);
  if (r !== "") body.reps = parseInt(r, 10);
  if (restInp.value.trim() !== "")
    body.rest_seconds = parseInt(restInp.value.trim(), 10);
  const res = await api("/api/sessions/" + SESSION_ID + "/sets", "POST", body);
  if (res.error) {{ alert(res.error); return; }}
  stopRest(eid);
  restInp.dataset.dirty = "";
  load();
}}
async function delSet(setId){{
  if (!confirm("Delete this set?")) return;
  await api("/api/sessions/" + SESSION_ID + "/sets/" + setId, "DELETE");
  load();
}}
async function logTravel(){{
  const p = document.getElementById("pushups").value.trim();
  const s = document.getElementById("situps").value.trim();
  const body = {{date: travelDate}};
  if (p !== "") body.pushups = parseInt(p, 10);
  if (s !== "") body.situps = parseInt(s, 10);
  const res = await api("/api/travel", "POST", body);
  if (res.error) alert(res.error);
  else {{ document.getElementById("tmsg").textContent = "logged ✔"; load(); }}
}}

let travelDate = null;
function renderTravel(data){{
  travelDate = data.date;
  document.getElementById("title").textContent = "✈️ Travel day " + data.date;
  document.getElementById("content").innerHTML = `
    <div class="logrow">
      <label>push-ups<input id="pushups" type="number" inputmode="numeric"></label>
      <label>sit-ups<input id="situps" type="number" inputmode="numeric"></label>
      <button class="primary" onclick="logTravel()">Log</button>
      <span id="tmsg" class="meta"></span>
    </div>
    <p class="meta">Full travel tracking lives on the <a href="/travel">travel page</a>.</p>`;
}}

function render(data){{
  if (data.travel_mode) {{ renderTravel(data); return; }}
  document.getElementById("title").textContent =
    "Day " + data.day_number + " — " + data.day_name + " · " + data.date;
  const c = document.getElementById("content");
  c.innerHTML = "";
  data.sets_by_exercise.forEach(g => {{
    const div = document.createElement("div");
    div.className = "ex" + (g.logged.length ? " open" : "");
    const planned = g.planned.map(p =>
      (p.weight_lb != null ? p.weight_lb + " lb" : "—") + " × " +
      (p.target_reps != null ? p.target_reps : "—")).join(" · ");
    const logged = g.logged.map(l => {{
      const star = l.is_pr ? ' <span class="star">★</span>' : "";
      const rest = l.rest_seconds != null ? " · rest " + l.rest_seconds + "s" : "";
      const num = l.set_number != null ? "Set " + l.set_number + ": " : "";
      return `<div class="logged">${{esc(num)}}${{l.actual_weight_lb != null ?
        esc(l.actual_weight_lb) + " lb × " + esc(l.actual_reps ?? "—") :
        "—"}}${{star}}${{rest}}
        <a href="#" onclick="delSet(${{l.id}});return false;"
          style="color:#9ca3af;font-size:.8rem">del</a></div>`;
    }}).join("");
    const thumb = g.illustration_url
      ? `<img class="thumb" src="${{g.illustration_url}}"
          alt="exercise illustration" loading="lazy"
          onclick="event.stopPropagation();this.classList.toggle('big')">`
      : "";
    div.innerHTML = `
      <div class="exhead" onclick="this.parentNode.classList.toggle('open')">
        <span class="exname">${{thumb}}<span>${{esc(g.exercise_name)}}</span></span>
        <span class="meta">${{g.logged.length}} logged</span>
      </div>
      <div class="exbody">
        <div class="planned">planned: ${{esc(planned) || "—"}}</div>
        ${{logged}}
        <div class="logrow">
          <label>lb<input id="w-${{g.exercise_id}}" type="number"
            inputmode="decimal" step="any"></label>
          <label>reps<input id="r-${{g.exercise_id}}" type="number"
            inputmode="numeric"></label>
          <label>rest s<input id="rest-${{g.exercise_id}}" type="number"
            inputmode="numeric"></label>
          <button class="primary" onclick="logSet(${{g.exercise_id}})">Log set</button>
        </div>
        <div class="timer">
          <span class="tdisp" id="tdisp-${{g.exercise_id}}">00:00</span>
          <button onclick="startRest(${{g.exercise_id}})">Start rest</button>
          <button onclick="stopRest(${{g.exercise_id}})">Reset</button>
        </div>
      </div>`;
    const restInp = div.querySelector("#rest-" + g.exercise_id);
    restInp.addEventListener("input", () => {{ restInp.dataset.dirty = "1"; }});
    c.appendChild(div);
  }});
}}

async function load(){{
  const data = await api("/api/sessions/" + SESSION_ID, "GET");
  if (data.error) {{
    document.getElementById("title").textContent = data.error;
    return;
  }}
  render(data);
}}
load();
</script>
</body></html>"""


@live_bp.get("/log")
def log_picker():
    return render_log_picker()


@live_bp.get("/sessions/<int:session_id>/log")
def session_log_page(session_id):
    return render_session_log(session_id)
