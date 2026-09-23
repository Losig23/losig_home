# losig_home

The backend for my personal life hub — the site that will eventually live at
**anirudhyarram.com**. One API + database behind everything I track:

- **Media** — games I play, videos I watch, music I listen to, movies I watch,
  sports teams I follow (via their APIs: Steam, PSN, YouTube, Last.fm, TMDB/Trakt, ESPN)
- **Food** — photo log of what I cook with calorie/macro estimates
- **Fitness** — my 5-day lifting routine with per-set check-offs, daily
  completion %, and a travel mode for push-up/sit-up days
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

## Data model

- `routine_day` — day_number 1–5, name
- `exercise` — name, position, intensity (H/M/L/VL/VH), `raw_label` keeps the
  original abbreviation (e.g. `BSs`), `illustration_key` for the future SVG
  stick-figure drawings
- `planned_set` — weight_lb, target_reps, note per set
- `workout_session` — date, day, travel_mode flag, completed_pct
- `set_log` — per-set check-offs with optional actual reps/weight
- `travel_session` — date, pushups, situps, notes

## Roadmap

1. **Exercise illustrations** — line-drawn SVG per `illustration_key`, set
   checkmarks in the UI, daily completion %
2. **Food log** — photo upload + short description → Nutritionix (free tier)
   for calories/macros; AI-vision photo estimation as v2
3. **Media aggregator** — scheduled pulls from Steam/PSN/YouTube/Last.fm/
   TMDB/ESPN into a unified "now" feed
4. **Auth** — login before any of this goes public; food and workout data stay private
5. **Apartment game frontend** — Three.js walk-around wired to this backend
