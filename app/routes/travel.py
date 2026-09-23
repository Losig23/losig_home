"""Travel workout tracking: stats, per-day series, server-rendered SVG chart.

Logging stays where it was (POST /api/travel in workout.py); this module is
the *tracking* side — totals, averages, best day, and a chart page — the same
treatment the bodyweight and progressive-overload modules got.
"""
import html
from datetime import date

from flask import Blueprint, jsonify

from app import db
from app.models import TravelSession

travel_bp = Blueprint("travel", __name__)

MAX_CHART_DAYS = 90


def _count(value):
    """Coerce a stored rep count to a non-negative int (nulls/junk -> 0)."""
    try:
        return max(int(value), 0)
    except (TypeError, ValueError):
        return 0


def aggregate_by_date():
    """Per-day totals, oldest first. Multiple logs on one day are summed.

    travel_session has no unique(date) constraint and POST /api/travel
    inserts (never upserts), so dupes are real and must be aggregated.
    """
    logs = TravelSession.query.order_by(
        TravelSession.date.asc(), TravelSession.id.asc()
    ).all()
    days = {}
    for log in logs:
        key = log.date.isoformat()
        day = days.setdefault(
            key, {"date": key, "pushups": 0, "situps": 0, "notes": []}
        )
        day["pushups"] += _count(log.pushups)
        day["situps"] += _count(log.situps)
        if log.notes:
            day["notes"].append(log.notes)
    return [
        {
            "date": d["date"],
            "pushups": d["pushups"],
            "situps": d["situps"],
            "notes": " / ".join(d["notes"]),
        }
        for d in days.values()
    ]


def compute_travel_stats():
    """Totals, per-day averages, best day, and day count for travel logs."""
    days = aggregate_by_date()
    if not days:
        return {
            "total_pushups": 0,
            "total_situps": 0,
            "day_count": 0,
            "best_day": None,
            "avg_pushups_per_day": None,
            "avg_situps_per_day": None,
            "first_date": None,
            "latest_date": None,
        }

    total_pushups = sum(d["pushups"] for d in days)
    total_situps = sum(d["situps"] for d in days)
    day_count = len(days)

    # Best day: highest combined push-ups + sit-ups. max() returns the first
    # maximal element, and days are oldest-first, so ties resolve to the
    # earliest date.
    best = max(days, key=lambda d: d["pushups"] + d["situps"])
    best_day = {
        "date": best["date"],
        "pushups": best["pushups"],
        "situps": best["situps"],
    }

    return {
        "total_pushups": total_pushups,
        "total_situps": total_situps,
        "day_count": day_count,
        "best_day": best_day,
        "avg_pushups_per_day": round(total_pushups / day_count, 1),
        "avg_situps_per_day": round(total_situps / day_count, 1),
        "first_date": days[0]["date"],
        "latest_date": days[-1]["date"],
    }


def render_travel_chart_svg(series, width=880, height=440):
    """Grouped bar chart: push-ups vs sit-ups per travel day."""
    pad = {"l": 56, "r": 24, "t": 30, "b": 56}
    dates = [s["date"] for s in series]
    peak = max(
        [s["pushups"] for s in series] + [s["situps"] for s in series] + [1]
    )
    hi = peak * 1.15
    n = len(series)
    plot_w = width - pad["l"] - pad["r"]
    plot_h = height - pad["t"] - pad["b"]
    group_w = plot_w / n
    bar_w = min(group_w * 0.32, 30)

    def y(v):
        return pad["t"] + (1 - v / hi) * plot_h

    # Horizontal gridlines.
    grid = []
    for k in range(6):
        val = hi * k / 5
        gy = y(val)
        grid.append(
            f'<line x1="{pad["l"]}" y1="{gy:.1f}" x2="{width - pad["r"]}" '
            f'y2="{gy:.1f}" stroke="#e5e7eb"/>'
            f'<text x="{pad["l"] - 10}" y="{gy + 4:.1f}" text-anchor="end" '
            f'font-size="12" fill="#6b7280">{val:.0f}</text>'
        )

    # Date axis ticks (~6 evenly spaced).
    tick_idxs = sorted({round(i * (n - 1) / 5) for i in range(6)}) if n > 1 else [0]
    ticks = []
    for i in tick_idxs:
        tx = pad["l"] + (i + 0.5) * group_w
        ticks.append(
            f'<line x1="{tx:.1f}" y1="{height - pad["b"]}" '
            f'x2="{tx:.1f}" y2="{height - pad["b"] + 6}" stroke="#9ca3af"/>'
            f'<text x="{tx:.1f}" y="{height - pad["b"] + 22}" '
            f'text-anchor="middle" font-size="12" fill="#6b7280">'
            f'{dates[i][5:].replace("-", "/")}</text>'
        )

    bars = []
    for i, s in enumerate(series):
        cx = pad["l"] + (i + 0.5) * group_w
        for offset, value, color, label in (
            (-bar_w / 2 - 2, s["pushups"], "#2563eb", "push-ups"),
            (bar_w / 2 + 2, s["situps"], "#f59e0b", "sit-ups"),
        ):
            bx = cx + offset - bar_w / 2
            by = y(value)
            bars.append(
                f'<rect x="{bx:.1f}" y="{by:.1f}" width="{bar_w:.1f}" '
                f'height="{max(pad["t"] + plot_h - by, 0):.1f}" '
                f'fill="{color}" rx="2">'
                f"<title>{s['date']}: {label} {value}</title></rect>"
            )

    return (
        f'<svg width="{width}" height="{height}" viewBox="0 0 {width} {height}" '
        f'role="img" aria-label="Travel workout chart">'
        f'<rect x="0" y="0" width="{width}" height="{height}" fill="#ffffff"/>'
        f'{"".join(grid)}{"".join(ticks)}{"".join(bars)}'
        f'<rect x="{width - pad["r"] - 130}" y="{pad["t"] - 18}" width="12" '
        f'height="12" fill="#2563eb"/>'
        f'<text x="{width - pad["r"] - 112}" y="{pad["t"] - 8}" font-size="12" '
        f'fill="#111827">push-ups</text>'
        f'<rect x="{width - pad["r"] - 58}" y="{pad["t"] - 18}" width="12" '
        f'height="12" fill="#f59e0b"/>'
        f'<text x="{width - pad["r"] - 40}" y="{pad["t"] - 8}" font-size="12" '
        f'fill="#111827">sit-ups</text>'
        f'<text x="{pad["l"]}" y="{height - 8}" font-size="12" '
        f'fill="#6b7280">reps per travel day</text>'
        f"</svg>"
    )


