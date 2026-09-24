"""Shared page layout: wraps the existing inline-HTML pages in base.html.

The older pages (travel, bodyweight, analysis, progress, live) render full
``<!doctype html>`` documents as f-strings. Rather than rewriting them,
``wrap_page`` extracts the <title>, inline <style> blocks, and <body>
content and re-renders through ``templates/base.html`` so the whole site
shares one nav bar and stylesheet. New pages are plain Jinja templates
extending base.html directly.
"""
import re

from flask import render_template

NAV = [
    {"key": "dashboard", "label": "Dashboard", "url": "/"},
    {"key": "log", "label": "Log Workout", "url": "/log"},
    {"key": "progress", "label": "Progress", "url": "/progress"},
    {"key": "analysis", "label": "Analysis", "url": "/analysis"},
    {"key": "bodyweight", "label": "Bodyweight", "url": "/bodyweight"},
    {"key": "travel", "label": "Travel", "url": "/travel"},
    {"key": "food", "label": "Food", "url": "/food"},
]


def wrap_page(full_html, active="dashboard"):
    """Render an inline-HTML page string inside the shared layout."""
    head_m = re.search(r"<head[^>]*>(.*?)</head>", full_html, re.S)
    head = head_m.group(1) if head_m else ""
    title_m = re.search(r"<title>(.*?)</title>", head, re.S)
    title = title_m.group(1).strip() if title_m else "losig_home"
    # Strip the site suffix the old pages baked into their titles.
    title = re.sub(r"\s*[—–-]\s*losig_home\s*$", "", title).strip() or "losig_home"

    page_styles = "".join(re.findall(r"<style[^>]*>.*?</style>", head, re.S))

    body_m = re.search(r"<body[^>]*>(.*?)</body>", full_html, re.S)
    content = body_m.group(1) if body_m else full_html

    return render_template(
        "base.html",
        title=title,
        page_styles=page_styles,
        content=content,
        nav=NAV,
        active=active,
    )
