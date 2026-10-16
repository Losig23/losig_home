# losig_home

My personal life hub — live at **https://anirudhyarram.com**. A public
portfolio homepage on the front, and a login-gated tracker behind it:
workouts, food, bodyweight, gaming, diary, and music.

- **Site:** https://anirudhyarram.com (also https://losig-home.onrender.com)
- **Apartment game:** https://anirudhyarram.com/game — a walkable Three.js
  apartment where the TV, speaker, laptop, and other objects read live data
  from this backend

## What it is

Two faces, one Flask app:

- **Public** — a black-and-emerald bento-grid portfolio: hero, experience,
  projects, a 7-day life-log summary, and a now-playing tile (Last.fm).
  No login needed, no job-search signals, nothing private leaks.
- **Private** (single-user login, no registration) — the full tracker:
  command-center dashboard, live workout logging with rest timer,
  per-exercise progress charts, food log with photo upload, bodyweight
  trend, travel mode, gaming log, diary, unified life calendar, and
  listening stats.

## Features

- **Fitness** — my 5-day lifting routine with per-set check-offs, daily
  completion %, live set logging with a count-up rest timer, and a
  progress analyzer (progressing / plateau / regressing verdicts per
  exercise from the est-1RM slope, plus rest insights)
- **Progressive overload** — per-exercise est-1RM (Epley) series, volume,
  PR detection with `is_pr` flags, SVG charts with gold ★ on PR sessions,
  sparklines on the index
- **Food** — photo log with calorie/macro estimates via CalorieNinjas
  (free tier), manual fallback; daily macro totals
- **Bodyweight** — daily weigh-in upsert, 7-day avg, 30-day delta, trend,
  server-rendered SVG chart
- **Travel** — push-up/sit-up per-set logging with rest timer, grouped bar
  chart, per-movement analyzer verdicts
- **Gaming** — manual session log with a normalized per-title feed
  (`/api/gaming/recent`) for the apartment game
- **Diary** — one entry per day, strictly private (tests assert its text
  never appears in public payloads)
- **Life calendar** — workouts, travel, gaming, meal summaries, and diary
  markers merged into one timeline
- **Music** — Last.fm weekly charts (24h cache) + recent scrobbles (1h
  cache); cache-aside with stale-on-error, zero scrobbles stored
- **Apartment game** — public Three.js walkable apartment (anime/cel-shaded
  restyle), 7 interactables wired to real APIs

## Stack & deploy

Flask + Flask-SQLAlchemy + Flask-Login, Neon Postgres (via Alembic
migrations), Cloudflare R2 (meal photos), Last.fm API, server-rendered
HTML, vanilla JS, Three.js. No build step, no npm, no frameworks.

Deploys on Render's free tier (`render.yaml`): migrations + seed run
idempotently in the start command (free tier has no pre-deploy shell).
PR previews inherit production env vars — visual review only, never write
test data through a preview URL.

## Status

In active development. The public portfolio and `/game` are stable; the
logged-in pages are going through a visual redesign (sidebar shell, storm
dark theme) and the public homepage is getting a phone-first mobile pass.

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# create the database and seed the 5-day routine
flask --app wsgi seed

# create the login user
flask --app wsgi create-user

# run the app
flask --app wsgi run        # dev server on http://127.0.0.1:5000

# run the tests
pytest
```

`DATABASE_URL` env var overrides the SQLite default (e.g. Postgres on
Render). `SECRET_KEY` is required outside tests. Optional integrations:

```bash
API_NINJAS_KEY=...     # CalorieNinjas food estimates (manual fallback without)
LASTFM_API_KEY=...     # music section (omitted when unset)
LASTFM_USERNAME=...    # e.g. Losig
```

## API

| Method | Endpoint | What it does |
|---|---|---|
| GET | `/api/health` | health check |
| GET | `/api/public/week` | public 7-day summary (no user ids, no photo URLs) |
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
| GET | `/api/gaming` | gaming sessions |
| POST | `/api/gaming` | log a gaming session (manual) |
| GET | `/api/gaming/recent` | normalized per-title feed: last played, total minutes, session count |
| GET | `/api/diary` | diary entries (login only) |
| POST | `/api/diary` | upsert today's entry (login only) |

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

### Exercise illustrations

Every exercise has a hand-designed line-drawn SVG illustration, served at
`/static/exercises/<illustration_key>.svg` (33 unique exercises across the
39 routine rows — repeats like Shoulder press share one file). The
`illustration_key` uses the seed slug scheme: lowercase, non-alphanumerics
→ dashes. Style spec (enforced by `tests/test_illustrations.py`):

- `viewBox="0 0 200 200"`, single ink `#1f2937` on transparent background
- stroke-only line art (`stroke-width: 4`, round caps/joins); the only fills
  are joint dots and arrowheads
- stick figure (circle head, line torso/limbs) in the movement's most
  recognizable pose + minimal equipment lines + a small motion arrow
