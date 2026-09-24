"""Daily bodyweight tracking: JSON API + server-rendered SVG trend chart."""
import html
from datetime import date, timedelta

from flask import Blueprint, jsonify, request

from app import db
from app.models import BodyWeightLog

bodyweight_bp = Blueprint("bodyweight", __name__)

TREND_THRESHOLD_LB = 0.5  # avg-vs-avg move smaller than this counts as "flat"


def _parse_date(value):
    if not value:
        return date.today()
    return date.fromisoformat(value)


def compute_stats():
    """Latest weight, 7-day avg, 30-day delta, trend, and log count."""
    logs = BodyWeightLog.query.order_by(BodyWeightLog.date.asc()).all()
    if not logs:
        return {
            "latest": None,
            "avg_7_day": None,
            "delta_30_day": None,
            "trend": None,
            "log_count": 0,
        }

    latest = logs[-1]
    recent7 = logs[-7:]
    avg7 = round(sum(l.weight_lb for l in recent7) / len(recent7), 1)

    # 30-day delta: latest vs the most recent log on/before (latest - 30 days).
    target = latest.date - timedelta(days=30)
    baseline = next(
        (l for l in reversed(logs[:-1]) if l.date <= target), None
    )
    delta30 = round(latest.weight_lb - baseline.weight_lb, 1) if baseline else None

    # Trend: recent-7 average vs the 7 entries before that.
    prior7 = logs[-14:-7]
    if len(prior7) >= 3:
        avg_prior = sum(l.weight_lb for l in prior7) / len(prior7)
        diff = avg7 - avg_prior
        trend = (
            "up" if diff > TREND_THRESHOLD_LB
            else "down" if diff < -TREND_THRESHOLD_LB
            else "flat"
        )
    else:
        trend = None

    return {
        "latest": latest.to_dict(),
        "avg_7_day": avg7,
        "delta_30_day": delta30,
        "trend": trend,
        "log_count": len(logs),
    }


def moving_average(values, window=7):
    """Trailing moving average over the value list (min 1 point per window)."""
    out = []
    for i in range(len(values)):
        chunk = values[max(0, i - window + 1): i + 1]
        out.append(sum(chunk) / len(chunk))
    return out


def render_chart_svg(logs, width=880, height=440):
    """Line chart: raw daily points + 7-day moving-average overlay."""
    pad = {"l": 64, "r": 24, "t": 30, "b": 56}
    dates = [l.date for l in logs]
    weights = [l.weight_lb for l in logs]

    lo = min(weights) - 2
    hi = max(weights) + 2
    if hi - lo < 1:
        lo, hi = lo - 1, hi + 1

    total_days = max((dates[-1] - dates[0]).days, 1)

    def x(i):
        frac = (dates[i] - dates[0]).days / total_days
        return pad["l"] + frac * (width - pad["l"] - pad["r"])

    def y(w):
        frac = (w - lo) / (hi - lo)
        return pad["t"] + (1 - frac) * (height - pad["t"] - pad["b"])

    # Horizontal gridlines.
    grid = []
    for k in range(6):
        val = lo + k * (hi - lo) / 5
        gy = y(val)
        grid.append(
            f'<line x1="{pad["l"]}" y1="{gy:.1f}" x2="{width - pad["r"]}" '
            f'y2="{gy:.1f}" stroke="#e5e7eb"/>'
            f'<text x="{pad["l"] - 10}" y="{gy + 4:.1f}" text-anchor="end" '
            f'font-size="12" fill="#6b7280">{val:.1f}</text>'
        )

    # Date axis ticks (~6 evenly spaced).
    n = len(logs)
    tick_idxs = sorted({round(i * (n - 1) / 5) for i in range(6)})
    ticks = []
    for i in tick_idxs:
        tx = x(i)
        ticks.append(
            f'<line x1="{tx:.1f}" y1="{height - pad["b"]}" '
            f'x2="{tx:.1f}" y2="{height - pad["b"] + 6}" stroke="#9ca3af"/>'
            f'<text x="{tx:.1f}" y="{height - pad["b"] + 22}" '
            f'text-anchor="middle" font-size="12" fill="#6b7280">'
            f'{dates[i].strftime("%m-%d")}</text>'
        )

    raw_pts = " ".join(f"{x(i):.1f},{y(weights[i]):.1f}" for i in range(n))
    avg = moving_average(weights)
    avg_pts = " ".join(f"{x(i):.1f},{y(avg[i]):.1f}" for i in range(n))
    dots = "".join(
        f'<circle cx="{x(i):.1f}" cy="{y(weights[i]):.1f}" r="3.5" '
        f'fill="#2563eb"><title>{dates[i].isoformat()}: {weights[i]} lb</title>'
        f"</circle>"
        for i in range(n)
    )

    # Min / max annotations.
    imin = weights.index(min(weights))
    imax = weights.index(max(weights))
    annot = ""
    for i, label in ((imin, "min"), (imax, "max")):
        annot += (
            f'<text x="{x(i):.1f}" y="{y(weights[i]) - 12:.1f}" '
            f'text-anchor="middle" font-size="12" font-weight="bold" '
            f'fill="#111827">{label} {weights[i]:.1f}</text>'
        )

    return (
        f'<svg width="{width}" height="{height}" viewBox="0 0 {width} {height}" '
        f'role="img" aria-label="Body weight trend chart">'
        f'<rect x="0" y="0" width="{width}" height="{height}" fill="#ffffff"/>'
        f'{"".join(grid)}{"".join(ticks)}'
        f'<polyline points="{raw_pts}" fill="none" stroke="#2563eb" '
        f'stroke-width="2"/>'
        f'<polyline points="{avg_pts}" fill="none" stroke="#f59e0b" '
        f'stroke-width="2" stroke-dasharray="6,4"/>'
        f"{dots}{annot}"
        f'<text x="{width - pad["r"]}" y="{pad["t"] - 8}" text-anchor="end" '
        f'font-size="12" fill="#2563eb">daily</text>'
        f'<text x="{width - pad["r"]}" y="{pad["t"] + 10}" text-anchor="end" '
        f'font-size="12" fill="#f59e0b">7-day avg</text>'
        f'<text x="{pad["l"]}" y="{height - 8}" font-size="12" '
        f'fill="#6b7280">weight (lb)</text>'
        f"</svg>"
    )


