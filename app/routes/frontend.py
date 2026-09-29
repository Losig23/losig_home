"""Localhost frontend: dashboard + food page.

Vanilla server-rendered pages, no build step, no JS frameworks. This is the
verification UI Ani asked for; the apartment game will eventually replace it
(the ``/game`` URL namespace is reserved for that).
"""
import html
from datetime import date, timedelta

from flask import Blueprint, render_template

from app import db
from app.models import Exercise, MealLog, WorkoutSession
from app.routes.analysis import analyze_exercise
from app.routes.bodyweight import compute_stats as bodyweight_stats
from app.routes.travel import compute_travel_stats
from app.routes.ui import NAV

frontend_bp = Blueprint("frontend", __name__)


def _page(title, body, active, page_styles=""):
    return render_template(
        "base.html", title=title, page_styles=page_styles, content=body,
        nav=NAV, active=active,
    )


def _fmt(value, suffix=""):
    return f"{value}{suffix}" if value is not None else "—"


def _dashboard_body(bw, meals, meal_totals, today, week_sessions, travel,
                    verdict_counts):
    latest = bw["latest"] or {}

    if latest:
        bw_main = f"{latest['weight_lb']:.1f} lb"
        bw_sub = (f"{html.escape(str(latest.get('date', '')))} · "
                  f"7-day avg {_fmt(bw['avg_7_day'], ' lb')}")
    else:
        bw_main, bw_sub = "—", '<span class="empty">no weigh-ins yet</span>'

    if meal_totals["meal_count"]:
        meal_main = f"{meal_totals['calories']:.0f} cal"
        meal_sub = (f"{meal_totals['meal_count']} meals · "
                    f"P {meal_totals['protein_g']:.0f}g / "
                    f"C {meal_totals['carbs_g']:.0f}g / "
                    f"F {meal_totals['fat_g']:.0f}g")
    else:
        meal_main, meal_sub = "—", '<span class="empty">nothing logged today</span>'

    if week_sessions:
        sess_rows = "".join(
            f"<div>{html.escape(str(s.date))} — "
            f"{'travel' if s.travel_mode else html.escape(s.day.name if s.day else 'session')} "
            f"({_fmt(s.completed_pct, '%')})</div>"
            for s in week_sessions[:5]
        )
        sess_sub = f"{len(week_sessions)} sessions this week{sess_rows}"
    else:
        sess_sub = '<span class="empty">no sessions this week</span>'

    travel_main = f"{travel.get('total_pushups', 0):.0f}↑ / {travel.get('total_situps', 0):.0f}"
    travel_sub = f"{travel.get('day_count', 0)} travel days logged"

    verdict_bits = " · ".join(
        f"{n} {k.replace('_', ' ')}"
        for k, n in sorted(verdict_counts.items()) if n
    ) or '<span class="empty">log sets to get verdicts</span>'

    return f"""
<h1>Dashboard</h1>
<p style="color:#6b7280">losig_home at a glance — {html.escape(today)}</p>
<div class="card-grid">
  <a class="dash-card" href="/bodyweight">
    <div class="kicker">Bodyweight</div>
    <div class="big">{bw_main}</div>
    <div class="sub">{bw_sub}</div>
  </a>
  <a class="dash-card" href="/food">
    <div class="kicker">Food · today</div>
    <div class="big">{meal_main}</div>
    <div class="sub">{meal_sub}</div>
  </a>
  <a class="dash-card" href="/log">
    <div class="kicker">Workouts · this week</div>
    <div class="big">{len(week_sessions)}</div>
    <div class="sub">{sess_sub}</div>
  </a>
  <a class="dash-card" href="/travel">
    <div class="kicker">Travel</div>
    <div class="big">{travel_main}</div>
    <div class="sub">{travel_sub}</div>
  </a>
  <a class="dash-card" href="/analysis">
    <div class="kicker">Analyzer</div>
    <div class="big">{sum(verdict_counts.values())} exercises</div>
    <div class="sub">{verdict_bits}</div>
  </a>
  <a class="dash-card" href="/progress">
    <div class="kicker">Strength</div>
    <div class="big">charts</div>
    <div class="sub">per-exercise est-1RM curves with PR stars</div>
  </a>
</div>
"""


