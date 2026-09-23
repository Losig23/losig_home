"""Progressive overload: per-exercise progress API + server-rendered charts.

Strength is tracked with the Epley estimated one-rep max:
    est_1rm = weight * (1 + reps / 30)
"""
import html

from flask import Blueprint, jsonify

from app import db
from app.lifting import est_1rm
from app.models import Exercise, PlannedSet, RoutineDay, SetLog, WorkoutSession

progress_bp = Blueprint("progress", __name__)


def _weighted_logs(exercise_id):
    """All checked, weighted set logs for an exercise, oldest first."""
    return (
        SetLog.query.join(PlannedSet, SetLog.planned_set_id == PlannedSet.id)
        .join(WorkoutSession, SetLog.session_id == WorkoutSession.id)
        .filter(
            PlannedSet.exercise_id == exercise_id,
            SetLog.checked.is_(True),
            SetLog.actual_weight_lb.isnot(None),
        )
        .order_by(
            WorkoutSession.date.asc(), WorkoutSession.id.asc(), SetLog.id.asc()
        )
        .all()
    )


def exercise_progress(exercise):
    """Series + summary + PR dates for one exercise.

    Sessions with no weighted sets are skipped; everything else is ordered
    chronologically.
    """
    logs = _weighted_logs(exercise.id)

    # Group logs by session, preserving chronological order.
    sessions = {}
    order = []
    for log in logs:
        sid = log.session_id
        if sid not in sessions:
            sessions[sid] = []
            order.append(sid)
        sessions[sid].append(log)

    series = []
    for sid in order:
        logs_for_session = sessions[sid]
        best = max(
            logs_for_session,
            key=lambda l: est_1rm(l.actual_weight_lb, l.actual_reps),
        )
        top_weight = max(l.actual_weight_lb for l in logs_for_session)
        volume = sum(
            (l.actual_weight_lb or 0) * (l.actual_reps or 0)
            for l in logs_for_session
        )
        series.append(
            {
                "date": best.session.date.isoformat(),
                "session_id": sid,
                "top_weight_lb": round(top_weight, 1),
                "top_set": {
                    "weight_lb": best.actual_weight_lb,
                    "reps": best.actual_reps,
                },
                "est_1rm_lb": est_1rm(best.actual_weight_lb, best.actual_reps),
                "volume_lb": round(volume, 1),
            }
        )

    if not series:
        summary = {
            "current_est_1rm_lb": None,
            "all_time_pr": None,
            "first_est_1rm_lb": None,
            "delta_lb": None,
            "session_count": 0,
        }
        return {"series": [], "summary": summary, "pr_dates": []}

    # Walk sets chronologically; a strictly higher est-1RM marks a PR date.
    best_so_far = None
    best_set = None
    pr_dates = []
    for log in logs:
        value = est_1rm(log.actual_weight_lb, log.actual_reps)
        if best_so_far is None or value > best_so_far:
            best_so_far = value
            best_set = log
            pr_dates.append(log.session.date.isoformat())
    pr_dates = sorted(set(pr_dates))

    summary = {
        "current_est_1rm_lb": series[-1]["est_1rm_lb"],
        "all_time_pr": {
            "weight_lb": best_set.actual_weight_lb,
            "reps": best_set.actual_reps,
            "date": best_set.session.date.isoformat(),
        },
        "first_est_1rm_lb": series[0]["est_1rm_lb"],
        "delta_lb": round(series[-1]["est_1rm_lb"] - series[0]["est_1rm_lb"], 1),
        "session_count": len(series),
    }
    return {"series": series, "summary": summary, "pr_dates": pr_dates}


def latest_est_1rm(exercise_id):
    """Latest est-1RM for an exercise, or None when nothing is logged."""
    logs = _weighted_logs(exercise_id)
    if not logs:
        return None
    last = logs[-1]
    return est_1rm(last.actual_weight_lb, last.actual_reps)


