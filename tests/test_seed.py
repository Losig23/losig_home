"""Seed correctness: 5 days, exact set counts, spot-checked values."""
from app.models import Exercise, PlannedSet, RoutineDay
from app.seed import total_sets_per_day

EXPECTED_SET_COUNTS = {1: 22, 2: 23, 3: 22, 4: 30, 5: 23}


def test_five_days_seeded(app):
    days = RoutineDay.query.order_by(RoutineDay.day_number).all()
    assert [d.day_number for d in days] == [1, 2, 3, 4, 5]
    assert all(d.name for d in days)


def test_total_set_counts(app):
    assert total_sets_per_day() == EXPECTED_SET_COUNTS
    assert PlannedSet.query.count() == sum(EXPECTED_SET_COUNTS.values()) == 120


def test_day1_chest_press_values(app):
    ex = Exercise.query.filter_by(name="Chest press").one()
    assert ex.intensity == "H"
    weights = [s.weight_lb for s in ex.planned_sets]
    assert weights == [25.0, 45.0, 45.0, 45.0]
    assert all(s.target_reps is None for s in ex.planned_sets)


def test_rep_targets_parsed(app):
    ex = Exercise.query.filter_by(name="Incline press").one()
    assert [(s.weight_lb, s.target_reps) for s in ex.planned_sets] == [
        (17.5, 12),
        (17.5, 12),
        (17.5, 12),
    ]


def test_raw_labels_kept(app):
    bss = Exercise.query.filter_by(name="Bulgarian split squats").one()
    assert bss.raw_label == "BSs"
    assert bss.intensity == "M"
    assert len(bss.planned_sets) == 3

    lat = Exercise.query.filter_by(name="Lateral raises", raw_label="lay raises").one()
    assert lat.day.day_number == 5

    ext = Exercise.query.filter_by(name="Triceps extensions").one()
    assert ext.raw_label == "Extensions"


def test_day5_back_extension_vh(app):
    ex = Exercise.query.filter_by(name="Back extension").one()
    assert ex.intensity == "VH"
    assert [(s.weight_lb, s.target_reps) for s in ex.planned_sets] == [
        (100.0, 6),
        (130.0, 6),
        (115.0, 6),
    ]


def test_bad_form_note(app):
    ex = (
        Exercise.query.filter_by(name="Lateral raises")
        .join(RoutineDay)
        .filter(RoutineDay.day_number == 1)
        .one()
    )
    assert all(s.note == "bad form" for s in ex.planned_sets)


def test_illustration_keys(app):
    keys = {e.illustration_key for e in Exercise.query.all()}
    assert "chest-press" in keys
    assert "bulgarian-split-squats" in keys
    assert all(k and " " not in k for k in keys)


def test_seed_is_idempotent(app):
    from app.seed import seed_db

    assert seed_db() is False
    assert RoutineDay.query.count() == 5
