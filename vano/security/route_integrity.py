"""Authenticate server-generated route data before it is shared or reused."""
import hashlib
import hmac
import json
import math
import time

FIELDS = (
    "distance", "duration", "duration_min", "geometry", "steps", "profile",
    "safety_score", "safety_level", "safety_level_label", "traffic_score",
    "traffic_level", "nearby_alerts", "risk_zones", "road_controls",
    "road_controls_count", "micro_route", "micro_avoided_points", "badges",
    "routing_provider", "shared_mode",
)


def _message(route, issued_at):
    data = {key: route.get(key) for key in FIELDS}
    return json.dumps({"v": 1, "issued_at": issued_at, "route": data},
                      sort_keys=True, separators=(",", ":"), allow_nan=False).encode()


def attest_route(route, secret, now=None):
    issued_at = int(time.time() if now is None else now)
    signature = hmac.new(secret.encode(), _message(route, issued_at), hashlib.sha256).hexdigest()
    return {"issued_at": issued_at, "signature": signature}


def valid_attestation(route, secret, now=None):
    try:
        proof = route.get("attestation") or {}
        stamp = proof["issued_at"]
        if not isinstance(stamp, int) or isinstance(stamp, bool):
            return False
        age = (time.time() if now is None else now) - stamp
        if not 0 <= age <= 6 * 3600:
            return False
        expected = attest_route(route, secret, stamp)["signature"]
        return hmac.compare_digest(expected, str(proof.get("signature") or ""))
    except (ValueError, TypeError, KeyError, OverflowError, AttributeError):
        return False


def valid_geometry(geometry):
    if not isinstance(geometry, dict) or geometry.get("type") != "LineString":
        return False
    coords = geometry.get("coordinates")
    if not isinstance(coords, list) or not 2 <= len(coords) <= 30000:
        return False
    for point in coords:
        if not isinstance(point, (list, tuple)) or len(point) != 2:
            return False
        if any(isinstance(x, bool) or not isinstance(x, (int, float)) or not math.isfinite(x) for x in point):
            return False
        if not (-180 <= point[0] <= 180 and -90 <= point[1] <= 90):
            return False
    return True


def valid_metrics(route):
    for key, low, high in (("distance", 0, 10000000), ("duration", 0, 604800),
                           ("duration_min", 0, 10080), ("safety_score", 0, 100),
                           ("safety_level", 0, 5), ("traffic_score", 0, 100),
                           ("road_controls_count", 0, 100000), ("micro_avoided_points", 0, 10000)):
        value = route.get(key, 0)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
            return False
    return all(isinstance(route.get(key, []), list) for key in
               ("steps", "nearby_alerts", "risk_zones", "road_controls", "badges"))
