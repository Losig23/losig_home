"""Progress analyzer: per-exercise verdicts from est-1RM trends + rest insights.

Verdict rules (documented in the README):
  - needs >= MIN_SESSIONS (3) sessions with logged sets, else "insufficient_data"
  - least-squares slope of per-session est-1RM over the last SERIES_WINDOW (8)
    sessions: slope >  1.0 lb/session -> "progressing"
                slope < -1.0 lb/session -> "regressing"
                otherwise                -> "plateau"
Rest insight: needs >= REST_MIN_SAMPLES (3) PR sets and >= 3 non-PR sets with
rest_seconds recorded; if |pr_avg - non_pr_avg| >= REST_MIN_DIFF_S (15s) the
insight names the direction, else insight is null.
"""
import html

from flask import Blueprint, jsonify
from sqlalchemy import or_

from app import db
from app.models import Exercise, PlannedSet, RoutineDay, SetLog, WorkoutSession
from app.routes.progress import exercise_progress, sparkline

analysis_bp = Blueprint("analysis", __name__)

MIN_SESSIONS = 3
SERIES_WINDOW = 8
SLOPE_UP = 1.0
SLOPE_DOWN = -1.0
REST_MIN_SAMPLES = 3
REST_MIN_DIFF_S = 15


def _slope(xs, ys):
    """Least-squares slope of y on x."""
    n = len(xs)
    sum_x = sum(xs)
    sum_y = sum(ys)
    sum_xx = sum(x * x for x in xs)
    sum_xy = sum(x * y for x, y in zip(xs, ys))
    denom = n * sum_xx - sum_x * sum_x
    if denom == 0:
        return 0.0
    return (n * sum_xy - sum_x * sum_y) / denom


def _rest_logs(exercise_id):
    """Checked, weighted logs with a recorded rest, oldest first."""
    return (
        SetLog.query.outerjoin(
            PlannedSet, SetLog.planned_set_id == PlannedSet.id
        )
        .join(WorkoutSession, SetLog.session_id == WorkoutSession.id)
        .filter(
            or_(
                SetLog.exercise_id == exercise_id,
                PlannedSet.exercise_id == exercise_id,
            ),
            SetLog.checked.is_(True),
            SetLog.actual_weight_lb.isnot(None),
            SetLog.rest_seconds.isnot(None),
        )
        .order_by(
            WorkoutSession.date.asc(), WorkoutSession.id.asc(), SetLog.id.asc()
        )
        .all()
    )


def _avg(values):
    return round(sum(values) / len(values), 1) if values else None


def analyze_exercise(exercise):
    """Verdict + rest insight for one exercise."""
    progress = exercise_progress(exercise)
    series = progress["series"]
    window = series[-SERIES_WINDOW:]
    values = [p["est_1rm_lb"] for p in window]

    if len(window) < MIN_SESSIONS:
        verdict = "insufficient_data"
        slope = None
    else:
        slope = round(_slope(list(range(len(values))), values), 2)
        if slope > SLOPE_UP:
            verdict = "progressing"
        elif slope < SLOPE_DOWN:
            verdict = "regressing"
        else:
            verdict = "plateau"

    rest_logs = _rest_logs(exercise.id)
    pr_rests = [l.rest_seconds for l in rest_logs if l.is_pr]
    non_pr_rests = [l.rest_seconds for l in rest_logs if not l.is_pr]
    pr_avg = _avg(pr_rests)
    non_pr_avg = _avg(non_pr_rests)

    insight = None
    if (
        len(pr_rests) >= REST_MIN_SAMPLES
        and len(non_pr_rests) >= REST_MIN_SAMPLES
        and pr_avg is not None
        and non_pr_avg is not None
    ):
        diff = pr_avg - non_pr_avg
        if abs(diff) >= REST_MIN_DIFF_S:
            direction = "longer" if diff > 0 else "shorter"
            insight = (
                f"PR sets average {abs(diff):.0f}s {direction} rests "
                f"({pr_avg:.0f}s vs {non_pr_avg:.0f}s) — "
                f"consider resting {direction} before top sets."
            )

    return {
        "exercise_id": exercise.id,
        "name": exercise.name,
        "day_number": exercise.day.day_number,
        "day_name": exercise.day.name,
        "verdict": verdict,
        "sessions_used": len(window),
        "slope_lb_per_session": slope,
        "first_est_1rm": values[0] if values else None,
        "latest_est_1rm": values[-1] if values else None,
        "last_session_date": window[-1]["date"] if window else None,
        "rest": {
            "avg_rest_seconds": _avg([l.rest_seconds for l in rest_logs]),
            "pr_avg_rest_seconds": pr_avg,
            "non_pr_avg_rest_seconds": non_pr_avg,
            "pr_samples": len(pr_rests),
            "non_pr_samples": len(non_pr_rests),
            "insight": insight,
        },
        # Internal: est-1RM series for the page's sparkline (stripped from
        # the JSON API response).
        "_series_values": values,
    }


