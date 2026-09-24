"""Travel workout tracking: stats, per-day series, server-rendered SVG chart.

Logging stays where it was (POST /api/travel in workout.py); this module is
the *tracking* side — totals, averages, best day, and a chart page — the same
treatment the bodyweight and progressive-overload modules got.
"""
import html
from datetime import date

from flask import Blueprint, jsonify, request

from app import db
from app.models import TravelSession, TravelSet

travel_bp = Blueprint("travel", __name__)

MAX_CHART_DAYS = 90

# Travel analyzer thresholds (documented in the README):
#  - >= TRAVEL_MIN_DAYS (3) travel days, else "insufficient_data"
#  - least-squares slope of per-day total reps over the last
#    TRAVEL_SERIES_WINDOW (8) days: slope > +1.0 reps/day -> "progressing",
#    slope < -1.0 -> "regressing", else "plateau"
#  - rest insight: >= TRAVEL_REST_MIN_SETS (4) sets with recorded rests;
#    |top-quartile avg rest - bottom-quartile avg rest| >=
#    TRAVEL_REST_MIN_DIFF_S (15s) -> insight string, else null.
TRAVEL_MOVEMENTS = ("pushup", "situp")
TRAVEL_MIN_DAYS = 3
TRAVEL_SERIES_WINDOW = 8
TRAVEL_SLOPE_UP = 1.0
TRAVEL_SLOPE_DOWN = -1.0
TRAVEL_REST_MIN_SETS = 4
TRAVEL_REST_MIN_DIFF_S = 15


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


def _number(value, kind, field):
    if value is None:
        return None
    try:
        return kind(value)
    except (TypeError, ValueError):
        raise ValueError(f"'{field}' must be a number")


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


def travel_daily_totals():
    """Per-day per-movement totals, oldest date first.

    Per-set rows take precedence per (date, movement): if a date has any
    per-set rows for pushups, the day's push-up total is their sum (the
    aggregate column is ignored for that movement). Movements/dates without
    per-set rows fall back to the aggregate pushups/situps columns, so days
    logged before the per-set feature still count in the analysis.
    """
    sessions = (
        TravelSession.query.order_by(
            TravelSession.date.asc(), TravelSession.id.asc()
        ).all()
    )
    set_sums = {}
    agg_sums = {}
    order = []
    for s in sessions:
        d = s.date.isoformat()
        if d not in agg_sums:
            agg_sums[d] = {"pushup": 0, "situp": 0}
            order.append(d)
        agg_sums[d]["pushup"] += _count(s.pushups)
        agg_sums[d]["situp"] += _count(s.situps)
        for st in s.sets:
            key = (d, st.movement)
            set_sums[key] = set_sums.get(key, 0) + _count(st.reps)
    return {
        d: {
            m: (set_sums[(d, m)] if (d, m) in set_sums else agg_sums[d][m])
            for m in TRAVEL_MOVEMENTS
        }
        for d in order
    }


def _avg(values):
    return round(sum(values) / len(values), 1) if values else None


