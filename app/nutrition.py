"""Nutritionix natural-language nutrition estimates.

Reads NUTRITIONIX_APP_ID / NUTRITIONIX_API_KEY from the environment — never
hardcode keys. Returns None when the API can't produce an estimate so the
caller can fall back to manually entered macros.
"""
import json
import urllib.request

API_URL = "https://trackapi.nutritionix.com/v2/natural/nutrients"


def estimate_nutrition(description, app_id, api_key, timeout=15):
    """Estimate calories/macros for a free-text meal description.

    Returns {"calories", "protein_g", "carbs_g", "fat_g"} summed across the
    foods Nutritionix identifies, or None on any failure.
    """
    payload = json.dumps({"query": description}).encode("utf-8")
    req = urllib.request.Request(
        API_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "x-app-id": app_id,
            "x-app-key": api_key,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.load(resp)
    except Exception:
        return None

    foods = data.get("foods") or []
    if not foods:
        return None

    def _total(key):
        return round(sum(float(f.get(key) or 0) for f in foods), 1)

    return {
        "calories": _total("nf_calories"),
        "protein_g": _total("nf_protein"),
        "carbs_g": _total("nf_total_carbohydrate"),
        "fat_g": _total("nf_total_fat"),
    }
