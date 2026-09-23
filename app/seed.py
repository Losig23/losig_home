"""Seed the exact 5-day workout routine. All weights are in lb.

Notation (his): "(H)Chest press:25,45,45,45" -> intensity H, exercise
"Chest press", one set per comma value (weight in lb); "(12)" after a weight
is the target rep count for that set; a bare number is weight only.
"""
import re
from app import db
from app.illustrations import slug_for
from app.models import Exercise, PlannedSet, RoutineDay

SET_RE = re.compile(r"^(\d+(?:\.\d+)?)(?:\((\d+)\))?$")
LINE_RE = re.compile(r"^\(([^)]+)\)\s*([^:]+):\s*(.+)$")


def parse_sets(spec):
    """'17.5(12),17.5(12),45' -> [(17.5, 12), (17.5, 12), (45.0, None)]"""
    sets = []
    for token in spec.split(","):
        token = token.strip()
        m = SET_RE.match(token)
        if not m:
            raise ValueError(f"Cannot parse set spec: {token!r}")
        sets.append((float(m.group(1)), int(m.group(2)) if m.group(2) else None))
    return sets


def slug(name):
    """Seed-time slug; implementation lives in app.illustrations."""
    return slug_for(name)


# (day_number, day name, [(intensity, name, raw_label, sets_spec, set_note)])
# raw_label keeps his original abbreviation where it differs from the cleaned name.
ROUTINE = [
    (1, "Push", [
        ("H", "Chest press", None, "25,45,45,45", None),
        ("M", "Incline press", None, "17.5(12),17.5(12),17.5(12)", None),
        ("M", "Dips", None, "40,40(10),40(10)", None),
        ("L", "Chest fly", None, "45(15),45,45", None),
        ("M-H", "Shoulder press", None, "15(10),15(10),20(6)", None),
        ("L", "Lateral raises", "Lat raises", "10(12),10(12),10(12)", "bad form"),
        ("L", "Triceps extensions", "Extensions", "10,10,10", None),
    ]),
    (2, "Pull", [
        ("H", "Pull-ups", None, "55,50,45,45", None),
        ("H", "Row", None, "40,45,50,45", None),
        ("M", "Pull-downs", None, "45,45,45", None),
        ("L", "Rear fly", None, "30(15),30,25", None),
        ("M", "Seated curls", None, "10,10(10),8", None),
        ("L", "Hammer curls", "HCurls", "8(12),8,8", None),
        ("L", "Reverse curls", "RCurls", "8(10),5(15),5", None),
    ]),
    (3, "Legs + Core", [
        ("H", "Squats", None, "0,25(6),25(6),10", None),
        ("M", "Leg press", None, "0(8),0,0", None),
        ("L", "Seated leg curl / leg extension", "Seated curl/extensions",
         "25,25,25", None),
        ("M", "Romanian deadlift", None, "0,10,15", None),
        ("L", "Calf raises", None, "15,15(20),15(20),15(20)", None),
        ("L", "Crunches", None, "40,70(8),55", None),
        ("L", "Leg raises", None, "12,8", None),
    ]),
    (4, "Upper Mix", [
        ("M", "Incline chest press", None, "17.5,25,25(8)", None),
        ("M", "Rows", None, "45,50,50", None),
        ("M", "Pull-downs", None, "50,55,55", None),
        ("L", "Chest flys", None, "50(15),55(15)", None),
        ("L", "Lateral raises", None, "10(12),10(12),8(12),8(12)", None),
        ("L", "Rear flys", None, "30,30(12),20", None),
        ("L", "Pushdowns", None, "55(15),60,60", None),
        ("L", "Curls", None, "8,8(15),8", None),
        ("VL", "Wrist curls", None, "10,10,10", None),
        ("VL", "Reverse wrist curls", None, "5(20),5(20),5(20)", None),
    ]),
    (5, "Back + Legs", [
        ("VH", "Back extension", None, "100(6),130(6),115(6)", None),
        ("M", "Bulgarian split squats", "BSs", "10(8),10(8),10(8)", None),
        ("L", "Leg curls", None, "25,40,40", None),
        ("L", "Calf raises", None, "20,20,20,20", None),
        ("H", "Shoulder press", None, "10(10),20(10),20", None),
        ("L", "Lateral raises", "lay raises", "10,10,8", None),
        ("L", "Twist machine", None, "25,25(15),30", None),
        ("L", "Leg raises", None, "8", None),
    ]),
]


def seed_db():
    """Insert the 5-day routine. Returns True if it seeded, False if already present."""
    if RoutineDay.query.first() is not None:
        return False
    for day_number, name, exercises in ROUTINE:
        day = RoutineDay(day_number=day_number, name=name)
        db.session.add(day)
        db.session.flush()
        for pos, (intensity, ex_name, raw_label, sets_spec, note) in enumerate(exercises):
            ex = Exercise(
                day_id=day.id,
                name=ex_name,
                raw_label=raw_label,
                position=pos,
                intensity=intensity,
                illustration_key=slug(ex_name),
            )
            db.session.add(ex)
            db.session.flush()
            for set_no, (weight, reps) in enumerate(parse_sets(sets_spec), start=1):
                db.session.add(PlannedSet(
                    exercise_id=ex.id,
                    set_number=set_no,
                    weight_lb=weight,
                    target_reps=reps,
                    note=note,
                ))
    db.session.commit()
    return True


def total_sets_per_day():
    """{day_number: planned set count} — used by tests."""
    out = {}
    for day in RoutineDay.query.order_by(RoutineDay.day_number):
        out[day.day_number] = sum(len(e.planned_sets) for e in day.exercises)
    return out
