"""Shared VANO map POI personalization rules.

Selections are allowlisted and stored as a JSON array; null means legacy defaults.
Safety/road infrastructure markers are intentionally not user-toggleable.
"""
import json

POI_CHOICES = (
    "pharmacy", "fitness", "parking", "fuel", "airport", "ev_charging",
    "train_station", "toll", "restaurant", "supermarket", "shopping",
    "hospital", "school", "police", "cafe",
)
PERMANENT_POIS = ("bank", "park")


def normalize_poi_choices(values):
    chosen = set(values or [])
    return [category for category in POI_CHOICES if category in chosen]


def saved_poi_choices(user):
    try:
        raw = user["poi_visibility_json"]
    except (KeyError, TypeError, IndexError):
        raw = None
    if raw is None:
        return list(POI_CHOICES)
    try:
        parsed = json.loads(raw)
    except (ValueError, TypeError):
        return list(POI_CHOICES)
    return normalize_poi_choices(parsed) if isinstance(parsed, list) else list(POI_CHOICES)