def analyze_travel_movement(movement):
    """Progress verdict + rest insight for one movement (pushup/situp).

    Only days where the movement was actually performed (total > 0) enter
    the series: a travel day of push-ups only is not a "0 sit-up day" for
    the sit-up trend — counting it would fake a regressing slope.
    """
    daily = travel_daily_totals()
    series = [(d, daily[d][movement]) for d in daily if daily[d][movement] > 0]
    window = series[-TRAVEL_SERIES_WINDOW:]
    values = [v for _, v in window]

    if len(window) < TRAVEL_MIN_DAYS:
        verdict = "insufficient_data"
        slope = None
    else:
        slope = round(_slope(list(range(len(values))), values), 2)
        if slope > TRAVEL_SLOPE_UP:
            verdict = "progressing"
        elif slope < TRAVEL_SLOPE_DOWN:
            verdict = "regressing"
        else:
            verdict = "plateau"

    rest_rows = (
        TravelSet.query.filter_by(movement=movement)
        .filter(TravelSet.rest_seconds.isnot(None))
        .all()
    )
    avg_rest = _avg([r.rest_seconds for r in rest_rows])

    insight = None
    if len(rest_rows) >= TRAVEL_REST_MIN_SETS:
        ordered = sorted(rest_rows, key=lambda r: _count(r.reps))
        q = max(len(ordered) // 4, 1)
        bottom_avg = _avg([r.rest_seconds for r in ordered[:q]])
        top_avg = _avg([r.rest_seconds for r in ordered[-q:]])
        if bottom_avg is not None and top_avg is not None:
            diff = top_avg - bottom_avg
            if abs(diff) >= TRAVEL_REST_MIN_DIFF_S:
                direction = "longer" if diff > 0 else "shorter"
                insight = (
                    f"Your highest-rep {movement} sets average "
                    f"{abs(diff):.0f}s {direction} rests "
                    f"({top_avg:.0f}s vs {bottom_avg:.0f}s) — "
                    f"consider resting {direction} before hard sets."
                )

    return {
        "movement": movement,
        "verdict": verdict,
        "days_used": len(window),
        "slope_reps_per_day": slope,
        "first_day_total": values[0] if values else None,
        "latest_day_total": values[-1] if values else None,
        "last_date": window[-1][0] if window else None,
        "rest": {
            "avg_rest_seconds": avg_rest,
            "sets_with_rest": len(rest_rows),
            "insight": insight,
        },
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
    verdicts = [analyze_travel_movement(m) for m in TRAVEL_MOVEMENTS]

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

    def verdict_badge(v):
        label = v["verdict"].replace("_", " ")
        slope = v["slope_reps_per_day"]
        slope_txt = (
            f" ({slope:+.1f} reps/day)"
            if slope is not None
            else " (need 3+ days)"
        )
        return (
            f'<span class="badge {v["verdict"]}">'
            f'{html.escape(v["movement"])} · {html.escape(label)}{slope_txt}</span>'
        )

    verdict_html = "".join(verdict_badge(v) for v in verdicts)

    rows = "".join(
        f"<tr><td>{d['date']}</td><td>{d['pushups']}</td>"
        f"<td>{d['situps']}</td><td>{html.escape(d['notes'])}</td></tr>"
        for d in reversed(series[-14:])
    )

    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
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
input,button,select{{padding:.5rem;font-size:1rem}}
button{{border-radius:8px;border:1px solid #d1d5db;background:#f3f4f6;cursor:pointer}}
button.primary{{background:#2563eb;color:#fff;border-color:#2563eb}}
button:active{{transform:scale(.97)}}
.badge{{font-size:.75rem;font-weight:700;padding:.15rem .6rem;border-radius:999px;
color:#fff;text-transform:uppercase;letter-spacing:.03em;margin-right:.4rem}}
.badge.progressing{{background:#16a34a}}
.badge.plateau{{background:#d97706}}
.badge.regressing{{background:#dc2626}}
.badge.insufficient_data{{background:#6b7280}}
.verdicts{{margin:.6rem 0 1rem}}
.setlog{{border:1px solid #e5e7eb;border-radius:10px;padding:1rem;margin-top:1.5rem}}
.logrow{{display:flex;gap:.4rem;margin-top:.6rem;flex-wrap:wrap;align-items:end}}
.timer{{display:flex;gap:.6rem;align-items:center;margin-top:.6rem}}
.tdisp{{font-variant-numeric:tabular-nums;font-size:1.4rem;font-weight:700;
min-width:4.2rem}}
.logged{{font-size:.95rem;margin:.3rem 0}}
.meta{{color:#6b7280;font-size:.9rem}}
.seg label{{flex-direction:row;align-items:center;gap:.3rem;font-size:1rem;
color:#111827}}
.seg{{display:flex;gap:1rem;margin-top:.6rem}}
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
<div class="verdicts"><span class="meta">analyzer:</span> {verdict_html}</div>
{chart}
<h2>Log a travel day</h2>
<form id="travel-form">
<label>date<input type="date" name="date" value="{date.today().isoformat()}"></label>
<label>push-ups<input type="number" name="pushups" min="0" step="1"></label>
<label>sit-ups<input type="number" name="situps" min="0" step="1"></label>
<label>notes<input type="text" name="notes" placeholder="optional"></label>
<button type="submit">Save</button>
</form>
<h2>Log sets</h2>
<div class="setlog">
<p class="meta">Finer-grained: log each push-up/sit-up set with the rest you
took before it. The analyzer uses per-day totals.</p>
<div class="logrow">
<label>travel day<select id="day-select"><option value="">— pick —</option></select></label>
<label>or new day<input type="date" id="new-day" value="{date.today().isoformat()}"></label>
<button id="new-day-btn">Create day</button>
</div>
<div class="seg">
<label><input type="radio" name="movement" value="pushup" checked> push-ups</label>
<label><input type="radio" name="movement" value="situp"> sit-ups</label>
</div>
<div class="logrow">
<label>reps<input id="set-reps" type="number" inputmode="numeric" min="0"></label>
<label>rest s<input id="set-rest" type="number" inputmode="numeric" min="0"></label>
<button id="log-set-btn" class="primary">Log set</button>
<span id="set-msg" class="meta"></span>
</div>
<div class="timer">
<span class="tdisp" id="tdisp">00:00</span>
<button id="rest-start">Start rest</button>
<button id="rest-reset">Reset</button>
</div>
<div id="sets-list"></div>
</div>
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

// ---- per-set logging (same count-up timer pattern as /log) ----
let restTimer = null;
let restStartAt = 0;
function fmtT(s){{
  const m = Math.floor(s / 60), r = s % 60;
  return String(m).padStart(2, "0") + ":" + String(r).padStart(2, "0");
}}
function startRest(){{
  stopRest();
  const inp = document.getElementById('set-rest');
  inp.dataset.dirty = "";
  restStartAt = Date.now();
  restTimer = setInterval(() => {{
    const s = Math.floor((Date.now() - restStartAt) / 1000);
    document.getElementById('tdisp').textContent = fmtT(s);
    if (!inp.dataset.dirty && document.activeElement !== inp) inp.value = s;
  }}, 500);
}}
function stopRest(){{
  if (restTimer) clearInterval(restTimer);
  restTimer = null;
  document.getElementById('tdisp').textContent = "00:00";
}}
document.getElementById('rest-start').onclick = startRest;
document.getElementById('rest-reset').onclick = stopRest;
document.getElementById('set-rest').addEventListener('input', (e) => {{
  e.target.dataset.dirty = "1";
}});

async function api(path, method, body){{
  const r = await fetch(path, {{method,
    headers: {{'Content-Type': 'application/json'}},
    body: body ? JSON.stringify(body) : undefined}});
  return r.json();
}}
function currentMovement(){{
  return document.querySelector('input[name="movement"]:checked').value;
}}
async function loadDays(){{
  const days = await api('/api/travel', 'GET');
  const sel = document.getElementById('day-select');
  sel.innerHTML = '<option value="">— pick —</option>';
  days.forEach(d => {{
    const o = document.createElement('option');
    o.value = d.id;
    o.textContent = d.date + ' (' + (d.pushups ?? 0) + '↑ / ' +
      (d.situps ?? 0) + ' sit-ups)';
    sel.appendChild(o);
  }});
}}
async function loadSets(){{
  const id = document.getElementById('day-select').value;
  const el = document.getElementById('sets-list');
  if (!id) {{ el.innerHTML = ""; return; }}
  const data = await api('/api/travel/' + id, 'GET');
  if (data.error) {{ el.innerHTML = '<p class="meta">' + data.error + '</p>'; return; }}
  let out = "";
  for (const mv of ['pushup', 'situp']) {{
    const sets = data.sets_by_movement[mv];
    if (!sets.length) continue;
    const name = mv === 'pushup' ? 'push-ups' : 'sit-ups';
    out += '<h3>' + name + '</h3>';
    out += sets.map(s =>
      '<div class="logged">Set ' + s.set_number + ': ' + s.reps + ' reps' +
      (s.rest_seconds != null ? ' · rest ' + s.rest_seconds + 's' : '') +
      ' <a href="#" data-del="' + s.id +
      '" style="color:#9ca3af;font-size:.8rem">del</a></div>').join('');
  }}
  el.innerHTML = out || '<p class="meta">no sets logged for this day yet</p>';
  el.querySelectorAll('[data-del]').forEach(a => {{
    a.onclick = async (e) => {{
      e.preventDefault();
      if (!confirm('Delete this set?')) return;
      await api('/api/travel/sets/' + a.dataset.del, 'DELETE');
      loadSets();
    }};
  }});
}}
document.getElementById('day-select').onchange = loadSets;
document.getElementById('new-day-btn').onclick = async () => {{
  const d = document.getElementById('new-day').value;
  const res = await api('/api/travel', 'POST', {{date: d}});
  if (res.id) {{ await loadDays();
    document.getElementById('day-select').value = res.id; loadSets(); }}
  else alert(res.error || 'could not create day');
}};
document.getElementById('log-set-btn').onclick = async () => {{
  const id = document.getElementById('day-select').value;
  if (!id) {{ alert('pick a travel day first'); return; }}
  const reps = document.getElementById('set-reps').value.trim();
  const restInp = document.getElementById('set-rest');
  if (restTimer && !restInp.dataset.dirty)
    restInp.value = Math.floor((Date.now() - restStartAt) / 1000);
  const body = {{movement: currentMovement()}};
  if (reps !== '') body.reps = parseInt(reps, 10);
  if (restInp.value.trim() !== '')
    body.rest_seconds = parseInt(restInp.value.trim(), 10);
  const res = await api('/api/travel/' + id + '/sets', 'POST', body);
  if (res.error) {{ alert(res.error); return; }}
  document.getElementById('set-msg').textContent = 'logged ✔';
  document.getElementById('set-reps').value = "";
  stopRest(); restInp.dataset.dirty = "";
  loadSets();
}};
loadDays();
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


@travel_bp.post("/api/travel/<int:session_id>/sets")
def log_travel_set(session_id):
    """Log one push-up/sit-up set live:
    {"movement": "pushup", "reps": 20, "rest_seconds": 60, "set_number": 2}.

    set_number defaults to max existing + 1 for this movement+session.
    """
    session = db.session.get(TravelSession, session_id)
    if session is None:
        return jsonify({"error": "Travel session not found"}), 404

    data = request.get_json(silent=True) or {}
    movement = data.get("movement")
    if movement not in TRAVEL_MOVEMENTS:
        return (
            jsonify({"error": f"'movement' must be one of {list(TRAVEL_MOVEMENTS)}"}),
            400,
        )
    try:
        reps = _number(data.get("reps"), int, "reps")
        rest = _number(data.get("rest_seconds"), int, "rest_seconds")
        set_number = _number(data.get("set_number"), int, "set_number")
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    if reps is None or reps < 0:
        return jsonify({"error": "'reps' is required and must be >= 0"}), 400
    if rest is not None and rest < 0:
        return jsonify({"error": "'rest_seconds' must be >= 0"}), 400

    if set_number is None:
        existing = [
            s.set_number
            for s in session.sets
            if s.movement == movement and s.set_number is not None
        ]
        set_number = (max(existing) if existing else 0) + 1

    tset = TravelSet(
        travel_session_id=session.id,
        movement=movement,
        reps=reps,
        rest_seconds=rest,
        set_number=set_number,
    )
    db.session.add(tset)
    db.session.commit()
    return jsonify(tset.to_dict()), 201


@travel_bp.patch("/api/travel/sets/<int:set_id>")
def edit_travel_set(set_id):
    """Fix a logged travel set: {"reps": 22, "rest_seconds": 75}."""
    tset = db.session.get(TravelSet, set_id)
    if tset is None:
        return jsonify({"error": "Set not found"}), 404

    data = request.get_json(silent=True) or {}
    if "movement" in data and data["movement"] not in TRAVEL_MOVEMENTS:
        return (
            jsonify({"error": f"'movement' must be one of {list(TRAVEL_MOVEMENTS)}"}),
            400,
        )
    try:
        for field, attr, kind in [
            ("reps", "reps", int),
            ("rest_seconds", "rest_seconds", int),
            ("set_number", "set_number", int),
        ]:
            if field in data:
                setattr(tset, attr, _number(data[field], kind, field))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    if "movement" in data:
        tset.movement = data["movement"]
    if tset.reps is not None and tset.reps < 0:
        return jsonify({"error": "'reps' must be >= 0"}), 400
    if tset.rest_seconds is not None and tset.rest_seconds < 0:
        return jsonify({"error": "'rest_seconds' must be >= 0"}), 400

    db.session.commit()
    return jsonify(tset.to_dict())


@travel_bp.delete("/api/travel/sets/<int:set_id>")
def delete_travel_set(set_id):
    """Remove a logged travel set (fat-fingered entry)."""
    tset = db.session.get(TravelSet, set_id)
    if tset is None:
        return jsonify({"error": "Set not found"}), 404
    db.session.delete(tset)
    db.session.commit()
    return jsonify({"deleted": set_id})


@travel_bp.get("/api/travel/<int:session_id>")
def travel_session_detail(session_id):
    """One travel day: aggregates plus per-set rows grouped by movement."""
    session = db.session.get(TravelSession, session_id)
    if session is None:
        return jsonify({"error": "Travel session not found"}), 404
    payload = session.to_dict()
    payload["sets_by_movement"] = session.sets_by_movement()
    return jsonify(payload)


@travel_bp.get("/api/travel/analysis")
def travel_analysis():
    """Per-movement verdicts: progressing / plateau / regressing /
    insufficient_data, from the slope of per-day total reps, plus rest
    insights. Aggregate-only days (no per-set rows) still count."""
    return jsonify(
        [analyze_travel_movement(m) for m in TRAVEL_MOVEMENTS]
    )


@travel_bp.get("/travel")
def travel_page():
    from app.routes.ui import wrap_page

    return wrap_page(render_travel_page(), active="travel")
