"""Strength math: Epley 1RM estimates and all-time PR detection."""


def est_1rm(weight_lb, reps):
    """Epley estimated one-rep max, rounded to 1 decimal.

    Null weight -> None (the set can't be estimated). Null reps -> 0, i.e.
    the estimate degrades to the set's weight itself.
    """
    if weight_lb is None:
        return None
    r = reps if reps is not None else 0
    return round(float(weight_lb) * (1 + r / 30), 1)


def is_pr_for_set(log, exercise_id, exclude_id=None):
    """True when this checked set's est-1RM exceeds every other checked,
    weighted set ever logged for the same exercise.

    The first-ever logged set for an exercise counts as a PR. Unchecked sets
    and sets without a weight are ignored on both sides.
    """
    # Local import: app.models imports `db` from the app package, and this
    # module is imported by route blueprints — keep it lazy to avoid cycles.
    from app.models import PlannedSet, SetLog

    if not log.checked or log.actual_weight_lb is None:
        return False
    mine = est_1rm(log.actual_weight_lb, log.actual_reps)

    query = (
        SetLog.query.join(PlannedSet, SetLog.planned_set_id == PlannedSet.id)
        .filter(
            PlannedSet.exercise_id == exercise_id,
            SetLog.checked.is_(True),
            SetLog.actual_weight_lb.isnot(None),
        )
    )
    if exclude_id is not None:
        query = query.filter(SetLog.id != exclude_id)

    best = max(
        (est_1rm(s.actual_weight_lb, s.actual_reps) for s in query.all()),
        default=None,
    )
    return best is None or mine > best
