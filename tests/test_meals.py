"""Food log: photo upload round-trip, daily totals, manual fallback."""
import io
import os
import shutil
import urllib.request
from datetime import datetime

import pytest

# Minimal valid 1x1 PNG.
PNG_1X1 = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
    b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde"
    b"\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N"
    b"\x00\x00\x00\x00IEND\xaeB`\x82"
)


@pytest.fixture(autouse=True)
def _clean_uploads(app):
    yield
    shutil.rmtree(
        os.path.join(app.instance_path, "uploads"), ignore_errors=True
    )


@pytest.fixture(autouse=True)
def _no_nutrition_key(monkeypatch):
    monkeypatch.delenv("API_NINJAS_KEY", raising=False)


def _upload(client, **fields):
    data = {"description": fields.pop("description", "chicken biryani")}
    data.update(fields)
    return client.post(
        "/api/meals", data=data, content_type="multipart/form-data"
    )


def test_upload_with_photo_round_trip(client, app):
    resp = _upload(
        client,
        photo=(io.BytesIO(PNG_1X1), "meal.png"),
        calories="650",
        protein_g="40",
        carbs_g="70",
        fat_g="20",
    )
    assert resp.status_code == 201
    meal = resp.get_json()
    assert meal["source"] == "manual"  # no API key in env
    assert meal["calories"] == 650.0
    assert meal["protein_g"] == 40.0
    assert meal["photo_url"] is not None

    # Photo serves back byte-identical.
    photo_resp = client.get(meal["photo_url"])
    assert photo_resp.status_code == 200
    assert photo_resp.content_type == "image/png"
    assert photo_resp.data == PNG_1X1


def test_upload_without_photo(client):
    resp = _upload(client, description="oatmeal with banana")
    assert resp.status_code == 201
    meal = resp.get_json()
    assert meal["photo_url"] is None
    assert meal["source"] == "manual"
    assert client.get(f"/api/meals/{meal['id']}/photo").status_code == 404


def test_manual_fallback_values_used(client):
    resp = _upload(
        client,
        description="protein shake",
        calories="180",
        protein_g="25",
    )
    meal = resp.get_json()
    assert meal["source"] == "manual"
    assert meal["calories"] == 180.0
    assert meal["protein_g"] == 25.0
    assert meal["carbs_g"] is None


def test_rejects_missing_description(client):
    resp = client.post(
        "/api/meals", data={}, content_type="multipart/form-data"
    )
    assert resp.status_code == 400


def test_rejects_non_image(client):
    resp = _upload(
        client, photo=(io.BytesIO(b"not an image"), "notes.txt")
    )
    assert resp.status_code == 400


def test_daily_totals(client):
    today = datetime.now().date().isoformat()
    _upload(client, description="lunch", calories="600", protein_g="30",
            carbs_g="70", fat_g="15")
    _upload(client, description="dinner", calories="800", protein_g="50",
            carbs_g="60", fat_g="25")

    totals = client.get(f"/api/meals/daily?date={today}").get_json()
    assert totals["meal_count"] == 2
    assert totals["calories"] == 1400.0
    assert totals["protein_g"] == 80.0
    assert totals["carbs_g"] == 130.0
    assert totals["fat_g"] == 40.0

    listed = client.get(f"/api/meals?date={today}").get_json()
    assert len(listed) == 2
    assert listed[0]["description"] == "lunch"

    other = client.get("/api/meals/daily?date=2020-01-01").get_json()
    assert other["meal_count"] == 0
    assert other["calories"] == 0


def _fake_response(payload, status=200):
    import json as jsonlib

    class FakeResp:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def read(self):
            return jsonlib.dumps(payload).encode()

    FakeResp.status = status
    return FakeResp()


def test_calorieninjas_failure_returns_none(monkeypatch):
    from app.nutrition import estimate_nutrition

    def boom(*args, **kwargs):
        raise urllib.request.URLError("no network")

    monkeypatch.setattr(urllib.request, "urlopen", boom)
    assert estimate_nutrition("2 eggs", "key") is None


def test_calorieninjas_non200_returns_none(monkeypatch):
    import urllib.error

    from app.nutrition import estimate_nutrition

    def bad(*args, **kwargs):
        raise urllib.error.HTTPError(
            args[0].full_url, 401, "unauthorized", {}, None
        )

    monkeypatch.setattr(urllib.request, "urlopen", bad)
    assert estimate_nutrition("2 eggs", "key") is None


def test_calorieninjas_empty_response_returns_none(monkeypatch):
    from app.nutrition import estimate_nutrition

    monkeypatch.setattr(
        urllib.request, "urlopen", lambda *a, **k: _fake_response([])
    )
    assert estimate_nutrition("2 eggs", "key") is None


def test_calorieninjas_missing_key_returns_none():
    from app.nutrition import estimate_nutrition

    assert estimate_nutrition("2 eggs", None) is None
    assert estimate_nutrition("2 eggs", "") is None


def test_calorieninjas_success_sums_items(monkeypatch):
    from app.nutrition import estimate_nutrition

    payload = [
        {"calories": 100, "protein_g": 6,
         "carbohydrates_total_g": 1, "fat_total_g": 7},
        {"calories": 200, "protein_g": 4,
         "carbohydrates_total_g": 30, "fat_total_g": 8},
    ]
    monkeypatch.setattr(
        urllib.request, "urlopen", lambda *a, **k: _fake_response(payload)
    )
    result = estimate_nutrition("2 eggs and toast", "key")
    assert result == {
        "calories": 300.0,
        "protein_g": 10.0,
        "carbs_g": 31.0,
        "fat_g": 15.0,
    }


def test_meal_uses_calorieninjas_when_key_set(client, monkeypatch):
    from app.nutrition import estimate_nutrition  # noqa: F401 (import check)

    monkeypatch.setenv("API_NINJAS_KEY", "test-key")
    payload = [
        {"calories": 500, "protein_g": 30,
         "carbohydrates_total_g": 55, "fat_total_g": 15},
    ]
    monkeypatch.setattr(
        urllib.request, "urlopen", lambda *a, **k: _fake_response(payload)
    )
    resp = _upload(client, description="chicken biryani")
    assert resp.status_code == 201
    meal = resp.get_json()
    assert meal["source"] == "calorieninjas"
    assert meal["calories"] == 500.0
    assert meal["protein_g"] == 30.0
    assert meal["carbs_g"] == 55.0
    assert meal["fat_g"] == 15.0


def test_meal_falls_back_to_manual_on_api_error(client, monkeypatch):
    monkeypatch.setenv("API_NINJAS_KEY", "test-key")

    def boom(*args, **kwargs):
        raise urllib.request.URLError("no network")

    monkeypatch.setattr(urllib.request, "urlopen", boom)
    resp = _upload(
        client, description="protein shake", calories="180", protein_g="25"
    )
    meal = resp.get_json()
    assert meal["source"] == "manual"
    assert meal["calories"] == 180.0
