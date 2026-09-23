"""Exercise illustration helpers.

Slug scheme (single source of truth, also used by app/seed.py):
lowercase, runs of non-alphanumerics become dashes ("Seated leg curl /
leg extension" -> "seated-leg-curl-leg-extension"). SVGs live at
app/static/exercises/<slug>.svg and are served by Flask's static route at
/static/exercises/<slug>.svg.
"""
import re

STATIC_URL_PREFIX = "/static/exercises"


def slug_for(name):
    """Deterministic slug for an exercise name (matches seed data)."""
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def url_for_key(key):
    """Public URL for an illustration key."""
    return f"{STATIC_URL_PREFIX}/{key}.svg"


def url_for_exercise(exercise):
    """Illustration URL for an Exercise row.

    Prefers the stored illustration_key; falls back to computing the slug
    from the name so rows predating the column still resolve.
    """
    key = exercise.illustration_key or slug_for(exercise.name)
    return url_for_key(key)
