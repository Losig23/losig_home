"""Single-user authentication + the public/private split.

The app has exactly one account (Ani) — there is no registration route;
the account is created with ``flask create-user``. All user-data queries
are scoped by ``effective_user_id()``:

- inside an authenticated request: the logged-in user's id;
- anywhere else (public views, tests, CLI): the single data owner's id
  when an account exists, else None — which matches pre-login rows whose
  ``user_id`` is NULL via ``IS NULL``.

``get_owned()`` is the ownership-checked single-row lookup: it 404s for
anonymous callers and for rows belonging to another user, so a missed
scope can't leak data.
"""
import html
from datetime import date, timedelta

from flask import (
    Blueprint,
    has_request_context,
    jsonify,
    redirect,
    render_template,
    request,
    url_for,
)
from flask_login import LoginManager, current_user, login_user, logout_user

from app import db
from app.models import BodyWeightLog, MealLog, User, WorkoutSession

auth_bp = Blueprint("auth", __name__)
login_manager = LoginManager()
login_manager.login_view = "auth.login"


@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))


def effective_user_id():
    """User id to scope data queries by (see module docstring)."""
    if has_request_context() and current_user.is_authenticated:
        return current_user.id
    owner = User.query.order_by(User.id).first()
    return owner.id if owner is not None else None


def get_owned(model, obj_id):
    """Ownership-checked lookup: None when missing or not yours."""
    return (
        model.query.filter_by(id=obj_id, user_id=effective_user_id()).first()
    )


def _safe_next(value):
    """Redirect target for post-login: only same-site relative paths."""
    if value and value.startswith("/") and not value.startswith("//"):
        return value
    return "/"


_LOGIN_FORM = """
<h1>Log in</h1>
{error}
<form method="post" action="/login">
  <input type="hidden" name="next" value="{next}">
  <div class="form-row">
    <label>Username <input type="text" name="username" required
      autocomplete="username"></label>
  </div>
  <div class="form-row">
    <label>Password <input type="password" name="password" required
      autocomplete="current-password"></label>
  </div>
  <button class="btn" type="submit">Log in</button>
</form>
"""


@auth_bp.get("/login")
def login():
    from app.routes.ui import get_nav

    return render_template(
        "base.html",
        title="Log in",
        page_styles="",
        content=_LOGIN_FORM.format(
            error="", next=html.escape(request.args.get("next", "/"))
        ),
        nav=get_nav(),
        active="login",
    )


@auth_bp.post("/login")
def login_post():
    from app.routes.ui import get_nav

    username = (request.form.get("username") or "").strip()
    password = request.form.get("password") or ""
    user = User.query.filter_by(username=username).first()
    if user is None or not user.check_password(password):
        return (
            render_template(
                "base.html",
                title="Log in",
                page_styles="",
                content=_LOGIN_FORM.format(
                    error='<p class="result-box error">'
                    "Wrong username or password.</p>",
                    next=html.escape(request.form.get("next", "/")),
                ),
                nav=get_nav(),
                active="login",
            ),
            401,
        )
    login_user(user)
    return redirect(_safe_next(request.form.get("next")))


@auth_bp.post("/logout")
def logout():
    logout_user()
    return redirect("/")


# ---------------------------------------------------------------------------
# Public weekly view: the only unauthenticated window into the data.
# Whitelisted fields only — never photo URLs, never full history.
# This is the endpoint the public website / future game will consume.
# ---------------------------------------------------------------------------

PUBLIC_DAYS = 7