- every file < 3 KB; the set is generated by `scripts/illustrations.py`
  (re-run to regenerate), which asserts all 33 seed names are covered

`illustration_url` is included in exercise API output (`/api/routine`,
`GET /api/sessions/<id>` via `sets_by_exercise`,
`GET /api/exercises/<id>/progress`). In the UI: thumbnails next to each
exercise on the live `/log` page (tap to expand), and the illustration next
to the title on each `/exercises/<id>/progress` chart page.

Ambiguous names — interpretation drawn (flag me if any are wrong):

| Seed name | Raw label | Drawn as |
|---|---|---|
| Bulgarian split squats | BSs | Rear foot elevated on a bench, dumbbells at sides |
| Lateral raises (Day 5) | lay raises | Lateral raises (same file as Day 1/4) |
| Row | — | Bent-over barbell row |
| Rows | — | Seated cable row (distinct from "Row") |
| Chest press | — | Seated machine chest press |
| Incline press / Incline chest press | — | Dumbbell incline press (mirrored variants) |
| Dips | — | Parallel-bar dips |
| Pull-ups | — | Dead-hang pull-up (weights logged = added/assisted) |
| Crunches | — | Bodyweight floor crunch (weights logged = added) |
| Seated leg curl / leg extension | Seated curl/extensions | Seated leg extension (quads) |
| Wrist curls / Reverse wrist curls | — | Seated, forearm on thigh; differ by arrow direction only |

### Bodyweight chart

`/bodyweight` is a plain server-rendered page (no JS frameworks): an inline
SVG line chart of daily weigh-ins with a 7-day moving-average overlay,
min/max annotations, and a date axis, plus stat cards (latest, 7-day avg,
30-day change, trend) and a form to log today's weight.

### Food log setup

Meal photos are stored under `instance/uploads/meals/` locally (gitignored —
runtime data, not committed). In production they go to Cloudflare R2
(`R2_*` env vars; see `.env.example`).

Photos are capped at 10MB and must be png/jpg/webp/gif.

Calorie/macro estimates come from the [CalorieNinjas](https://api-ninjas.com/api/nutrition)
natural-language API (free tier — sign up with any email at
[api-ninjas.com](https://api-ninjas.com)). Set this env var (or a local
`.env`):

```bash
API_NINJAS_KEY=your_api_key
```

Without the key, the API call is skipped and any manually provided macros
are used instead (`source` is `"manual"` vs `"calorieninjas"` on the meal
record).

### Music setup

Listening stats come from the [Last.fm API](https://www.last.fm/api)
(no bulk import — cached reads only: weekly charts 24h, recent scrobbles
1h, stale served on API errors):

```bash
LASTFM_API_KEY=your_api_key
LASTFM_USERNAME=your_username
```

When unset, the music tiles are omitted. If you use Spotify, enable
scrobbling to Last.fm or the charts stay empty — the site never sees plays
that don't reach Last.fm.

## Data model

- `user` — single login user (Werkzeug hash, no registration route)
- `routine_day` — day_number 1–5, name
- `exercise` — name, position, intensity (H/M/L/VL/VH), `raw_label` keeps the
  original abbreviation (e.g. `BSs`), `illustration_key` maps to the
  line-drawn SVG at `/static/exercises/<illustration_key>.svg`
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
- `meal_log` — photo_path (R2 in prod), description,
  calories/protein_g/carbs_g/fat_g, logged_at, source (calorieninjas/manual)
- `game_session` — manual gaming log: title, minutes, date
- `diary_entry` — one per day, strictly private
- `listening_cache` — Last.fm cache-aside rows (key, payload, fetched_at)

## Roadmap

- [x] **Food log** — photo upload + short description → CalorieNinjas (free tier)
  for calories/macros; manual entry when the key is absent
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
- [x] **Exercise illustrations** — line-drawn SVG per exercise
  (`/static/exercises/<illustration_key>.svg`), thumbnails with tap-to-expand
  on the live `/log` page, illustration on each `/exercises/<id>/progress`
  chart page, `illustration_url` in exercise API output
- [x] **Auth** — single-user login, default-deny; public pages show a 7-day
  summary only, diary never leaks
- [x] **Production deploy** — Render + Neon Postgres + Cloudflare R2, custom
  domain anirudhyarram.com
- [x] **Portfolio homepage** — public black-and-emerald bento grid
- [x] **Apartment game** — public Three.js walkable apartment, 7
  interactables wired to real backend data
- [x] **Music** — Last.fm weekly charts + recent scrobbles, cached reads
- [x] **Gaming log + diary + life calendar** — manual game sessions,
  private diary, unified timeline
- [ ] **Media aggregator** — remaining sources (Steam/YouTube/TMDB/ESPN)
  into a unified "now" feed; PSN declined (no official API, manual-first)
- [ ] **Logged-in redesign polish** — sidebar shell + storm dark theme
  (in progress)
- [ ] **Mobile-first public homepage** — priority-ordered panels, hamburger
  nav, accordion experience (in progress)