def render_progress_svg(progress, width=880, height=420):
    """Est-1RM line over time with gold stars on PR dates."""
    series = progress["series"]
    pr_dates = set(progress["pr_dates"])
    pad = {"l": 64, "r": 24, "t": 36, "b": 56}

    values = [p["est_1rm_lb"] for p in series]
    lo = min(values) - 5
    hi = max(values) + 5
    if hi - lo < 1:
        lo, hi = lo - 1, hi + 1

    n = len(series)

    def x(i):
        frac = i / (n - 1) if n > 1 else 0.5
        return pad["l"] + frac * (width - pad["l"] - pad["r"])

    def y(v):
        frac = (v - lo) / (hi - lo)
        return pad["t"] + (1 - frac) * (height - pad["t"] - pad["b"])

    grid = []
    for k in range(6):
        val = lo + k * (hi - lo) / 5
        gy = y(val)
        grid.append(
            f'<line x1="{pad["l"]}" y1="{gy:.1f}" x2="{width - pad["r"]}" '
            f'y2="{gy:.1f}" stroke="#e5e7eb"/>'
            f'<text x="{pad["l"] - 10}" y="{gy + 4:.1f}" text-anchor="end" '
            f'font-size="12" fill="#6b7280">{val:.0f}</text>'
        )

    # Session ticks with dates (~6 evenly spaced).
    tick_idxs = sorted({round(i * (n - 1) / 5) for i in range(6)}) if n > 1 else [0]
    ticks = []
    for i in tick_idxs:
        tx = x(i)
        ticks.append(
            f'<line x1="{tx:.1f}" y1="{height - pad["b"]}" '
            f'x2="{tx:.1f}" y2="{height - pad["b"] + 6}" stroke="#9ca3af"/>'
            f'<text x="{tx:.1f}" y="{height - pad["b"] + 22}" '
            f'text-anchor="middle" font-size="12" fill="#6b7280">'
            f'{series[i]["date"][5:]}</text>'
        )

    pts = " ".join(f"{x(i):.1f},{y(values[i]):.1f}" for i in range(n))
    line = (
        f'<polyline points="{pts}" fill="none" stroke="#2563eb" '
        f'stroke-width="2.5"/>'
        if n > 1
        else ""
    )

    dots = ""
    for i, p in enumerate(series):
        px, py = x(i), y(values[i])
        dots += (
            f'<circle cx="{px:.1f}" cy="{py:.1f}" r="4.5" fill="#2563eb">'
            f"<title>{p['date']}: {p['top_set']['weight_lb']} lb x "
            f"{p['top_set']['reps']} (est 1RM {values[i]:.1f})</title></circle>"
        )
        if p["date"] in pr_dates:
            dots += (
                f'<text x="{px:.1f}" y="{py - 14:.1f}" text-anchor="middle" '
                f'font-size="20" fill="#f59e0b" aria-label="PR">★</text>'
            )

    imin = values.index(min(values))
    imax = values.index(max(values))
    annot = ""
    for i, label in ((imin, "low"), (imax, "high")):
        annot += (
            f'<text x="{x(i):.1f}" y="{y(values[i]) + 26:.1f}" '
            f'text-anchor="middle" font-size="12" fill="#6b7280">'
            f"{label} {values[i]:.1f}</text>"
        )

    return (
        f'<svg width="{width}" height="{height}" viewBox="0 0 {width} {height}" '
        f'role="img" aria-label="Estimated one-rep max over time">'
        f'<rect x="0" y="0" width="{width}" height="{height}" fill="#ffffff"/>'
        f'{"".join(grid)}{"".join(ticks)}'
        f"{line}{dots}{annot}"
        f'<text x="{width - pad["r"]}" y="{pad["t"] - 8}" text-anchor="end" '
        f'font-size="12" fill="#2563eb">est 1RM (Epley)</text>'
        f'<text x="{pad["l"]}" y="{height - 8}" font-size="12" '
        f'fill="#6b7280">est 1RM (lb)</text>'
        f"</svg>"
    )


def sparkline(values, width=120, height=28):
    """Tiny trend sparkline; only rendered when there are 2+ points."""
    lo, hi = min(values), max(values)
    span = hi - lo if hi - lo else 1

    def x(i):
        return 2 + i / (len(values) - 1) * (width - 4)

    def y(v):
        return 3 + (1 - (v - lo) / span) * (height - 6)

    pts = " ".join(f"{x(i):.1f},{y(v):.1f}" for i, v in enumerate(values))
    return (
        f'<svg width="{width}" height="{height}" viewBox="0 0 {width} {height}" '
        f'role="img" aria-label="trend sparkline">'
        f'<polyline points="{pts}" fill="none" stroke="#2563eb" '
        f'stroke-width="1.5"/></svg>'
    )


