# losig_home

The backend for my personal life hub — the site that will eventually live at
**anirudhyarram.com**. One API + database behind everything I track:

- **Media** — games I play, videos I watch, music I listen to, movies I watch,
  sports teams I follow (via their APIs: Steam, PSN, YouTube, Last.fm, TMDB/Trakt, ESPN)
- **Food** — photo log of what I cook with calorie/macro estimates
- **Fitness** — my 5-day lifting routine with per-set check-offs, daily
  completion %, a travel mode for push-up/sit-up days, and daily bodyweight
  tracking with a trend chart
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
| POST | `/api/bodyweight` | log a weigh-in (upsert by date): `{"date": "2026-09-23", "weight_lb": 185.4, "note": "..."}` |
| GET | `/api/bodyweight` | weigh-in history, oldest first; `?from=…&to=…` filters |
| GET | `/api/bodyweight/stats` | latest weight, 7-day avg, 30-day delta, trend (up/down/flat), log count |
| GET | `/bodyweight` | trend chart page: server-rendered SVG line chart (daily points + 7-day moving average), stats, and a weigh-in form |
| POST | `/api/meals` | log a meal: multipart form with `description` (required), `photo` (optional image ≤10MB), optional manual `calories`/`protein_g`/`carbs_g`/`fat_g` |
| GET | `/api/meals?date=YYYY-MM-DD` | meals for a day (defaults to today) |
| GET | `/api/meals/daily?date=YYYY-MM-DD` | day totals: calories, protein, carbs, fat, meal count |
| GET | `/api/meals/<id>/photo` | serve the meal's photo |

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
- `set_log` — per-set check-offs with optional actual reps/weight
- `travel_session` — date, pushups, situps, notes
- `body_weight_log` — date (unique), weight_lb, note
- `meal_log` — photo_path (under `instance/uploads/meals/`), description,
  calories/protein_g/carbs_g/fat_g, logged_at, source (nutritionix/manual)

## Roadmap

- [x] **Food log** — photo upload + short description → Nutritionix (free tier)
  for calories/macros; manual entry when keys are absent
- [x] **Daily bodyweight tracking** — upsert weigh-ins, 7-day avg / 30-day
  delta / trend stats, server-rendered SVG trend chart at `/bodyweight`
- [ ] **Exercise illustrations** — line-drawn SVG per `illustration_key`, set
  checkmarks in the UI, daily completion %
- [ ] **Media aggregator** — scheduled pulls from Steam/PSN/YouTube/Last.fm/
  TMDB/ESPN into a unified "now" feed
- [ ] **Auth** — login before any of this goes public; food and workout data stay private
- [ ] **Apartment game frontend** — Three.js walk-around wired to this backend
