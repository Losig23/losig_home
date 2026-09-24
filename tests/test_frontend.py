"""Localhost frontend: dashboard, food page, shared nav/layout."""
import io
import os
import shutil
from datetime import date

import pytest

PNG_1X1 = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
    b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde"
    b"\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N"
    b"\x00\x00\x00\x00IEND\xaeB`\x82"
)

NAV_URLS = ["/", "/log", "/progress", "/analysis", "/bodyweight", "/travel", "/food"]


@pytest.fixture(autouse=True)
def _clean_uploads(app):
    yield
    shutil.rmtree(os.path.join(app.instance_path, "uploads"), ignore_errors=True)


@pytest.fixture(autouse=True)
def _no_nutrition_key(monkeypatch):
    monkeypatch.delenv("API_NINJAS_KEY", raising=False)


def test_dashboard_renders_with_nav(client):
    resp = client.get("/")
    assert resp.status_code == 200
    html = resp.get_data(as_text=True)
    assert "Dashboard" in html
    for url in NAV_URLS:
        assert f'href="{url}"' in html, f"nav missing {url}"
    assert "topnav" in html
    # Empty states render gracefully on a fresh DB.
    assert "no weigh-ins yet" in html
    assert "nothing logged today" in html


def test_api_index_moved(client):
    resp = client.get("/api")
    assert resp.status_code == 200
    assert resp.get_json()["name"] == "losig_home"


def test_food_page_has_upload_form(client):
    resp = client.get("/food")
    assert resp.status_code == 200
    html = resp.get_data(as_text=True)
    assert 'id="meal-form"' in html
    assert 'type="file"' in html
    assert 'id="f-date"' in html
    assert "/api/meals" in html  # JS posts to the meals API


def test_all_nav_targets_return_200(client):
    for url in NAV_URLS:
        resp = client.get(url)
        assert resp.status_code == 200, url
        assert "topnav" in resp.get_data(as_text=True), url


def test_wrapped_legacy_pages_keep_content(client):
    # The layout wrapper must not strip page internals.
    assert "No weigh-ins yet" in client.get("/bodyweight").get_data(as_text=True)
    travel_html = client.get("/travel").get_data(as_text=True)
    assert "No travel workouts yet" in travel_html
    analysis_html = client.get("/analysis").get_data(as_text=True)
    assert "Progress Analysis" in analysis_html  # rules text, no cards yet
    assert "least-squares slope" in analysis_html
    progress_html = client.get("/progress").get_data(as_text=True)
    assert "Lifting Progress" in progress_html
    assert "/exercises/1/progress" in progress_html  # seeded exercise links
    ex_html = client.get("/exercises/1/progress").get_data(as_text=True)
    assert "topnav" in ex_html  # wrapped in the shared layout

    # With data present, the bodyweight chart renders its SVG too.
    client.post(
        "/api/bodyweight",
        json={"date": date.today().isoformat(), "weight_lb": 185.4},
    )
    assert "<svg" in client.get("/bodyweight").get_data(as_text=True)


def test_dashboard_reflects_weigh_in_and_meal(client):
    today = date.today().isoformat()
    r = client.post(
        "/api/bodyweight", json={"date": today, "weight_lb": 185.4}
    )
    assert r.status_code == 200

    data = {
        "description": "chicken biryani",
        "calories": "650",
        "protein_g": "30",
        "photo": (io.BytesIO(PNG_1X1), "meal.png"),
    }
    r = client.post(
        "/api/meals", data=data, content_type="multipart/form-data"
    )
    assert r.status_code == 201

    html = client.get("/").get_data(as_text=True)
    assert "185.4" in html
    assert "650" in html


def test_food_upload_same_shape_as_page_js(client):
    """The multipart shape the /food page's JS sends must work."""
    fd = {
        "description": "oatmeal",
        "photo": (io.BytesIO(PNG_1X1), "bowl.png"),
        "calories": "320",
        "protein_g": "12",
        "carbs_g": "55",
        "fat_g": "6",
    }
    resp = client.post(
        "/api/meals", data=fd, content_type="multipart/form-data"
    )
    assert resp.status_code == 201
    body = resp.get_json()
    assert body["description"] == "oatmeal"
    assert body["source"] == "manual"  # no API key in tests
    assert body["photo_url"] is not None

    # The food page's data sources serve the new meal.
    meals = client.get(f"/api/meals?date={date.today().isoformat()}").get_json()
    assert any(m["id"] == body["id"] for m in meals)
    totals = client.get(
        f"/api/meals/daily?date={date.today().isoformat()}"
    ).get_json()
    assert totals["calories"] == 320
    assert totals["meal_count"] >= 1

    photo = client.get(f"/api/meals/{body['id']}/photo")
    assert photo.status_code == 200