def _food_body():
    return """
<h1>Food Log</h1>

<h2>Log a meal</h2>
<form id="meal-form">
  <div class="form-row">
    <label>Description <input type="text" id="f-desc" required
      placeholder="e.g. chicken biryani, 2 cups" style="min-width:16rem"></label>
    <label>Photo <input type="file" id="f-photo" accept="image/*"></label>
  </div>
  <div class="form-row">
    <label>Calories <input type="number" id="f-cal" step="any" min="0"></label>
    <label>Protein g <input type="number" id="f-pro" step="any" min="0"></label>
    <label>Carbs g <input type="number" id="f-carb" step="any" min="0"></label>
    <label>Fat g <input type="number" id="f-fat" step="any" min="0"></label>
  </div>
  <p style="color:#6b7280;font-size:.85rem">Manual macros are a fallback — if
  the CalorieNinjas key is configured the description is estimated
  automatically.</p>
  <button class="btn" type="submit">Log meal</button>
</form>
<div id="meal-result"></div>

<h2>Meals</h2>
<div class="form-row">
  <label>Date <input type="date" id="f-date"></label>
</div>
<div class="totals-bar" id="totals"></div>
<div class="meal-list" id="meals"></div>

<script>
const $ = id => document.getElementById(id);
const dateInput = $("f-date");
dateInput.value = new Date().toISOString().slice(0, 10);

function fmt(v, suffix) {
  return (v === null || v === undefined) ? "—" : v + suffix;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
}

async function loadDay() {
  const day = dateInput.value;
  const [mealsRes, totalsRes] = await Promise.all([
    fetch("/api/meals?date=" + day),
    fetch("/api/meals/daily?date=" + day),
  ]);
  const meals = await mealsRes.json();
  const t = await totalsRes.json();

  $("totals").innerHTML =
    `<div class="t"><b>${fmt(t.calories, "")}</b><span>calories</span></div>` +
    `<div class="t"><b>${fmt(t.protein_g, "g")}</b><span>protein</span></div>` +
    `<div class="t"><b>${fmt(t.carbs_g, "g")}</b><span>carbs</span></div>` +
    `<div class="t"><b>${fmt(t.fat_g, "g")}</b><span>fat</span></div>` +
    `<div class="t"><b>${t.meal_count}</b><span>meals</span></div>`;

  $("meals").innerHTML = meals.length ? meals.map(m => `
    <div class="meal">
      ${m.photo_url ? `<img src="${m.photo_url}" alt="">` : ""}
      <div>
        <div>${esc(m.description)}<span class="src">${esc(m.source)}</span></div>
        <div class="macros">${fmt(m.calories, " cal")} ·
          P ${fmt(m.protein_g, "g")} · C ${fmt(m.carbs_g, "g")} ·
          F ${fmt(m.fat_g, "g")}</div>
      </div>
    </div>`).join("")
    : "<p style='color:#6b7280'>No meals logged for this day.</p>";
}

$("meal-form").addEventListener("submit", async e => {
  e.preventDefault();
  const fd = new FormData();
  fd.append("description", $("f-desc").value.trim());
  const photo = $("f-photo").files[0];
  if (photo) fd.append("photo", photo);
  const manual = {calories: "f-cal", protein_g: "f-pro", carbs_g: "f-carb", fat_g: "f-fat"};
  for (const [k, id] of Object.entries(manual)) {
    if ($(id).value !== "") fd.append(k, $(id).value);
  }
  const res = await fetch("/api/meals", {method: "POST", body: fd});
  const box = $("meal-result");
  if (res.ok) {
    const m = await res.json();
    box.className = "result-box";
    box.innerHTML = `Logged via <b>${m.source}</b>: ${fmt(m.calories, " cal")} ·
      P ${fmt(m.protein_g, "g")} · C ${fmt(m.carbs_g, "g")} · F ${fmt(m.fat_g, "g")}`;
    $("f-desc").value = ""; $("f-photo").value = "";
    ["f-cal", "f-pro", "f-carb", "f-fat"].forEach(id => $(id).value = "");
    loadDay();
  } else {
    const err = await res.json().catch(() => ({}));
    box.className = "result-box error";
    box.textContent = "Error: " + (err.error || res.status);
  }
});

dateInput.addEventListener("change", loadDay);
loadDay();
</script>
"""