def render_travel_page():
    stats = compute_travel_stats()
    series = aggregate_by_date()

    if not series:
        chart = "<p>No travel workouts yet. Log your first day below.</p>"
    else:
        chart = render_travel_chart_svg(series[-MAX_CHART_DAYS:])

    def fmt(v, suffix=""):
        return f"{v}{suffix}" if v is not None else "—"

    best = stats["best_day"] or {}
    best_txt = (
        f"{html.escape(str(best.get('date', '')))} "
        f"({best.get('pushups', 0)}↑ / {best.get('situps', 0)} sit-ups)"
        if best
        else "—"
    )

    rows = "".join(
        f"<tr><td>{d['date']}</td><td>{d['pushups']}</td>"
        f"<td>{d['situps']}</td><td>{html.escape(d['notes'])}</td></tr>"
        for d in reversed(series[-14:])
    )

    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Travel Workouts — losig_home</title>
<style>
body{{font-family:system-ui,sans-serif;max-width:960px;margin:2rem auto;
padding:0 1rem;color:#111827}}
.stats{{display:flex;gap:1rem;flex-wrap:wrap;margin:1rem 0}}
.card{{border:1px solid #e5e7eb;border-radius:8px;padding:.75rem 1.25rem}}
.card b{{font-size:1.4rem}}.card span{{color:#6b7280;font-size:.85rem}}
table{{border-collapse:collapse;margin-top:1rem}}
td,th{{border:1px solid #e5e7eb;padding:.4rem .8rem;text-align:left}}
form{{margin-top:1.5rem;display:flex;gap:.5rem;flex-wrap:wrap;align-items:end}}
label{{display:flex;flex-direction:column;font-size:.85rem;color:#6b7280}}
input,button{{padding:.5rem;font-size:1rem}}
</style></head><body>
<h1>Travel Workouts</h1>
<div class="stats">
<div class="card"><span>total push-ups</span><br><b>{stats["total_pushups"]}</b></div>
<div class="card"><span>total sit-ups</span><br><b>{stats["total_situps"]}</b></div>
<div class="card"><span>best day</span><br><b>{best_txt}</b></div>
<div class="card"><span>travel days</span><br><b>{stats["day_count"]}</b></div>
<div class="card"><span>avg push-ups/day</span><br><b>{fmt(stats["avg_pushups_per_day"])}</b></div>
<div class="card"><span>avg sit-ups/day</span><br><b>{fmt(stats["avg_situps_per_day"])}</b></div>
</div>
{chart}
<h2>Log a travel day</h2>
<form id="travel-form">
<label>date<input type="date" name="date" value="{date.today().isoformat()}"></label>
<label>push-ups<input type="number" name="pushups" min="0" step="1"></label>
<label>sit-ups<input type="number" name="situps" min="0" step="1"></label>
<label>notes<input type="text" name="notes" placeholder="optional"></label>
<button type="submit">Save</button>
</form>
<h2>Recent</h2>
<table><tr><th>date</th><th>push-ups</th><th>sit-ups</th><th>notes</th></tr>{rows}</table>
<script>
document.getElementById('travel-form').addEventListener('submit', async (e) => {{
  e.preventDefault();
  const f = new FormData(e.target);
  const num = (v) => v === '' ? null : parseInt(v, 10);
  const r = await fetch('/api/travel', {{
    method: 'POST', headers: {{'Content-Type': 'application/json'}},
    body: JSON.stringify({{date: f.get('date'),
                          pushups: num(f.get('pushups')),
                          situps: num(f.get('situps')),
                          notes: f.get('notes') || null}}),
  }});
  if (r.ok) location.reload(); else alert('save failed');
}});
</script>
</body></html>"""


@travel_bp.get("/api/travel/stats")
def travel_stats():
    return jsonify(compute_travel_stats())


@travel_bp.get("/api/travel/series")
def travel_series():
    series = [
        {"date": d["date"], "pushups": d["pushups"], "situps": d["situps"]}
        for d in aggregate_by_date()
    ]
    return jsonify(series)


@travel_bp.get("/travel")
def travel_page():
    return render_travel_page()