def public_week_data():
    """Last 7 days (today minus 6): session summaries with per-exercise top
    weights + volume, exact bodyweight entries, meals with macros."""
    uid = effective_user_id()
    today = date.today()
    start = today - timedelta(days=PUBLIC_DAYS - 1)

    sessions = (
        WorkoutSession.query.filter(
            WorkoutSession.user_id == uid,
            WorkoutSession.date >= start,
            WorkoutSession.date <= today,
        )
        .order_by(WorkoutSession.date.desc(), WorkoutSession.id.desc())
        .all()
    )

    def _exercise_lines(session):
        lines = []
        for group in session.sets_by_exercise():
            weighed = [
                log
                for log in group["logged"]
                if log.get("actual_weight_lb") is not None
            ]
            if not weighed:
                continue
            top = max(weighed, key=lambda l: l["actual_weight_lb"])
            volume = round(
                sum(
                    (l["actual_weight_lb"] or 0) * (l["actual_reps"] or 0)
                    for l in weighed
                ),
                1,
            )
            lines.append(
                {
                    "exercise": group["exercise_name"],
                    "top_weight_lb": top["actual_weight_lb"],
                    "top_reps": top["actual_reps"],
                    "volume_lb": volume,
                }
            )
        return lines

    public_sessions = [
        {
            "date": s.date.isoformat(),
            "day_name": s.day.name if s.day else None,
            "travel_mode": s.travel_mode,
            "exercises": _exercise_lines(s),
        }
        for s in sessions
    ]

    weights = (
        BodyWeightLog.query.filter(
            BodyWeightLog.user_id == uid,
            BodyWeightLog.date >= start,
            BodyWeightLog.date <= today,
        )
        .order_by(BodyWeightLog.date.asc())
        .all()
    )

    meals = (
        MealLog.query.filter(
            MealLog.user_id == uid,
            db.func.date(MealLog.logged_at) >= start.isoformat(),
            db.func.date(MealLog.logged_at) <= today.isoformat(),
        )
        .order_by(MealLog.logged_at.asc())
        .all()
    )

    return {
        "start_date": start.isoformat(),
        "end_date": today.isoformat(),
        "session_count": len(public_sessions),
        "sessions": public_sessions,
        "bodyweight": [
            {"date": w.date.isoformat(), "weight_lb": w.weight_lb}
            for w in weights
        ],
        "meals": [
            {
                "date": m.logged_at.date().isoformat(),
                "description": m.description,
                "calories": m.calories,
                "protein_g": m.protein_g,
                "carbs_g": m.carbs_g,
                "fat_g": m.fat_g,
                "source": m.source,
            }
            for m in meals
        ],
    }


@auth_bp.get("/api/public/week")
def api_public_week():
    return jsonify(public_week_data())


def render_public_home():
    """Server-rendered public page for logged-out visitors."""
    data = public_week_data()

    if data["sessions"]:
        sess_html = "".join(
            "<div class=\"meal\"><div><b>{date}</b> — {day}<div "
            "class=\"macros\">{ex}</div></div></div>".format(
                date=s["date"],
                day=html.escape(s["day_name"] or "session"),
                ex="<br>".join(
                    f"{html.escape(e['exercise'])}: "
                    f"top {e['top_weight_lb']:g} lb × {e['top_reps']} "
                    f"(vol {e['volume_lb']:g} lb)"
                    for e in s["exercises"]
                )
                or "no weighted sets",
            )
            for s in data["sessions"]
        )
    else:
        sess_html = "<p>No sessions this week.</p>"

    if data["bodyweight"]:
        bw_html = "".join(
            f"<div class=\"meal\"><div><b>{w['date']}</b> — "
            f"{w['weight_lb']:.1f} lb</div></div>"
            for w in data["bodyweight"]
        )
    else:
        bw_html = "<p>No weigh-ins this week.</p>"

    if data["meals"]:
        meal_html = "".join(
            "<div class=\"meal\"><div><b>{date}</b> — {desc}<div "
            "class=\"macros\">{cal} cal · P {p}g · C {c}g · F {f}g</div>"
            "</div></div>".format(
                date=m["date"],
                desc=html.escape(m["description"]),
                cal=_num(m["calories"]),
                p=_num(m["protein_g"]),
                c=_num(m["carbs_g"]),
                f=_num(m["fat_g"]),
            )
            for m in data["meals"]
        )
    else:
        meal_html = "<p>No meals logged this week.</p>"

    return f"""
<h1>Ani's training log</h1>
<p style="color:#6b7280">Last 7 days ({data["start_date"]} → {data["end_date"]}).
Full history is private — <a href="/login">log in</a> for everything.</p>
<h2>Workouts ({data["session_count"]} sessions)</h2>
{sess_html}
<h2>Bodyweight</h2>
{bw_html}
<h2>Food</h2>
{meal_html}
"""


def _num(value):
    return "—" if value is None else f"{value:g}"