@frontend_bp.get("/")
def dashboard():
    bw = bodyweight_stats()
    today = date.today().isoformat()
    meals = (
        MealLog.query.filter(db.func.date(MealLog.logged_at) == today)
        .order_by(MealLog.logged_at.asc())
        .all()
    )
    meal_totals = {
        "calories": round(sum(m.calories or 0 for m in meals), 1),
        "protein_g": round(sum(m.protein_g or 0 for m in meals), 1),
        "carbs_g": round(sum(m.carbs_g or 0 for m in meals), 1),
        "fat_g": round(sum(m.fat_g or 0 for m in meals), 1),
        "meal_count": len(meals),
    }

    monday = date.today() - timedelta(days=date.today().weekday())
    week_sessions = (
        WorkoutSession.query.filter(WorkoutSession.date >= monday)
        .order_by(WorkoutSession.date.desc())
        .all()
    )

    travel = compute_travel_stats()

    verdict_counts = {}
    for ex in Exercise.query.all():
        v = analyze_exercise(ex)["verdict"]
        verdict_counts[v] = verdict_counts.get(v, 0) + 1

    return _page(
        "Dashboard",
        _dashboard_body(bw, meals, meal_totals, today, week_sessions, travel,
                        verdict_counts),
        active="dashboard",
    )


@frontend_bp.get("/food")
def food_page():
    return _page("Food Log", _food_body(), active="food")


_CALENDAR_STYLES = """
<style>
.cal-controls{display:flex;align-items:center;gap:1rem;margin:1rem 0}
.cal-controls #cal-title{font-size:1.25rem;font-weight:700;min-width:12rem;text-align:center}
.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;background:var(--card);
  border:1px solid var(--line);border-radius:10px;padding:.75rem}
.cal-dow{text-align:center;font-size:.72rem;color:var(--muted);text-transform:uppercase;padding:.25rem}
.cal-cell{min-height:64px;border:1px solid var(--line);border-radius:6px;padding:.3rem;
  cursor:pointer;position:relative;background:#fff}
.cal-cell.blank{background:transparent;border:none;cursor:default}
.cal-cell:hover{border-color:var(--accent)}
.cal-cell .cal-num{font-size:.85rem;color:var(--muted)}
.cal-cell.today{border-color:var(--accent)}
.cal-cell.today .cal-num{font-weight:700;color:var(--accent)}
.cal-cell.selected{background:#eff6ff;border-color:var(--accent)}
.cal-cell.has-sessions{background:#f8fafc}
.cal-badge{position:absolute;bottom:.3rem;right:.4rem;background:var(--accent);color:#fff;
  font-size:.7rem;border-radius:999px;padding:.05rem .45rem}
.sess-actions{display:flex;flex-direction:column;gap:.4rem}
.sess-modify .form-row{margin:.5rem 0}
@media (max-width:640px){
  .cal-cell{min-height:48px}
  .sess-actions{flex-direction:row;flex-wrap:wrap}
}
</style>
"""


