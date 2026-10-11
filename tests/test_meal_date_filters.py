"""Meal date filters must bind date objects, never strings.

Production Postgres raised ``UndefinedFunction: operator does not exist:
date >= character varying`` on ``/api/public/week`` because
``db.func.date(MealLog.logged_at)`` was compared to ``start.isoformat()``
(a string). SQLite silently coerces the comparison, which is why the whole
suite stayed green while production 500'd.

These tests compile the real filter expressions against the Postgres
dialect and assert every bound parameter is a date. The helpers also raise
TypeError on non-date input, so a regression fails loudly in tests instead
of only in production.
"""
from datetime import date

import pytest
from sqlalchemy.dialects import postgresql

from app.models import meal_logged_between, meal_logged_on


def _bound_values(expr):
    compiled = expr.compile(
        dialect=postgresql.dialect(),
        compile_kwargs={"render_postcompile": True},
    )
    return list(compiled.params.values())


def test_meal_logged_on_binds_date_not_string():
    values = _bound_values(meal_logged_on(date(2026, 10, 11)))
    assert values, "expected a bound date parameter"
    for value in values:
        assert isinstance(value, date), f"string bound as date param: {value!r}"


def test_meal_logged_between_binds_dates_not_strings():
    values = _bound_values(
        meal_logged_between(date(2026, 10, 5), date(2026, 10, 11))
    )
    assert len(values) == 2
    for value in values:
        assert isinstance(value, date), f"string bound as date param: {value!r}"


def test_meal_logged_on_rejects_strings():
    with pytest.raises(TypeError):
        meal_logged_on("2026-10-11")


def test_meal_logged_between_rejects_strings():
    with pytest.raises(TypeError):
        meal_logged_between("2026-10-05", date(2026, 10, 11))