PAGE_STYLE = """<style>
body{font-family:system-ui,sans-serif;max-width:960px;margin:2rem auto;
padding:0 1rem;color:#111827}
.day{margin-top:2rem}
.card{border:1px solid #e5e7eb;border-radius:8px;padding:.75rem 1rem;
margin:.6rem 0}
.card .head{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap}
.card .head a{font-weight:600}
.badge{font-size:.75rem;font-weight:700;padding:.15rem .6rem;border-radius:999px;
color:#fff;text-transform:uppercase;letter-spacing:.03em}
.badge.progressing{background:#16a34a}
.badge.plateau{background:#d97706}
.badge.regressing{background:#dc2626}
.badge.insufficient_data{background:#6b7280}
.meta{color:#6b7280;font-size:.9rem;margin-top:.3rem}
.rest{font-size:.9rem;margin-top:.3rem;color:#374151}
.dim{opacity:.55}
a{color:#2563eb}
.spark{vertical-align:middle;margin-left:.5rem}
.rules{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;
padding:.75rem 1rem;font-size:.9rem;color:#374151}
</style>"""


def _verdict_badge(verdict):
    label = verdict.replace("_", " ")
    return f'<span class="badge {verdict}">{html.escape(label)}</span>'


def render_analysis_page(results):
    """results: list of (analysis_dict, series_values)."""
    with_data = [r for r in results if r[0]["verdict"] != "insufficient_data"]
    without = [r for r in results if r[0]["verdict"] == "insufficient_data"]

    sections = ""
    last_day = None
    for analysis, values in with_data:
        if analysis["day_number"] != last_day:
            if last_day is not None:
                sections += "</div>"
            sections += (
                f'<div class="day"><h2>Day {analysis["day_number"]} — '
                f'{html.escape(analysis["day_name"])}</h2>'
            )
            last_day = analysis["day_number"]
        spark = (
            f'<span class="spark">{sparkline(values)}</span>'
            if len(values) >= 2
            else ""
        )
        slope = analysis["slope_lb_per_session"]
        slope_txt = f"{slope:+.2f} lb/session" if slope is not None else "—"
        first, latest = analysis["first_est_1rm"], analysis["latest_est_1rm"]
        trend_txt = (
            f"est 1RM {first:.1f} → {latest:.1f} lb"
            if first is not None
            else "no logged sets yet"
        )
        rest = analysis["rest"]
        rest_line = ""
        if rest["insight"]:
            rest_line = f'<div class="rest">⏱ {html.escape(rest["insight"])}</div>'
        elif rest["avg_rest_seconds"] is not None:
            rest_line = (
                f'<div class="rest">⏱ avg rest '
                f'{rest["avg_rest_seconds"]:.0f}s '
                f'({rest["pr_samples"] + rest["non_pr_samples"]} sets logged)</div>'
            )
        sections += f"""
<div class="card">
<div class="head"><a href="/exercises/{analysis["exercise_id"]}/progress">
{html.escape(analysis["name"])}</a>
{_verdict_badge(analysis["verdict"])}{spark}</div>
<div class="meta">{slope_txt} · {trend_txt} ·
{analysis["sessions_used"]} sessions · last {analysis["last_session_date"]}</div>
{rest_line}
</div>"""
    if last_day is not None:
        sections += "</div>"

    thin = ""
    if without:
        items = "".join(
            f'<li><a href="/exercises/{a["exercise_id"]}/progress">'
            f'{html.escape(a["name"])}</a> '
            f'<span class="meta">(Day {a["day_number"]} — '
            f'{a["sessions_used"]}/{MIN_SESSIONS} sessions)</span></li>'
            for a, _ in without
        )
        thin = (f'<div class="day dim"><h2>Not enough data yet</h2>'
                f"<p>Log at least 3 sessions per exercise to get a verdict.</p>"
                f"<ul>{items}</ul></div>")

    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Progress Analysis — losig_home</title>{PAGE_STYLE}</head><body>
<h1>Progress Analysis</h1>
<div class="rules">Verdict = least-squares slope of per-session est-1RM
(Epley) over the last {SERIES_WINDOW} sessions:
<b>progressing</b> &gt; +{SLOPE_UP:.0f} lb/session,
<b>regressing</b> &lt; {SLOPE_DOWN:.0f} lb/session,
otherwise <b>plateau</b>. Needs ≥ {MIN_SESSIONS} sessions.
Rest insight needs ≥ {REST_MIN_SAMPLES} PR and ≥ {REST_MIN_SAMPLES} non-PR
sets with recorded rests and a ≥ {REST_MIN_DIFF_S}s gap.</div>
{sections}
{thin}
</body></html>"""


@analysis_bp.get("/api/analysis")
def api_analysis():
    exercises = (
        Exercise.query.join(RoutineDay)
        .order_by(RoutineDay.day_number, Exercise.position)
        .all()
    )
    out = []
    for ex in exercises:
        data = analyze_exercise(ex)
        if data["sessions_used"] == 0:
            continue
        data.pop("_series_values", None)
        out.append(data)
    return jsonify(out)


@analysis_bp.get("/analysis")
def analysis_page():
    exercises = (
        Exercise.query.join(RoutineDay)
        .order_by(RoutineDay.day_number, Exercise.position)
        .all()
    )
    results = []
    for ex in exercises:
        data = analyze_exercise(ex)
        if data["sessions_used"] == 0:
            continue
        values = data.pop("_series_values")
        results.append((data, values))
    from app.routes.ui import wrap_page

    return wrap_page(render_analysis_page(results), active="analysis")