def _calendar_body():
    return """
<h1>Workout Calendar</h1>
<p style="color:#6b7280">Browse sessions by day — open, export, modify, or delete them.</p>
<div class="cal-controls">
  <button class="btn secondary" id="cal-prev">&larr; Prev</button>
  <div id="cal-title"></div>
  <button class="btn secondary" id="cal-next">Next &rarr;</button>
</div>
<div class="cal-grid" id="cal-grid"></div>
<div id="day-panel" style="margin-top:1.5rem"></div>

<script>
const $ = id => document.getElementById(id);
let viewY, viewM; // viewM is 1-based
let monthData = {};
let selectedDay = null;
let routineDays = [];
const todayIso = new Date().toISOString().slice(0, 10);

function pad(n) { return String(n).padStart(2, "0"); }
function isoOf(y, m, d) { return y + "-" + pad(m) + "-" + pad(d); }
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
}

async function loadRoutine() {
  const res = await fetch("/api/routine");
  const days = await res.json();
  routineDays = days.map(d => ({n: d.day_number, name: d.name}));
}

async function loadMonth() {
  const res = await fetch(`/api/sessions/calendar?year=${viewY}&month=${viewM}`);
  monthData = await res.json();
  renderGrid();
  renderPanel();
}

function renderGrid() {
  $("cal-title").textContent =
    new Date(viewY, viewM - 1, 1).toLocaleString("en-US", {month: "long", year: "numeric"});
  const firstDow = (new Date(viewY, viewM - 1, 1).getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(viewY, viewM, 0).getDate();
  let cells = "";
  ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    .forEach(d => { cells += `<div class="cal-dow">${d}</div>`; });
  for (let i = 0; i < firstDow; i++) cells += '<div class="cal-cell blank"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = isoOf(viewY, viewM, d);
    const n = (monthData[iso] || []).length;
    const cls = ["cal-cell"];
    if (iso === todayIso) cls.push("today");
    if (iso === selectedDay) cls.push("selected");
    if (n) cls.push("has-sessions");
    const badge = n ? `<span class="cal-badge">${n}</span>` : "";
    cells += `<div class="${cls.join(" ")}" data-day="${iso}">` +
      `<span class="cal-num">${d}</span>${badge}</div>`;
  }
  $("cal-grid").innerHTML = cells;
  $("cal-grid").querySelectorAll("[data-day]").forEach(el => {
    el.addEventListener("click", () => {
      selectedDay = el.dataset.day;
      renderGrid();
      renderPanel();
    });
  });
}

function dayOptions(current) {
  return routineDays.map(d =>
    `<option value="${d.n}"${d.n === current ? " selected" : ""}>` +
    `Day ${d.n} — ${esc(d.name)}</option>`).join("");
}

function sessionCard(s) {
  const name = s.travel_mode ? "Travel session" : esc(s.day_name || "No routine day");
  const dayTag = s.day_number ? `<span class="src">Day ${s.day_number}</span>` : "";
  const pct = (s.completion_pct === null || s.completion_pct === undefined)
    ? "—" : s.completion_pct + "%";
  return `
  <div class="meal" data-id="${s.id}">
    <div style="flex:1;min-width:0">
      <div><b>${name}</b>${dayTag}</div>
      <div class="macros">${s.set_count} sets &middot; ${s.checked_count} checked &middot; ${pct} complete</div>
      <div class="sess-modify" hidden>
        <div class="form-row">
          <label>Date <input type="date" class="m-date" value="${s.date}"></label>
          <label>Routine day <select class="m-day">${dayOptions(s.day_number)}</select></label>
          <button class="btn secondary m-apply" type="button">Apply</button>
        </div>
      </div>
    </div>
    <div class="sess-actions">
      <a class="btn secondary" href="/sessions/${s.id}/log">Open</a>
      <a class="btn secondary" href="/api/sessions/${s.id}/export">Export</a>
      <button class="btn secondary m-toggle" type="button">Modify</button>
      <button class="btn secondary m-delete" type="button">Delete</button>
    </div>
  </div>`;
}

function renderPanel() {
  const box = $("day-panel");
  if (!selectedDay) {
    box.innerHTML = '<p style="color:#6b7280">Select a day to see its sessions.</p>';
    return;
  }
  const sessions = monthData[selectedDay] || [];
  if (!sessions.length) {
    box.innerHTML = `<h2>${esc(selectedDay)}</h2>` +
      '<p style="color:#6b7280">No sessions logged on this day.</p>';
    return;
  }
  box.innerHTML = `<h2>${esc(selectedDay)}</h2>` + sessions.map(sessionCard).join("");
  box.querySelectorAll(".meal[data-id]").forEach(card => {
    const id = card.dataset.id;
    const mod = card.querySelector(".sess-modify");
    card.querySelector(".m-toggle").addEventListener("click", () => {
      mod.hidden = !mod.hidden;
    });
    card.querySelector(".m-apply").addEventListener("click", async () => {
      const payload = {
        date: card.querySelector(".m-date").value,
        day_number: parseInt(card.querySelector(".m-day").value, 10),
      };
      const res = await fetch(`/api/sessions/${id}`, {
        method: "PATCH",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(payload),
      });
      if (res.ok) { await loadMonth(); }
      else {
        const err = await res.json().catch(() => ({}));
        alert("Error: " + (err.error || res.status));
      }
    });
    card.querySelector(".m-delete").addEventListener("click", async () => {
      if (!confirm("Delete this session and its logged sets?")) return;
      const res = await fetch(`/api/sessions/${id}`, {method: "DELETE"});
      if (res.ok) { await loadMonth(); }
      else { alert("Delete failed: " + res.status); }
    });
  });
}

function shiftMonth(delta) {
  viewM += delta;
  if (viewM < 1) { viewM = 12; viewY--; }
  if (viewM > 12) { viewM = 1; viewY++; }
  selectedDay = null;
  loadMonth();
}

$("cal-prev").addEventListener("click", () => shiftMonth(-1));
$("cal-next").addEventListener("click", () => shiftMonth(1));

const now = new Date();
viewY = now.getFullYear();
viewM = now.getMonth() + 1;
loadRoutine().then(loadMonth);
</script>
"""


@frontend_bp.get("/calendar")
def calendar_page():
    return _page("Calendar", _calendar_body(), active="calendar",
                 page_styles=_CALENDAR_STYLES)
