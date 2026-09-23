# losig_home

The backend for my personal life hub — the site that will eventually live at
**anirudhyarram.com**. One API + database behind everything I track:

- **Media** — games I play, videos I watch, music I listen to, movies I watch,
  sports teams I follow (via their APIs: Steam, PSN, YouTube, Last.fm, TMDB/Trakt, ESPN)
- **Food** — photo log of what I cook with calorie/macro estimates
- **Fitness** — my 5-day lifting routine with per-set check-offs, daily
  completion %, a travel mode for push-up/sit-up days, daily bodyweight
  tracking with a trend chart, live set logging with a rest timer, and a
  progress analyzer (progressing / plateau / regressing verdicts per exercise)
- **Apartment game (future)** — a playable walk-around of my apartment on the
  personal site; the TV, speaker, and other objects will read live data from
  this backend

## Status: backend-first

There is no frontend yet. The API is fully working and the workout tracker is
seeded with my exact 5-day routine (all weights in **lb**).

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# create the database and seed the 5-day routine
flask --app wsgi seed

# run the API
flask --app wsgi run        # dev server on http://127.0.0.1:5000

# run the tests
pytest
```

`DATABASE_URL` env var overrides the SQLite default (e.g. Postgres on Render).

## API

| Method | Endpoint | What it does |
|---|---|---|
| GET | `/api/health` | health check |
| GET | `/api/routine` | full 5-day routine with exercises + planned sets |
| GET | `/api/routine/<day>` | one day (1–5) |
| POST | `/api/sessions` | start a session: `{"day_number": 1}` or `{"travel_mode": true, "date": "2026-09-23"}` |
| GET | `/api/sessions` | 20 most recent sessions |
| GET | `/api/sessions/<id>` | session detail; computes and stores `completed_pct` |
| PATCH | `/api/sessions/<id>/check` | check off sets: `{"checks": [{"planned_set_id": 3, "checked": true, "actual_reps": 12, "actual_weight_lb": 45}]}` |
| POST | `/api/travel` | log a travel workout: `{"date": "2026-09-23", "pushups": 60, "situps": 50, "notes": "..."}` |
| GET | `/api/travel` | recent travel logs |
| GET | `/api/travel/stats` | travel totals, per-day averages, best day, day count, first/latest date |
| GET | `/api/travel/series` | per-day aggregated push-ups/sit-ups, oldest first (same-day logs summed) |
| GET | `/travel` | chart page: grouped-bar SVG (push-ups vs sit-ups per day), stat cards, analyzer verdict badges, aggregate quick-log form, per-set logging UI with rest timer, history table |
| POST | `/api/travel/<session_id>/sets` | log a push-up/sit-up set live: `{"movement": "pushup", "reps": 20, "rest_seconds": 60}` — `set_number` auto-increments per movement |
| PATCH | `/api/travel/sets/<set_id>` | fix a logged travel set: `{"reps": 22, "rest_seconds": 75, "movement": "situp"}` |
| DELETE | `/api/travel/sets/<set_id>` | delete a logged travel set |
| GET | `/api/travel/<session_id>` | travel day detail: aggregates + sets grouped by movement |
| GET | `/api/travel/analysis` | per-movement verdicts (progressing/plateau/regressing/insufficient_data) from the slope of per-day total reps, plus rest insights |
| POST | `/api/bodyweight` | log a weigh-in (upsert by date): `{"date": "2026-09-23", "weight_lb": 185.4, "note": "..."}` |
| GET | `/api/bodyweight` | weigh-in history, oldest first; `?from=…&to=…` filters |
| GET | `/api/bodyweight/stats` | latest weight, 7-day avg, 30-day delta, trend (up/down/flat), log count |
| GET | `/bodyweight` | trend chart page: server-rendered SVG line chart (daily points + 7-day moving average), stats, and a weigh-in form |
| POST | `/api/meals` | log a meal: multipart form with `description` (required), `photo` (optional image ≤10MB), optional manual `calories`/`protein_g`/`carbs_g`/`fat_g` |
| GET | `/api/meals?date=YYYY-MM-DD` | meals for a day (defaults to today) |
| GET | `/api/meals/daily?date=YYYY-MM-DD` | day totals: calories, protein, carbs, fat, meal count |
| GET | `/api/meals/<id>/photo` | serve the meal's photo |
| GET | `/api/exercises/<id>/progress` | per-session series (top set, est 1RM, volume), summary (current/first est 1RM, all-time PR, delta, session count), PR dates |
| PATCH | `/api/sessions/<id>/check` | now also returns per-set `is_pr` flags and persists them on `set_log` |
| POST | `/api/sessions/<id>/sets` | log a set live: `{"exercise_id": 3, "weight_lb": 45, "reps": 8, "rest_seconds": 90}` — returns the set with `est_1rm_lb` and `is_pr`; `set_number` auto-increments |
| PATCH | `/api/sessions/<id>/sets/<set_id>` | fix a logged set: `{"weight_lb": 50, "reps": 6, "rest_seconds": 120}` |
| DELETE | `/api/sessions/<id>/sets/<set_id>` | delete a logged set |
| GET | `/api/analysis` | per-exercise progress verdicts (progressing/plateau/regressing/insufficient_data), est-1RM slope, and rest insights |
| GET | `/analysis` | verdict cards grouped by day with sparklines and rest insights |
| GET | `/log` | live session page: pick day 1–5 or travel, then log sets with a per-exercise rest timer |
| GET | `/sessions/<id>/log` | the live logging UI for a session |

### Progressive overload

`/progress` lists all exercises grouped by day with the latest Epley est-1RM
and a sparkline; `/exercises/<id>/progress` renders the est-1RM curve with
gold ★ markers on PR sessions, stat cards (current est 1RM, all-time PR
weight×reps, change since first session, session count), and a session table.

Strength is estimated with the Epley formula:

```
est_1rm = weight_lb × (1 + reps / 30)
```

computed on each session's best set. A set is flagged `is_pr` when its
est-1RM beats every prior logged set for that exercise (the first-ever logged
set counts).

### Live logging + rest timer

`/log` is a phone-friendly page: pick day 1–5 (or travel) to start a session,
then expand each exercise to log sets as you do them — weight, reps, and the
rest you took before the set. Each exercise has a count-up rest timer: hit
**Start rest** after a set, and when you log the next one the elapsed seconds
auto-fill the rest field (you can still edit it before logging). PR sets get a
★. The same data is available as JSON:

- `POST /api/sessions/<id>/sets` — `{exercise_id, weight_lb, reps,
  rest_seconds?}`; `set_number` defaults to max+1 for that exercise+session
- `PATCH /api/sessions/<id>/sets/<set_id>` — fix weight/reps/rest
- `DELETE /api/sessions/<id>/sets/<set_id>` — remove a set
- `GET /api/sessions/<id>` now also returns `sets_by_exercise` (planned +
  logged sets grouped per exercise)

Live-logged sets feed the same progress series and PR detection as check-offs
(`rest_seconds` = rest taken *before* the set).

### Progress analyzer

`/analysis` judges each exercise from your logged data:

- **Verdict** — least-squares slope of per-session est-1RM over the last 8
  sessions (needs ≥ 3 sessions): `progressing` above +1.0 lb/session,
  `regressing` below −1.0 lb/session, otherwise `plateau`;
  fewer than 3 sessions → `insufficient_data` (greyed at the bottom of the page)
- **Rest insight** — compares average rest before PR sets vs non-PR sets.
  Needs ≥ 3 samples on each side and a ≥ 15 s gap; e.g. *"PR sets average 60s
  longer rests (120s vs 60s) — consider resting longer before top sets."*

`GET /api/analysis` returns the same per exercise as JSON.

### Travel per-set logging + analyzer

Travel days get the same live-logging treatment as the gym: pick a travel
day (or create one) on the `/travel` page and log each push-up/sit-up set
with the rest you took before it — the count-up rest timer auto-fills the
rest field, same pattern as `/log`.

`GET /api/travel/analysis` judges each movement separately:

- **Verdict** — least-squares slope of per-day *total* reps over the last 8
  travel days (needs ≥ 3 days): `progressing` above +1.0 reps/day,
  `regressing` below −1.0 reps/day, otherwise `plateau`. Only days where the
  movement was actually performed (total > 0) count — a push-ups-only day is
  not a "0 sit-up day" in the sit-up trend.
- **Per-set precedence** — if a date has any per-set rows for a movement,
  the day's total is their sum (the aggregate columns are ignored for that
  movement). Movements/dates without per-set rows fall back to the aggregate
  `pushups`/`situps` columns, so days logged before this feature still count.
- **Rest insight** — compares average rest before high-rep sets (top
  quartile) vs low-rep sets (bottom quartile). Needs ≥ 4 sets with recorded
  rests and a ≥ 15 s gap; e.g. *"Your highest-rep pushup sets average 60s
  longer rests (90s vs 30s) — consider resting longer before hard sets."*

The `/travel` page shows the verdict badges next to the stat cards and a
per-day "Log sets" section (movement toggle, reps input, rest timer, logged
sets with delete). The aggregate quick-log form keeps working unchanged.

### Bodyweight chart

`/bodyweight` is a plain server-rendered page (no JS frameworks): an inline
SVG line chart of daily weigh-ins with a 7-day moving-average overlay,
min/max annotations, and a date axis, plus stat cards (latest, 7-day avg,
30-day change, trend) and a form to log today's weight.

### Food log setup

Meal photos are stored under `instance/uploads/meals/` (gitignored — runtime
data, not committed; on Render attach a persistent disk for this path).
Photos are capped at 10MB and must be png/jpg/webp/gif.

Calorie/macro estimates come from the [Nutritionix](https://www.nutritionix.com/business/api)
natural-language API (free tier). Set these env vars (or a local `.env`):

```bash
NUTRITIONIX_APP_ID=your_app_id
NUTRITIONIX_API_KEY=your_api_key
```

Without keys, the API call is skipped and any manually provided macros are
used instead (`source` is `"manual"` vs `"nutritionix"` on the meal record).

## Data model

- `routine_day` — day_number 1–5, name
- `exercise` — name, position, intensity (H/M/L/VL/VH), `raw_label` keeps the
  original abbreviation (e.g. `BSs`), `illustration_key` for the future SVG
  stick-figure drawings
- `planned_set` — weight_lb, target_reps, note per set
- `workout_session` — date, day, travel_mode flag, completed_pct
- `set_log` — per-set check-offs with optional actual reps/weight; `is_pr`
  flags sets that beat the exercise's all-time est-1RM at check-off time;
  free-form live logs set `exercise_id` directly (`planned_set_id` NULL) with
  `set_number` and `rest_seconds` (rest taken before the set)
- `travel_session` — date, pushups, situps, notes
- `travel_set` — travel_session_id, movement (`pushup`/`situp`), set_number
  (1-based within movement+session), reps, rest_seconds (rest before the set)
- `body_weight_log` — date (unique), weight_lb, note
- `meal_log` — photo_path (under `instance/uploads/meals/`), description,
  calories/protein_g/carbs_g/fat_g, logged_at, source (nutritionix/manual)

## Roadmap

- [x] **Food log** — photo upload + short description → Nutritionix (free tier)
  for calories/macros; manual entry when keys are absent
- [x] **Daily bodyweight tracking** — upsert weigh-ins, 7-day avg / 30-day
  delta / trend stats, server-rendered SVG trend chart at `/bodyweight`
- [x] **Progressive overload** — per-exercise est-1RM (Epley) series +
  volume, PR detection with `is_pr` flags, SVG charts at `/progress` and
  `/exercises/<id>/progress`
- [x] **Travel workout tracking** — push-up/sit-up totals, per-day averages,
  best day, aggregated per-day series, grouped-bar SVG chart at `/travel`
  with a quick log form; per-set logging with rest timer +
  per-movement analyzer verdicts (progressing/plateau/regressing) and rest
  insights at `/api/travel/analysis`
- [x] **Live set logging + rest timer + analyzer** — log weight/reps/rest per
  set as you work out from the phone-friendly `/log` page (per-exercise
  count-up rest timer, PR stars); `/api/analysis` + `/analysis` judge
  progressing / plateau / regressing from the est-1RM slope and surface rest
  insights (e.g. PR sets averaging longer rests)
- [ ] **Exercise illustrations** — line-drawn SVG per `illustration_key`, set
  checkmarks in the UI, daily completion %
- [ ] **Media aggregator** — scheduled pulls from Steam/PSN/YouTube/Last.fm/
  TMDB/ESPN into a unified "now" feed
- [ ] **Auth** — login before any of this goes public; food and workout data stay private
- [ ] **Apartment game frontend** — Three.js walk-around wired to this backend