def render_chart_page():
    stats = compute_stats()
    logs = BodyWeightLog.query.order_by(BodyWeightLog.date.asc()).all()

    if not logs:
        chart = "<p>No weigh-ins yet. Log your first weight below.</p>"
    else:
        chart = render_chart_svg(logs[-90:])  # last 90 entries at most

    def fmt(v, suffix=""):
        return f"{v}{suffix}" if v is not None else "—"

    rows = "".join(
        f"<tr><td>{l.date.isoformat()}</td><td>{l.weight_lb:.1f}</td>"
        f"<td>{html.escape(l.note or '')}</td></tr>"
        for l in reversed(logs[-14:])
    )
    latest = stats["latest"] or {}

    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Body Weight — losig_home</title>
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
<h1>Body Weight</h1>
<div class="stats">
<div class="card"><span>latest</span><br><b>{fmt(latest.get("weight_lb"), " lb")}</b>
 <span>{html.escape(str(latest.get("date", "")))}</span></div>
<div class="card"><span>7-day avg</span><br><b>{fmt(stats["avg_7_day"], " lb")}</b></div>
<div class="card"><span>30-day change</span><br><b>{fmt(stats["delta_30_day"], " lb")}</b></div>
<div class="card"><span>trend</span><br><b>{fmt(stats["trend"])}</b></div>
<div class="card"><span>weigh-ins</span><br><b>{stats["log_count"]}</b></div>
</div>
{chart}
<h2>Log today's weight</h2>
<form method="post" action="/api/bodyweight" id="bw-form">
<label>date<input type="date" name="date" value="{date.today().isoformat()}"></label>
<label>weight (lb)<input type="number" name="weight_lb" step="0.1" required></label>
<label>note<input type="text" name="note" placeholder="optional"></label>
<button type="submit">Save</button>
</form>
<h2>Recent</h2>
<table><tr><th>date</th><th>lb</th><th>note</th></tr>{rows}</table>
<script>
document.getElementById('bw-form').addEventListener('submit', async (e) => {{
  e.preventDefault();
  const f = new FormData(e.target);
  const r = await fetch('/api/bodyweight', {{
    method: 'POST', headers: {{'Content-Type': 'application/json'}},
    body: JSON.stringify({{date: f.get('date'), weight_lb: f.get('weight_lb'),
                          note: f.get('note')}}),
  }});
  if (r.ok) location.reload(); else alert('save failed');
}});
</script>
</body></html>"""


@bodyweight_bp.post("/api/bodyweight")
def log_weight():
    """Upsert a weigh-in: {"date": "2026-09-23", "weight_lb": 185.4,
    "note": "..."}. Same date twice updates the existing entry."""
    data = request.get_json(silent=True) or {}
    try:
        log_date = _parse_date(data.get("date"))
    except ValueError:
        return jsonify({"error": "date must be YYYY-MM-DD"}), 400

    try:
        weight = float(data.get("weight_lb"))
    except (TypeError, ValueError):
        return jsonify({"error": "weight_lb is required and must be a number"}), 400
    if weight <= 0 or weight > 1500:
        return jsonify({"error": "weight_lb looks out of range"}), 400

    entry = BodyWeightLog.query.filter_by(date=log_date).first()
    if entry is None:
        entry = BodyWeightLog(date=log_date, weight_lb=weight)
        db.session.add(entry)
    else:
        entry.weight_lb = weight
    if "note" in data:
        entry.note = data.get("note") or None
    db.session.commit()
    return jsonify(entry.to_dict()), 200


@bodyweight_bp.get("/api/bodyweight")
def list_weights():
    """Ordered list, optional ?from=YYYY-MM-DD&to=YYYY-MM-DD."""
    query = BodyWeightLog.query
    if request.args.get("from"):
        try:
            query = query.filter(
                BodyWeightLog.date >= date.fromisoformat(request.args["from"])
            )
        except ValueError:
            return jsonify({"error": "from must be YYYY-MM-DD"}), 400
    if request.args.get("to"):
        try:
            query = query.filter(
                BodyWeightLog.date <= date.fromisoformat(request.args["to"])
            )
        except ValueError:
            return jsonify({"error": "to must be YYYY-MM-DD"}), 400
    logs = query.order_by(BodyWeightLog.date.asc()).all()
    return jsonify([l.to_dict() for l in logs])


@bodyweight_bp.get("/api/bodyweight/stats")
def weight_stats():
    return jsonify(compute_stats())


@bodyweight_bp.get("/bodyweight")
def chart_page():
    from app.routes.ui import wrap_page

    return wrap_page(render_chart_page(), active="bodyweight")
