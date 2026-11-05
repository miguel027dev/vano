"""Semaforo-aware ETA metadata and guarded correction for non-live routing.

Mapbox driving-traffic already incorporates traffic patterns, which can include
average junction delay. Never add a per-signal tax to that provider ETA: it
would systematically double-count some red-light waits.

Without traffic-aware routing, we expose uncertainty and apply a deliberately
small, bounded *heuristic* adjustment only when Mapbox explicitly reports
signalized intersections. This is not the current phase of any traffic light.
"""
import math
import os


def _enabled():
    return os.environ.get("VANO_SIGNAL_ETA_ENABLED", "1").strip().lower() not in {
        "0", "false", "off", "no",
    }


def _signal_positions(route):
    """Only intersections explicitly marked by the routing provider count.

    De-duplicate the same junction when multiple steps or route legs mention it.
    No Overpass fetch is made on the route-request hot path.
    """
    positions = set()
    for leg in (route.get("legs") or [])[:20]:
        for step in (leg.get("steps") or [])[:1000]:
            for intersection in (step.get("intersections") or [])[:1000]:
                if not intersection.get("traffic_signal"):
                    continue
                location = intersection.get("location") or []
                if len(location) < 2:
                    continue
                try:
                    lon, lat = float(location[0]), float(location[1])
                except (TypeError, ValueError, OverflowError):
                    continue
                if not (math.isfinite(lon) and math.isfinite(lat)):
                    continue
                if not (-180 <= lon <= 180 and -90 <= lat <= 90):
                    continue
                positions.add((round(lon, 5), round(lat, 5)))
                if len(positions) >= 500:
                    return positions
    return positions


def apply_signal_eta(route):
    """Enrich a raw Directions route in-place, safely and idempotently.

    The provider ETA remains authoritative when live traffic is present.
    The fallback correction is not a promise of a precise wait at any signal.
    A feature flag instantly disables additions without affecting routing.
    """
    if not isinstance(route, dict):
        return route
    if "_signal_eta" in route:
        return route
    try:
        base = float(route.get("duration") or 0)
    except (TypeError, ValueError, OverflowError):
        return route
    if not math.isfinite(base) or base <= 0:
        return route

    profile = str(route.get("_profile_used") or "").lower()
    positions = _signal_positions(route)
    count = len(positions)
    motorized = profile in {"driving", "driving-traffic"}
    live = profile == "driving-traffic"
    enabled = _enabled()

    # No provider indicates the current red/green phase or cycle schedule.
    # With Mapbox traffic the historical/light delay may already be in base.
    # If Mapbox falls back to non-live driving, conservatively add only a
    # small bounded residual (not a full estimated red-light wait).
    residual = 0.0
    if enabled and motorized and not live and count:
        residual = min(base * 0.06, count * 4.0, 90.0)
    residual = round(max(0.0, residual), 1)

    # Uncertainty is intentionally a range, NOT a second duration surcharge.
    # The client may widen its existing ETA band for signalized corridors.
    uncertainty = (
        min(420.0, 12.0 * math.sqrt(count) + count * 11.0)
        if enabled and motorized and count else 0.0
    )
    route["_signal_eta"] = {
        "signal_count": count,
        "duration_provider_s": round(base, 1),
        "signal_eta_adjustment_s": residual,
        "signal_eta_uncertainty_s": round(uncertainty, 1),
        "signal_eta_method": (
            "mapbox-traffic-included" if live else
            "bounded-nonlive-heuristic" if motorized and count and enabled else
            "not-adjusted"
        ),
        "signal_eta_confidence": "estimated" if motorized and count else "unavailable",
    }
    if residual:
        route["duration"] = round(base + residual, 1)
    return route


def signal_eta_fields(route):
    """Public, bounded summary; never expose intersection locations here."""
    data = (route or {}).get("_signal_eta") or {}
    return {
        "signal_count": int(data.get("signal_count") or 0),
        "duration_provider_s": data.get("duration_provider_s"),
        "signal_eta_adjustment_s": float(data.get("signal_eta_adjustment_s") or 0),
        "signal_eta_uncertainty_s": float(data.get("signal_eta_uncertainty_s") or 0),
        "signal_eta_method": str(data.get("signal_eta_method") or "unavailable"),
        "signal_eta_confidence": str(data.get("signal_eta_confidence") or "unavailable"),
    }



def apply_signal_eta_payload(route):
    """Normalize Route Node response rows at the Central without new API calls.

    Workers may still run an older build. Their public road_controls already
    carry Mapbox signal positions, so Central can expose identical ETA
    metadata (and the tiny non-live fallback correction) for every client.
    Existing enriched rows are left untouched to prevent double adjustment.
    """
    if not isinstance(route, dict):
        return route
    if route.get("signal_eta_method"):
        return route
    controls = route.get("road_controls") or []
    intersections = [
        {"traffic_signal": True, "location": [point.get("lon"), point.get("lat")]}
        for point in controls[:500]
        if isinstance(point, dict) and point.get("type") == "traffic_signal"
    ]
    probe = {
        "duration": route.get("duration"),
        # A missing worker profile must not invent a non-live correction.
        "_profile_used": route.get("routing_profile_used") or "driving-traffic",
        "legs": [{"steps": [{"intersections": intersections}]}],
    }
    apply_signal_eta(probe)
    if not probe.get("_signal_eta"):
        return route
    route.update(signal_eta_fields(probe))
    if route["signal_eta_adjustment_s"]:
        route["duration"] = probe["duration"]
        route["duration_min"] = round(float(probe["duration"]) / 60.0, 1)
    return route