PAGE_STYLE = """<style>
body{font-family:system-ui,sans-serif;max-width:960px;margin:2rem auto;
padding:0 1rem;color:#111827}
.stats{display:flex;gap:1rem;flex-wrap:wrap;margin:1rem 0}
.card{border:1px solid #e5e7eb;border-radius:8px;padding:.75rem 1.25rem}
.card b{font-size:1.4rem}.card span{color:#6b7280;font-size:.85rem}
table{border-collapse:collapse;margin-top:1rem;width:100%}
td,th{border:1px solid #e5e7eb;padding:.4rem .8rem;text-align:left}
.day{margin-top:2rem}a{color:#2563eb}
.day li{margin:.35rem 0}.spark{vertical-align:middle;margin-left:.5rem}
</style>"""


def render_exercise_page(exercise, progress):
    name = html.escape(exercise.name)
    summary = progress["summary"]

    if not progress["series"]:
        body = ("<p>No logged sets yet. Check off a session with actual "
                "weights and your progress curve will appear here.</p>")
    else:
        chart = render_progress_svg(progress)
        pr = summary["all_time_pr"]
        delta = summary["delta_lb"]
        delta_txt = f"+{delta:.1f} lb" if delta >= 0 else f"{delta:.1f} lb"
        body = f"""
<div class="stats">
<div class="card"><span>current est 1RM</span><br>
<b>{summary["current_est_1rm_lb"]:.1f} lb</b></div>
<div class="card"><span>all-time PR</span><br>
<b>{pr["weight_lb"]} × {pr["reps"]}</b> <span>{pr["date"]}</span></div>
<div class="card"><span>since first session</span><br><b>{delta_txt}</b></div>
<div class="card"><span>sessions logged</span><br>
<b>{summary["session_count"]}</b></div>
</div>
{chart}
<table><tr><th>date</th><th>top set</th><th>est 1RM</th><th>volume</th>
<th>PR</th></tr>
"""
        for p in reversed(progress["series"]):
            star = "★" if p["date"] in progress["pr_dates"] else ""
            top = p["top_set"]
            body += (
                f"<tr><td>{p['date']}</td>"
                f"<td>{top['weight_lb']} lb × {top['reps']}</td>"
                f"<td>{p['est_1rm_lb']:.1f} lb</td>"
                f"<td>{p['volume_lb']:.1f} lb</td>"
                f"<td>{star}</td></tr>"
            )
        body += "</table>"

    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>{name} — Progress</title>{PAGE_STYLE}</head><body>
<p><a href="/progress">← all exercises</a></p>
<h1>{name} <span style="color:#6b7280;font-size:1rem">progress</span></h1>
{body}
</body></html>"""


def render_index_page():
    days = RoutineDay.query.order_by(RoutineDay.day_number).all()
    sections = ""
    for day in days:
        items = ""
        for ex in day.exercises:
            progress = exercise_progress(ex)
            current = progress["summary"]["current_est_1rm_lb"]
            label = (
                f" — {current:.1f} lb est 1RM" if current is not None else ""
            )
            spark = ""
            values = [p["est_1rm_lb"] for p in progress["series"]]
            if len(values) >= 2:
                spark = f'<span class="spark">{sparkline(values)}</span>'
            items += (
                f'<li><a href="/exercises/{ex.id}/progress">'
                f'{html.escape(ex.name)}</a>{label}{spark}</li>'
            )
        sections += (
            f'<div class="day"><h2>Day {day.day_number} — '
            f"{html.escape(day.name)}</h2><ul>{items}</ul></div>"
        )

    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Lifting Progress — losig_home</title>{PAGE_STYLE}</head><body>
<h1>Lifting Progress</h1>
<p>Estimated one-rep max (Epley: weight × (1 + reps/30)) per exercise,
from your logged sets. Gold ★ marks all-time PR sessions.</p>
{sections}
</body></html>"""


@progress_bp.get("/api/exercises/<int:exercise_id>/progress")
def api_exercise_progress(exercise_id):
    exercise = db.session.get(Exercise, exercise_id)
    if exercise is None:
        return jsonify({"error": "Exercise not found"}), 404
    progress = exercise_progress(exercise)
    return jsonify(
        {
            "exercise": {
                "id": exercise.id,
                "name": exercise.name,
                "day_number": exercise.day.day_number,
                "day_name": exercise.day.name,
            },
            **progress,
        }
    )


@progress_bp.get("/exercises/<int:exercise_id>/progress")
def exercise_chart_page(exercise_id):
    exercise = db.session.get(Exercise, exercise_id)
    if exercise is None:
        return "Exercise not found", 404
    return render_exercise_page(exercise, exercise_progress(exercise))


@progress_bp.get("/progress")
def progress_index():
    return render_index_page()
