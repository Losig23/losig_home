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


def _page(title, body, active):
    return render_template(
        "base.html", title=title, page_styles="", content=body, nav=NAV,
        active=active,
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
