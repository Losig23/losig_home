"""Exercise illustrations: every seed exercise resolves to a valid SVG."""
import os
import xml.etree.ElementTree as ET

from app.illustrations import slug_for, url_for_exercise
from app.models import Exercise
from app.seed import ROUTINE

STATIC_DIR = os.path.join(
    os.path.dirname(__file__), "..", "app", "static", "exercises"
)


def seed_names():
    return [name for _, _, exs in ROUTINE for _, name, _, _, _ in exs]


def test_every_seed_exercise_has_svg_file():
    missing = [
        n
        for n in set(seed_names())
        if not os.path.isfile(os.path.join(STATIC_DIR, slug_for(n) + ".svg"))
    ]
    assert not missing, f"missing illustrations for: {missing}"


def test_all_svgs_valid_xml_viewbox_and_size():
    files = [f for f in os.listdir(STATIC_DIR) if f.endswith(".svg")]
    assert len(files) == len(set(seed_names())), (
        f"expected {len(set(seed_names()))} SVGs, found {len(files)}"
    )
    for fn in files:
        path = os.path.join(STATIC_DIR, fn)
        assert os.path.getsize(path) < 3 * 1024, f"{fn} too big"
        assert os.path.getsize(path) > 100, f"{fn} suspiciously small"
        root = ET.parse(path).getroot()
        assert root.tag == "{http://www.w3.org/2000/svg}svg", fn
        assert root.attrib.get("viewBox") == "0 0 200 200", fn


def test_svg_served_with_correct_content_type(client):
    ex = Exercise.query.first()
    resp = client.get(url_for_exercise(ex))
    assert resp.status_code == 200
    assert resp.content_type.startswith("image/svg+xml")
    assert len(resp.data) > 100
    assert b"<svg" in resp.data


def test_routine_includes_illustration_url_for_every_exercise(client):
    resp = client.get("/api/routine")
    assert resp.status_code == 200
    seen = 0
    for day in resp.get_json():
        for e in day["exercises"]:
            url = e.get("illustration_url")
            assert url and url.startswith("/static/exercises/"), e["name"]
            assert os.path.isfile(
                os.path.join(STATIC_DIR, os.path.basename(url))
            ), url
            seen += 1
    assert seen == len(seed_names())


def test_session_payload_includes_illustration_url(client):
    resp = client.post(
        "/api/sessions", json={"day_number": 1, "date": "2026-09-23"}
    )
    sid = resp.get_json()["id"]
    resp = client.get(f"/api/sessions/{sid}")
    groups = resp.get_json()["sets_by_exercise"]
    assert groups
    for g in groups:
        assert g["illustration_url"].startswith("/static/exercises/")


def test_log_page_references_illustrations(client):
    resp = client.post(
        "/api/sessions", json={"day_number": 1, "date": "2026-09-23"}
    )
    sid = resp.get_json()["id"]
    page = client.get(f"/sessions/{sid}/log")
    assert page.status_code == 200
    html = page.get_data(as_text=True)
    # URLs arrive via the session JSON at runtime; the page template must
    # reference the property and render the thumbnail.
    assert "illustration_url" in html
    assert "thumb" in html


def test_progress_api_and_page_include_illustration(client):
    ex = Exercise.query.filter_by(name="Squats").first()
    data = client.get(f"/api/exercises/{ex.id}/progress").get_json()
    assert data["exercise"]["illustration_url"] == "/static/exercises/squats.svg"
    html = client.get(f"/exercises/{ex.id}/progress").get_data(as_text=True)
    assert "/static/exercises/squats.svg" in html


def test_slug_matches_seed_convention():
    assert slug_for("Seated leg curl / leg extension") == (
        "seated-leg-curl-leg-extension"
    )
    assert slug_for("Pull-ups") == "pull-ups"
