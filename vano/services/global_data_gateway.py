"""Small, fail-open international context gateway for VANO MAPS.

Only public, fixed-origin APIs are queried. Results describe *regional*
events and must NEVER be interpreted as road closures or automatic reroutes.
Route calculation does not depend on this module.
"""
from __future__ import annotations

import math
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import requests

# No user-controlled provider URLs (SSRF prevention).
_SOURCES = {
    "nasa-eonet": {
        "url": "https://eonet.gsfc.nasa.gov/api/v3/events",
        "params": {"status": "open", "limit": 200, "days": 30},
        "ttl": 600,
    },
    "usgs-earthquakes": {
        "url": "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.geojson",
        "params": None,
        "ttl": 90,
    },
}
_EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix="vano-global-data")
_LOCK = threading.Lock()
_CACHE = {
    name: {"events": (), "success_at": 0.0, "attempt_at": 0.0, "pending": False}
    for name in _SOURCES
}
_MAX_STALE_SECONDS = 3600
_RETRY_SECONDS = 60


def _point(lon, lat):
    try:
        lon, lat = float(lon), float(lat)
        if math.isfinite(lon) and math.isfinite(lat) and -180 <= lon <= 180 and -90 <= lat <= 90:
            return lat, lon
    except (TypeError, ValueError):
        pass
    return None


def _distance_km(lat1, lon1, lat2, lon2):
    a, b, c, d = map(math.radians, (lat1, lon1, lat2, lon2))
    angle = math.sin((c-a)/2)**2 + math.cos(a)*math.cos(c)*math.sin((d-b)/2)**2
    return 12742.0 * math.asin(min(1.0, math.sqrt(max(0.0, angle))))


def _parse_eonet(data):
    output = []
    for raw in (data.get("events") or [])[:200]:
        if not isinstance(raw, dict) or raw.get("closed"):
            continue
        # Only exact point geometry is shown. A polygon must not be presented
        # as a precise street-level hazard based on an arbitrary vertex.
        points = [g for g in (raw.get("geometry") or []) if isinstance(g, dict) and g.get("type") == "Point"]
        if not points:
            continue
        latest = max(points, key=lambda g: str(g.get("date") or ""))
        coords = latest.get("coordinates") or []
        if len(coords) < 2:
            continue
        point = _point(coords[0], coords[1])
        if not point:
            continue
        categories = raw.get("categories") or []
        kind = (categories[0].get("id") or "natural-event") if categories and isinstance(categories[0], dict) else "natural-event"
        output.append({
            "id": "eonet:" + str(raw.get("id") or "")[:80],
            "source": "nasa-eonet",
            "kind": str(kind)[:50],
            "title": str(raw.get("title") or "Evento natural")[:140],
            "lat": point[0],
            "lon": point[1],
            "observed_at": str(latest.get("date") or "")[:40],
            "precision": "regional",
            "route_effect": "advisory_only",
        })
    return output


def _parse_usgs(data):
    output = []
    for raw in (data.get("features") or [])[:150]:
        if not isinstance(raw, dict):
            continue
        geometry = raw.get("geometry") or {}
        coords = geometry.get("coordinates") or []
        if geometry.get("type") != "Point" or len(coords) < 2:
            continue
        point = _point(coords[0], coords[1])
        if not point:
            continue
        props = raw.get("properties") or {}
        try:
            magnitude = float(props.get("mag"))
            if not math.isfinite(magnitude):
                magnitude = None
        except (TypeError, ValueError):
            magnitude = None
        try:
            occurred_at = datetime.fromtimestamp(float(props.get("time")) / 1000, tz=timezone.utc).isoformat()
        except (TypeError, ValueError, OverflowError, OSError):
            occurred_at = None
        output.append({
            "id": "usgs:" + str(raw.get("id") or "")[:80],
            "source": "usgs-earthquakes",
            "kind": "earthquake",
            "title": str(props.get("title") or "Terremoto")[:140],
            "lat": point[0],
            "lon": point[1],
            "observed_at": occurred_at,
            "magnitude": magnitude,
            "precision": "regional",
            "route_effect": "advisory_only",
        })
    return output


def _fetch(name):
    cfg = _SOURCES[name]
    response = requests.get(
        cfg["url"], params=cfg["params"],
        headers={"Accept": "application/json", "User-Agent": "VANO-Maps/1.0 (regional-events; public-data)"},
        timeout=(1.3, 2.7),
    )
    response.raise_for_status()
    # Avoid accepting huge accidental upstream payloads.
    if len(response.content) > 2_000_000:
        raise ValueError("Upstream response too large")
    payload = response.json()
    if not isinstance(payload, dict):
        raise ValueError("Unexpected upstream response")
    return _parse_eonet(payload) if name == "nasa-eonet" else _parse_usgs(payload)


def _refresh(name):
    try:
        events = tuple(_fetch(name))
    except (requests.RequestException, ValueError, KeyError, TypeError):
        # Keep last known good data for a bounded time; retry later.
        with _LOCK:
            _CACHE[name]["pending"] = False
        return
    with _LOCK:
        _CACHE[name].update(events=events, success_at=time.monotonic(), pending=False)


def get_global_context(lat, lon, radius_km=100):
    """Return immediately from cache. Refresh providers only in background."""
    point = _point(lon, lat)
    if not point:
        raise ValueError("Invalid coordinates")
    try:
        radius_km = float(radius_km)
    except (TypeError, ValueError):
        raise ValueError("Invalid radius") from None
    if not math.isfinite(radius_km) or radius_km < 1 or radius_km > 250:
        raise ValueError("Radius must be 1..250 km")
    now = time.monotonic()
    snapshots = {}
    with _LOCK:
        for name, cfg in _SOURCES.items():
            entry = _CACHE[name]
            if (not entry["pending"] and now - entry["attempt_at"] >= _RETRY_SECONDS
                    and (not entry["success_at"] or now - entry["success_at"] >= cfg["ttl"])):
                entry["pending"] = True
                entry["attempt_at"] = now
                try:
                    _EXECUTOR.submit(_refresh, name)
                except RuntimeError:
                    entry["pending"] = False
            age = now - entry["success_at"] if entry["success_at"] else None
            snapshots[name] = {
                "events": entry["events"] if age is not None and age <= _MAX_STALE_SECONDS else (),
                "state": ("loading" if age is None and entry["pending"] else
                          "unavailable" if age is None or age > _MAX_STALE_SECONDS else
                          "stale" if age > cfg["ttl"] else "fresh"),
                "pending": entry["pending"],
                "age_seconds": round(age) if age is not None else None,
            }

    events = []
    for name, data in snapshots.items():
        for item in data["events"]:
            distance = _distance_km(point[0], point[1], item["lat"], item["lon"])
            if distance <= radius_km:
                events.append({**item, "distance_km": round(distance, 1)})
    events.sort(key=lambda item: (item["distance_km"], item["source"]))
    return {
        "events": events[:40],
        "sources": [
            {"id": name, "state": data["state"], "pending": data["pending"],
             "age_seconds": data["age_seconds"]}
            for name, data in snapshots.items()
        ],
        "radius_km": radius_km,
        "routing_effect": "none",
        "notice": "Eventos regionais, não bloqueios de vias confirmados.",
    }
