"""CalorieNinjas (API Ninjas) natural-language nutrition estimates.

Reads API_NINJAS_KEY from the environment — never hardcode keys. Returns
None when the API can't produce an estimate so the caller can fall back to
manually entered macros.

Note: Nutritionix was the original provider, but it ended free public
trials (API access is now sales-gated), so the food module uses API Ninjas'
free tier instead. Sign up with any email at https://api-ninjas.com.
"""
import json
import urllib.parse
import urllib.request

API_URL = "https://api.api-ninjas.com/v1/nutrition"


def estimate_nutrition(description, api_key, timeout=15):
    """Estimate calories/macros for a free-text meal description.

    Returns {"calories", "protein_g", "carbs_g", "fat_g"} summed across all
    items the API identifies, or None on any failure: missing key, network
    error, non-200 status, or an empty/unparseable response.
    """
    if not api_key:
        return None

    url = f"{API_URL}?{urllib.parse.urlencode({'query': description})}"
    req = urllib.request.Request(url, headers={"X-Api-Key": api_key})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if getattr(resp, "status", 200) != 200:
                return None
            data = json.load(resp)
    except Exception:
        return None

    if not isinstance(data, list) or not data:
        return None

    def _total(key):
        return round(sum(float(item.get(key) or 0) for item in data), 1)

    return {
        "calories": _total("calories"),
        "protein_g": _total("protein_g"),
        "carbs_g": _total("carbohydrates_total_g"),
        "fat_g": _total("fat_total_g"),
    }
