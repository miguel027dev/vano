"""VANO Radar Intelligence.

Lightweight, region-aware radar discovery with PostgreSQL persistence.

Design goals:
- PostgreSQL is the first source queried on every request.
- Remote providers are only consulted when the current map cell is stale.
- OpenStreetMap/Overpass provides worldwide baseline coverage.
- Official public datasets are enabled only inside their geographic coverage.
- Every discovered radar is normalized and persisted so VANO gradually builds its
  own cache/base without storing user GPS history.
- No PostGIS dependency: bounding-box SQL + precise Haversine filtering keeps
  deployment compatible with the existing VANO database.
"""
from __future__ import annotations

import csv
import io
import json
import math
import os
import re
import threading
import time
import unicodedata
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

import requests

RADAR_ENABLED = os.environ.get("VANO_RADARS_ENABLED", "1").strip().lower() not in {"0", "false", "off", "no"}
RADAR_REMOTE_ENABLED = os.environ.get("VANO_RADARS_REMOTE_ENABLED", "1").strip().lower() not in {"0", "false", "off", "no"}
OVERPASS_URL = os.environ.get("OVERPASS_URL", "https://overpass-api.de/api/interpreter").strip()
RADAR_HTTP_TIMEOUT = max(2.5, min(12.0, float(os.environ.get("VANO_RADAR_HTTP_TIMEOUT", "6.5") or 6.5)))
RADAR_CELL_TTL_HOURS = max(1, min(168, int(os.environ.get("VANO_RADAR_CELL_TTL_HOURS", "18") or 18)))
RADAR_FAILURE_RETRY_MIN = max(5, min(360, int(os.environ.get("VANO_RADAR_FAILURE_RETRY_MIN", "30") or 30)))
RADAR_MAX_RETURN = max(20, min(500, int(os.environ.get("VANO_RADAR_MAX_RETURN", "160") or 160)))
RADAR_MAX_RADIUS_M = max(1500, min(15000, int(os.environ.get("VANO_RADAR_MAX_RADIUS_M", "6500") or 6500)))
RADAR_SOURCE_CACHE_TTL = max(900, min(86400, int(os.environ.get("VANO_RADAR_SOURCE_CACHE_TTL", "21600") or 21600)))
RADAR_USER_AGENT = os.environ.get("VANO_RADAR_USER_AGENT", "VANO MAPS/7.0 radar-intelligence (+https://vanomaps.online)").strip()

_SESSION = requests.Session()
_SESSION.headers.update({"User-Agent": RADAR_USER_AGENT, "Accept": "application/json,text/csv,*/*;q=0.8"})
_SOURCE_CACHE: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_SOURCE_LOCKS: dict[str, threading.Lock] = {}
_SOURCE_LOCKS_GUARD = threading.Lock()


def _source_lock(name: str) -> threading.Lock:
    with _SOURCE_LOCKS_GUARD:
        return _SOURCE_LOCKS.setdefault(name, threading.Lock())


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime | None = None) -> str:
    return (dt or _utcnow()).replace(microsecond=0).isoformat()


def _parse_iso(value: Any) -> datetime | None:
    try:
        dt = datetime.fromisoformat(str(value or "").replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def _clean_text(value: Any, limit: int = 180) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()[:limit]


def _key_text(value: Any) -> str:
    s = unicodedata.normalize("NFKD", str(value or ""))
    s = "".join(ch for ch in s if not unicodedata.combining(ch)).lower()
    return re.sub(r"[^a-z0-9]+", "_", s).strip("_")


def _row_map(row: dict[str, Any]) -> dict[str, Any]:
    return {_key_text(k): v for k, v in (row or {}).items()}


def _first(row: dict[str, Any], *names: str, default: Any = "") -> Any:
    mapped = _row_map(row)
    for name in names:
        k = _key_text(name)
        if k in mapped and mapped[k] not in (None, ""):
            return mapped[k]
    return default


def _num(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        x = float(value)
        return x if math.isfinite(x) else None
    raw = str(value).strip().replace("\u00a0", "")
    if not raw:
        return None
    # Brazilian/European decimal comma, while preserving ordinary decimal dots.
    if "," in raw and "." not in raw:
        raw = raw.replace(",", ".")
    elif "," in raw and "." in raw and raw.rfind(",") > raw.rfind("."):
        raw = raw.replace(".", "").replace(",", ".")
    raw = re.sub(r"[^0-9+\-.]", "", raw)
    try:
        x = float(raw)
        return x if math.isfinite(x) else None
    except Exception:
        return None


def _int_speed(value: Any) -> int | None:
    x = _num(value)
    if x is None or x <= 0 or x > 250:
        return None
    return int(round(x))


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    a1, a2 = math.radians(lat1), math.radians(lat2)
    da, do = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(da / 2) ** 2 + math.cos(a1) * math.cos(a2) * math.sin(do / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def _bbox_contains(bbox: tuple[float, float, float, float] | None, lat: float, lon: float) -> bool:
    if not bbox:
        return True
    min_lat, min_lon, max_lat, max_lon = bbox
    return min_lat <= lat <= max_lat and min_lon <= lon <= max_lon


def _normalize_type(value: Any) -> str:
    s = _key_text(value)
    if any(x in s for x in ("red_light", "redlight", "traffic_light", "semaforo")) and "speed" in s:
        return "red_light_speed"
    if any(x in s for x in ("red_light", "redlight", "traffic_light", "semaforo")):
        return "red_light"
    if any(x in s for x in ("average", "section", "trecho", "point_to_point")):
        return "average_speed"
    if any(x in s for x in ("mobile", "movel", "portable", "trailer")):
        return "mobile_zone"
    if any(x in s for x in ("school", "escolar")):
        return "school_zone"
    if any(x in s for x in ("stop", "parada")):
        return "stop_sign"
    if any(x in s for x in ("bus", "onibus")):
        return "bus_lane"
    return "fixed_speed"


def _label_for_type(kind: str) -> str:
    return {
        "fixed_speed": "Radar de velocidade",
        "red_light": "Fiscalização de semáforo",
        "red_light_speed": "Radar de velocidade e semáforo",
        "average_speed": "Fiscalização de velocidade média",
        "mobile_zone": "Zona de fiscalização móvel",
        "school_zone": "Radar em zona escolar",
        "stop_sign": "Fiscalização de parada obrigatória",
        "bus_lane": "Fiscalização de faixa de ônibus",
    }.get(kind, "Fiscalização eletrônica")


def _radar(source: str, source_id: Any, lat: Any, lon: Any, *, radar_type: Any = "fixed_speed",
           speed_limit: Any = None, direction: Any = "", road_name: Any = "", city: Any = "",
           state: Any = "", country: Any = "", source_url: str = "", official: bool = False,
           confidence: float = .82, active: bool = True, metadata: dict[str, Any] | None = None) -> dict[str, Any] | None:
    lat_v, lon_v = _num(lat), _num(lon)
    if lat_v is None or lon_v is None or not (-90 <= lat_v <= 90 and -180 <= lon_v <= 180):
        return None
    kind = _normalize_type(radar_type)
    # 4 decimals is ~11 m latitude. This intentionally merges the same physical
    # camera reported by multiple feeds while keeping separate nearby devices.
    geo_key = f"{kind}:{lat_v:.4f}:{lon_v:.4f}"
    return {
        "geo_key": geo_key,
        "type": "speed_camera",  # UI compatibility: existing VANO radar icon/voice.
        "radar_type": kind,
        "label": _label_for_type(kind),
        "lat": round(lat_v, 7),
        "lon": round(lon_v, 7),
        "speed_limit": _int_speed(speed_limit),
        "direction": _clean_text(direction, 80),
        "road_name": _clean_text(road_name, 180),
        "city": _clean_text(city, 100),
        "state": _clean_text(state, 80),
        "country": _clean_text(country, 2).upper() if country else "",
        "source": _clean_text(source, 60),
        "source_id": _clean_text(source_id, 180),
        "source_url": _clean_text(source_url, 600),
        "official": bool(official),
        "confidence": max(0.0, min(1.0, float(confidence))),
        "active": bool(active),
        "metadata": metadata or {},
    }


def _filter_near(items: list[dict[str, Any]], lat: float, lon: float, radius_m: float) -> list[dict[str, Any]]:
    out = []
    for item in items or []:
        try:
            d = _haversine_m(lat, lon, float(item["lat"]), float(item["lon"]))
        except Exception:
            continue
        if d <= radius_m:
            x = dict(item)
            x["distance_m"] = round(d)
            out.append(x)
    return sorted(out, key=lambda x: x.get("distance_m", 10**9))


def _cached_bulk(name: str, loader: Callable[[], list[dict[str, Any]]], ttl: int = RADAR_SOURCE_CACHE_TTL) -> list[dict[str, Any]]:
    now = time.time()
    current = _SOURCE_CACHE.get(name)
    if current and now - current[0] < ttl:
        return current[1]
    lock = _source_lock(name)
    with lock:
        current = _SOURCE_CACHE.get(name)
        if current and now - current[0] < ttl:
            return current[1]
        items = loader()
        _SOURCE_CACHE[name] = (time.time(), items)
        return items


def _get_json(url: str, *, params: dict[str, Any] | None = None, timeout: float | None = None) -> Any:
    r = _SESSION.get(url, params=params, timeout=timeout or RADAR_HTTP_TIMEOUT)
    r.raise_for_status()
    return r.json()


def _get_text(url: str, *, timeout: float | None = None) -> str:
    r = _SESSION.get(url, timeout=timeout or RADAR_HTTP_TIMEOUT)
    r.raise_for_status()
    return r.content.decode(r.encoding or "utf-8", errors="replace")


def fetch_osm(lat: float, lon: float, radius_m: int) -> list[dict[str, Any]]:
    radius = max(300, min(7000, int(radius_m)))
    query = f'''[out:json][timeout:8];(
      node(around:{radius},{lat:.6f},{lon:.6f})["highway"="speed_camera"];
      nwr(around:{radius},{lat:.6f},{lon:.6f})["enforcement"~"^(maxspeed|speed|traffic_signals)$"];
      relation(around:{radius},{lat:.6f},{lon:.6f})["type"="enforcement"]["enforcement"~"^(maxspeed|speed|traffic_signals)$"];
    );out center tags 1800;'''
    endpoints = []
    for url in (OVERPASS_URL, "https://overpass.kumi.systems/api/interpreter"):
        if url and url not in endpoints:
            endpoints.append(url)
    last_exc = None
    for url in endpoints[:2]:
        try:
            r = _SESSION.post(url, data={"data": query}, timeout=min(9.0, RADAR_HTTP_TIMEOUT + 2))
            r.raise_for_status()
            data = r.json()
            out: list[dict[str, Any]] = []
            for el in data.get("elements", []) or []:
                tags = el.get("tags") or {}
                center = el.get("center") or {}
                elat = el.get("lat", center.get("lat")); elon = el.get("lon", center.get("lon"))
                enforcement = str(tags.get("enforcement") or "")
                kind = "red_light_speed" if "traffic_signals" in enforcement and tags.get("maxspeed") else ("red_light" if "traffic_signals" in enforcement else "fixed_speed")
                item = _radar(
                    "openstreetmap", f"{el.get('type','node')}/{el.get('id','')}", elat, elon,
                    radar_type=kind,
                    speed_limit=tags.get("maxspeed") or tags.get("maxspeed:forward") or tags.get("maxspeed:backward"),
                    direction=tags.get("direction") or tags.get("camera:direction") or "",
                    road_name=tags.get("name") or tags.get("ref") or "",
                    country="",
                    source_url="https://www.openstreetmap.org/copyright",
                    official=False, confidence=.78,
                    metadata={"osm_type": el.get("type"), "enforcement": enforcement},
                )
                if item:
                    out.append(item)
            return _filter_near(out, lat, lon, radius)
        except Exception as exc:
            last_exc = exc
    if last_exc:
        raise last_exc
    return []


def _ckan_latest_json(package_url: str, package_id: str) -> tuple[str, str]:
    data = _get_json(package_url, params={"id": package_id})
    resources = ((data or {}).get("result") or {}).get("resources") or []
    candidates = []
    for r in resources:
        fmt = str(r.get("format") or r.get("mimetype") or "").lower()
        url = str(r.get("url") or "").strip()
        if url and ("json" in fmt or url.lower().endswith(".json")):
            candidates.append((str(r.get("last_modified") or r.get("created") or ""), url, str(r.get("id") or "")))
    if not candidates:
        raise RuntimeError("CKAN dataset without JSON radar resource")
    candidates.sort(reverse=True)
    _, url, rid = candidates[0]
    return url, rid


def fetch_antt(lat: float, lon: float, radius_m: int) -> list[dict[str, Any]]:
    def load() -> list[dict[str, Any]]:
        api = "https://dados.antt.gov.br/api/3/action/package_show"
        url, rid = _ckan_latest_json(api, "radar")
        payload = _get_json(url, timeout=min(10.0, RADAR_HTTP_TIMEOUT + 3))
        rows = payload if isinstance(payload, list) else (payload.get("result") or payload.get("data") or payload.get("records") or [])
        if isinstance(rows, dict):
            rows = rows.get("records") or rows.get("results") or []
        out = []
        for i, row in enumerate(rows or []):
            if not isinstance(row, dict):
                continue
            status = _clean_text(_first(row, "situacao", "situação", "status")).lower()
            item = _radar(
                "antt", _first(row, "id", "codigo", default=f"{rid}:{i}"),
                _first(row, "latitude", "lat"), _first(row, "longitude", "lon", "lng"),
                radar_type=_first(row, "tipo_de_radar", "tipo de radar", "tipo", default="fixed_speed"),
                speed_limit=_first(row, "velocidade", "velocidade_regulamentada", "limite", "maxspeed"),
                direction=_first(row, "sentido", "direcao", "direção"),
                road_name=_first(row, "rodovia", "br", "via"), city=_first(row, "municipio", "município"),
                state=_first(row, "uf", "estado"), country="BR",
                source_url="https://dados.antt.gov.br/dataset/radar", official=True, confidence=.98,
                active=status not in {"inativo", "inactive", "desativado"},
                metadata={"concessionaria": _clean_text(_first(row, "concessionaria", "concessionária"), 120), "km": _clean_text(_first(row, "km_m", "km"), 30)},
            )
            if item and item["active"]:
                out.append(item)
        return out
    return _filter_near(_cached_bulk("antt", load, ttl=6 * 3600), lat, lon, radius_m)


def fetch_singapore(lat: float, lon: float, radius_m: int) -> list[dict[str, Any]]:
    def load() -> list[dict[str, Any]]:
        dataset_id = "d_983804de2bc016f53e44031d85d1ec8a"
        data = _get_json("https://data.gov.sg/api/action/datastore_search", params={"resource_id": dataset_id, "limit": 5000})
        rows = ((data or {}).get("result") or {}).get("records") or []
        out = []
        for row in rows:
            item = _radar(
                "singapore_spf", _first(row, "_id", "id", "location"),
                _first(row, "location_latitude", "latitude"), _first(row, "location_longitude", "longitude"),
                radar_type=_first(row, "type_of_speed_camera", "type"), road_name=_first(row, "location", "address"),
                country="SG", source_url="https://data.gov.sg/datasets/d_983804de2bc016f53e44031d85d1ec8a/view",
                official=True, confidence=.99,
            )
            if item: out.append(item)
        return out
    return _filter_near(_cached_bulk("singapore_spf", load), lat, lon, radius_m)


def fetch_taiwan(lat: float, lon: float, radius_m: int) -> list[dict[str, Any]]:
    def load() -> list[dict[str, Any]]:
        url = "https://opdadm.moi.gov.tw/api/v1/no-auth/resource/api/dataset/EA5E6FCD-B82D-43B7-A5CF-E9893253187E/resource/C5EB4610-42C1-4A9A-B881-9B09F67CAB29/download"
        text = _get_text(url, timeout=min(10.0, RADAR_HTTP_TIMEOUT + 3))
        rows = list(csv.DictReader(io.StringIO(text.lstrip("\ufeff"))))
        out = []
        for i, row in enumerate(rows):
            item = _radar(
                "taiwan_npa", _first(row, "id", default=i), _first(row, "Latitude", "lat"), _first(row, "Longitude", "lon"),
                radar_type="fixed_speed", speed_limit=_first(row, "limit", "speedlimit"), direction=_first(row, "direct", "direction"),
                road_name=_first(row, "Address", "address"), city=_first(row, "CityName", "city"), state=_first(row, "RegionName", "region"),
                country="TW", source_url="https://data.gov.tw/en/datasets/7320", official=True, confidence=.99,
            )
            if item: out.append(item)
        return out
    return _filter_near(_cached_bulk("taiwan_npa", load, ttl=3 * 3600), lat, lon, radius_m)


def fetch_hong_kong(lat: float, lon: float, radius_m: int) -> list[dict[str, Any]]:
    def load() -> list[dict[str, Any]]:
        url = "https://www.td.gov.hk/datagovhk_td/locations-of-sec/resources/locations_of_sec.csv"
        text = _get_text(url)
        rows = list(csv.DictReader(io.StringIO(text.lstrip("\ufeff"))))
        out = []
        for i, row in enumerate(rows):
            item = _radar(
                "hong_kong_td", _first(row, "id", "camera id", default=i),
                _first(row, "latitude", "lat"), _first(row, "longitude", "lon", "lng"),
                radar_type=_first(row, "type", "camera type", default="fixed_speed"),
                direction=_first(row, "direction", "bound"), road_name=_first(row, "location", "address", "road"),
                country="HK", source_url=url, official=True, confidence=.98,
            )
            if item: out.append(item)
        return out
    return _filter_near(_cached_bulk("hong_kong_td", load), lat, lon, radius_m)


def _socrata_rows(base: str, dataset_id: str) -> list[dict[str, Any]]:
    return _get_json(f"{base}/resource/{dataset_id}.json", params={"$limit": 5000}) or []


def _coords_from_row(row: dict[str, Any]) -> tuple[Any, Any]:
    lat = _first(row, "latitude", "lat", "y_coordinate", "y")
    lon = _first(row, "longitude", "lon", "lng", "x_coordinate", "x")
    if _num(lat) is not None and _num(lon) is not None:
        return lat, lon
    for v in row.values():
        if isinstance(v, dict):
            coords = v.get("coordinates")
            if isinstance(coords, list) and len(coords) >= 2:
                return coords[1], coords[0]
            if v.get("latitude") is not None and v.get("longitude") is not None:
                return v.get("latitude"), v.get("longitude")
    return None, None


def fetch_chicago(lat: float, lon: float, radius_m: int) -> list[dict[str, Any]]:
    def load() -> list[dict[str, Any]]:
        out = []
        for dataset_id, kind in (("4i42-qv3h", "fixed_speed"), ("thvf-6diy", "red_light")):
            for i, row in enumerate(_socrata_rows("https://data.cityofchicago.org", dataset_id)):
                rlat, rlon = _coords_from_row(row)
                item = _radar(
                    "chicago_dot", _first(row, "camera_id", "id", default=f"{dataset_id}:{i}"), rlat, rlon,
                    radar_type=kind, direction=_first(row, "first_approach", "approach", "direction"),
                    road_name=_first(row, "address", "location"), city="Chicago", state="IL", country="US",
                    source_url=f"https://data.cityofchicago.org/d/{dataset_id}", official=True, confidence=.99,
                )
                if item: out.append(item)
        return out
    return _filter_near(_cached_bulk("chicago_dot", load, ttl=3 * 3600), lat, lon, radius_m)


def fetch_dc(lat: float, lon: float, radius_m: int) -> list[dict[str, Any]]:
    def load() -> list[dict[str, Any]]:
        url = "https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Public_Safety_WebMercator/MapServer/47/query"
        data = _get_json(url, params={"where": "1=1", "outFields": "*", "returnGeometry": "true", "outSR": 4326, "f": "geojson"}, timeout=min(10.0, RADAR_HTTP_TIMEOUT + 3))
        out = []
        for i, f in enumerate((data or {}).get("features") or []):
            p = f.get("properties") or {}; geom = f.get("geometry") or {}; c = geom.get("coordinates") or []
            if len(c) < 2: continue
            kind_raw = _first(p, "camera_type", "enforcement_type", "type", "violation_type")
            item = _radar(
                "dc_ddot", _first(p, "globalid", "objectid", "id", default=i), c[1], c[0], radar_type=kind_raw,
                speed_limit=_first(p, "speed_limit", "posted_speed", "speed"), direction=_first(p, "direction", "approach"),
                road_name=_first(p, "location", "address", "street"), city="Washington", state="DC", country="US",
                source_url="https://opendata.dc.gov/datasets/DCGIS::automated-safety-cameras-table", official=True, confidence=.99,
            )
            if item: out.append(item)
        return out
    return _filter_near(_cached_bulk("dc_ddot", load, ttl=2 * 3600), lat, lon, radius_m)


def fetch_ottawa(lat: float, lon: float, radius_m: int) -> list[dict[str, Any]]:
    def load() -> list[dict[str, Any]]:
        out = []
        for endpoint, kind in (("ase_camera", "fixed_speed"), ("red_light_camera", "red_light")):
            url = f"https://traffic.ottawa.ca/map/service/{endpoint}"
            data = _get_json(url)
            rows = data if isinstance(data, list) else (data.get("features") or data.get("results") or data.get("cameras") or [])
            for i, row in enumerate(rows or []):
                props = row.get("properties") if isinstance(row, dict) and isinstance(row.get("properties"), dict) else row
                geom = row.get("geometry") if isinstance(row, dict) else None
                lat_v, lon_v = _first(props or {}, "latitude", "lat"), _first(props or {}, "longitude", "lon")
                if (lat_v in (None, "") or lon_v in (None, "")) and isinstance(geom, dict):
                    coords = geom.get("coordinates") or []
                    if len(coords) >= 2: lon_v, lat_v = coords[0], coords[1]
                item = _radar(
                    "ottawa", _first(props or {}, "Id", "id", default=f"{endpoint}:{i}"), lat_v, lon_v, radar_type=kind,
                    road_name=_first(props or {}, "name", "location"), city="Ottawa", state="ON", country="CA",
                    source_url="https://traffic.ottawa.ca/en/opendata", official=True, confidence=.98,
                )
                if item: out.append(item)
        return out
    return _filter_near(_cached_bulk("ottawa", load, ttl=3 * 3600), lat, lon, radius_m)



def fetch_france(lat: float, lon: float, radius_m: int) -> list[dict[str, Any]]:
    """Open Licence dataset indexed by data.gouv.fr.

    The dataset is not as fresh as OSM, so its confidence is intentionally below
    live official feeds and it acts as an additional cross-check/cache seed.
    """
    def load() -> list[dict[str, Any]]:
        meta = _get_json("https://www.data.gouv.fr/api/1/datasets/radars-automatiques/")
        resources = meta.get("resources") or [] if isinstance(meta, dict) else []
        csv_res = [r for r in resources if str(r.get("format") or "").lower() == "csv" and str(r.get("url") or "").startswith("https://")]
        if not csv_res:
            raise RuntimeError("France radar CSV unavailable")
        csv_res.sort(key=lambda r: str(r.get("latest") or r.get("last_modified") or r.get("published") or ""), reverse=True)
        url = str(csv_res[0]["url"])
        rows = list(csv.DictReader(io.StringIO(_get_text(url, timeout=min(10.0, RADAR_HTTP_TIMEOUT + 3)).lstrip("\ufeff"))))
        out = []
        for i, row in enumerate(rows):
            item = _radar(
                "france_open_data", _first(row, "id", default=i), _first(row, "latitude", "lat"), _first(row, "longitude", "lon"),
                radar_type=_first(row, "type", default="fixed_speed"), speed_limit=_first(row, "vitesse_vehicules_legers_kmh", "vitesse", "speed"),
                direction=_first(row, "direction"), road_name=_first(row, "route", "emplacement", "location"),
                state=_first(row, "departement", "department"), country="FR",
                source_url="https://www.data.gouv.fr/datasets/radars-automatiques", official=False, confidence=.84,
            )
            if item: out.append(item)
        return out
    return _filter_near(_cached_bulk("france_open_data", load, ttl=24 * 3600), lat, lon, radius_m)


def _ckan_resource_urls(package_api: str, package_id: str, formats: tuple[str, ...] = ("csv",)) -> list[str]:
    data = _get_json(package_api, params={"id": package_id})
    resources = ((data or {}).get("result") or {}).get("resources") or []
    out = []
    for r in resources:
        fmt = str(r.get("format") or r.get("mimetype") or "").lower()
        url = str(r.get("url") or "").strip()
        if url and url.startswith("http") and any(x in fmt or url.lower().endswith("." + x) for x in formats):
            out.append(url)
    return out


def fetch_nsw(lat: float, lon: float, radius_m: int) -> list[dict[str, Any]]:
    def load() -> list[dict[str, Any]]:
        api = "https://data.nsw.gov.au/data/api/3/action/package_show"
        urls = _ckan_resource_urls(api, "2-nsw-speed-cameras", ("csv",))
        out = []
        for url in urls[:4]:
            try:
                rows = list(csv.DictReader(io.StringIO(_get_text(url, timeout=min(10.0, RADAR_HTTP_TIMEOUT + 3)).lstrip("\ufeff"))))
            except Exception:
                continue
            url_key = _key_text(url)
            default_kind = "red_light_speed" if "red" in url_key else ("mobile_zone" if "mobile" in url_key else "fixed_speed")
            for i, row in enumerate(rows):
                rlat, rlon = _coords_from_row(row)
                item = _radar(
                    "nsw_transport", _first(row, "camera id", "camera_id", "id", default=f"{url_key}:{i}"), rlat, rlon,
                    radar_type=_first(row, "camera type", "type", default=default_kind), speed_limit=_first(row, "speed limit", "speed_limit", "limit"),
                    direction=_first(row, "direction", "approach"), road_name=_first(row, "location", "address", "road"),
                    city=_first(row, "suburb", "locality", "city"), state="NSW", country="AU", source_url=url,
                    official=True, confidence=.98,
                )
                if item: out.append(item)
        if not out:
            raise RuntimeError("NSW radar resources unavailable")
        return out
    return _filter_near(_cached_bulk("nsw_transport", load, ttl=12 * 3600), lat, lon, radius_m)


def _xml_local(tag: str) -> str:
    return str(tag or "").split("}")[-1].lower()


def fetch_dgt_spain(lat: float, lon: float, radius_m: int) -> list[dict[str, Any]]:
    """DGT DATEX II fixed-radar feed, discovered through its CKAN catalogue."""
    def load() -> list[dict[str, Any]]:
        urls = _ckan_resource_urls("https://nap.dgt.es/api/3/action/package_show", "radares-fijos-dgt", ("datex2", "xml"))
        if not urls:
            meta = _get_json("https://nap.dgt.es/api/3/action/package_show", params={"id": "radares-fijos-dgt"})
            urls.extend([str(r.get("url") or "") for r in ((meta.get("result") or {}).get("resources") or []) if str(r.get("url") or "").startswith("http")])
        if not urls:
            raise RuntimeError("DGT DATEX resource unavailable")
        xml_text = _get_text(urls[0], timeout=min(12.0, RADAR_HTTP_TIMEOUT + 4))
        root = ET.fromstring(xml_text)
        parent = {child: par for par in root.iter() for child in par}
        out = []
        for i, node in enumerate(root.iter()):
            # DATEX pointCoordinates normally has direct latitude/longitude children.
            direct = {_xml_local(ch.tag): _clean_text(ch.text, 160) for ch in list(node) if _clean_text(ch.text, 160)}
            lat_v = direct.get("latitude") or direct.get("lat")
            lon_v = direct.get("longitude") or direct.get("lon")
            if _num(lat_v) is None or _num(lon_v) is None:
                continue
            vals: dict[str, list[str]] = {}
            cursor = node
            for _ in range(5):
                if cursor is None: break
                for el in list(cursor)[:40]:
                    text = _clean_text(el.text, 240)
                    if text: vals.setdefault(_xml_local(el.tag), []).append(text)
                cursor = parent.get(cursor)
            owner = cursor or node
            sid = node.attrib.get("id") or getattr(owner, "attrib", {}).get("id") or f"dgt:{i}"
            road = next((x for k, vs in vals.items() if k in {"roadnumber", "roadname", "locationdescriptor"} for x in vs), "")
            direction = next((x for k, vs in vals.items() if "direction" in k for x in vs), "")
            speed = next((x for k, vs in vals.items() if "speed" in k and "limit" in k for x in vs if _num(x) is not None), None)
            item = _radar(
                "dgt_spain", sid, lat_v, lon_v, radar_type="fixed_speed", speed_limit=speed, direction=direction,
                road_name=road, country="ES", source_url="https://nap.dgt.es/en/dataset/radares-fijos-dgt", official=True, confidence=.99,
            )
            if item: out.append(item)
        dedup = {x["geo_key"]: x for x in out}
        return list(dedup.values())
    return _filter_near(_cached_bulk("dgt_spain", load, ttl=3 * 3600), lat, lon, radius_m)

def fetch_edmonton(lat: float, lon: float, radius_m: int) -> list[dict[str, Any]]:
    def load() -> list[dict[str, Any]]:
        rows = _socrata_rows("https://data.edmonton.ca", "tdr3-fqkf")
        out = []
        for i, row in enumerate(rows):
            rlat, rlon = _coords_from_row(row)
            item = _radar(
                "edmonton_open_data", _first(row, "location_id", "zone_id", "id", default=i), rlat, rlon,
                radar_type="mobile_zone", speed_limit=_first(row, "speed_limit", "enforced_speed_limit", "limit"),
                road_name=_first(row, "location", "zone", "street"), city="Edmonton", state="AB", country="CA",
                source_url="https://data.edmonton.ca/d/tdr3-fqkf", official=True, confidence=.90,
            )
            if item: out.append(item)
        return list({x["geo_key"]: x for x in out}.values())
    return _filter_near(_cached_bulk("edmonton_open_data", load, ttl=24 * 3600), lat, lon, radius_m)


def fetch_uzbekistan_open(lat: float, lon: float, radius_m: int) -> list[dict[str, Any]]:
    def load() -> list[dict[str, Any]]:
        url = "https://raw.githubusercontent.com/muminoff/uzbspeedcameradb/main/data/cameras.json"
        data = _get_json(url)
        rows = data if isinstance(data, list) else (data.get("cameras") or data.get("data") or [])
        out = []
        for i, row in enumerate(rows or []):
            item = _radar(
                "uzbekistan_osm_dataset", _first(row, "osm_node_id", "id", default=i), _first(row, "latitude", "lat"), _first(row, "longitude", "lon"),
                radar_type=_first(row, "camera_type", "type", default="fixed_speed"), speed_limit=_first(row, "speed_limit", "maxspeed"),
                direction=_first(row, "compass_direction", "direction"), road_name=_first(row, "road_direction", "road", "name"), country="UZ",
                source_url="https://github.com/muminoff/uzbspeedcameradb", official=False, confidence=.79,
            )
            if item and item["radar_type"] != "fixed_speed" and _key_text(_first(row, "camera_type", "type")) == "alpr":
                continue
            if item: out.append(item)
        return out
    return _filter_near(_cached_bulk("uzbekistan_osm_dataset", load, ttl=24 * 3600), lat, lon, radius_m)


def _custom_sources() -> list[dict[str, Any]]:
    """Optional public/partner feeds without code changes.

    VANO_RADAR_FEEDS_JSON accepts an array of objects. Supported formats:
      {"name":"city-x","url":"https://.../feed.json","format":"json",
       "lat":"latitude","lon":"longitude","type":"type","speed":"limit",
       "id":"id","official":true,"country":"BR","bbox":[-24,-47,-23,-46]}

    This is intentionally data-only; it never executes remote code.
    """
    raw = os.environ.get("VANO_RADAR_FEEDS_JSON", "").strip()
    if not raw:
        return []
    try:
        data = json.loads(raw)
        return [x for x in data if isinstance(x, dict) and str(x.get("url") or "").startswith("https://")][:20] if isinstance(data, list) else []
    except Exception:
        return []


def fetch_custom(spec: dict[str, Any], lat: float, lon: float, radius_m: int) -> list[dict[str, Any]]:
    name = _clean_text(spec.get("name") or "custom", 48)
    url = str(spec.get("url") or "")
    fmt = str(spec.get("format") or ("csv" if url.lower().endswith(".csv") else "json")).lower()
    def load() -> list[dict[str, Any]]:
        if fmt == "csv":
            rows = list(csv.DictReader(io.StringIO(_get_text(url).lstrip("\ufeff"))))
        else:
            data = _get_json(url)
            path = [p for p in str(spec.get("path") or "").split(".") if p]
            for p in path:
                data = data.get(p, {}) if isinstance(data, dict) else []
            rows = data if isinstance(data, list) else (data.get("records") or data.get("results") or data.get("features") or [])
        out = []
        for i, row in enumerate(rows or []):
            if not isinstance(row, dict): continue
            props = row.get("properties") if isinstance(row.get("properties"), dict) else row
            geom = row.get("geometry") if isinstance(row.get("geometry"), dict) else {}
            coords = geom.get("coordinates") or []
            lat_v = _first(props, str(spec.get("lat") or "latitude"), "lat")
            lon_v = _first(props, str(spec.get("lon") or "longitude"), "lon", "lng")
            if (lat_v in (None, "") or lon_v in (None, "")) and len(coords) >= 2:
                lon_v, lat_v = coords[0], coords[1]
            item = _radar(
                name, _first(props, str(spec.get("id") or "id"), default=i), lat_v, lon_v,
                radar_type=_first(props, str(spec.get("type") or "type"), default=spec.get("default_type") or "fixed_speed"),
                speed_limit=_first(props, str(spec.get("speed") or "speed_limit"), "limit", "maxspeed"),
                direction=_first(props, str(spec.get("direction") or "direction")), road_name=_first(props, str(spec.get("road") or "road"), "address", "location"),
                city=_first(props, str(spec.get("city") or "city")), state=_first(props, str(spec.get("state") or "state")),
                country=spec.get("country") or _first(props, "country"), source_url=url, official=bool(spec.get("official")),
                confidence=float(spec.get("confidence") or (.97 if spec.get("official") else .76)),
            )
            if item: out.append(item)
        return out
    ttl = max(900, min(86400, int(spec.get("ttl_seconds") or RADAR_SOURCE_CACHE_TTL)))
    return _filter_near(_cached_bulk(f"custom:{name}", load, ttl=ttl), lat, lon, radius_m)


# bbox = (min_lat, min_lon, max_lat, max_lon). Official sources are region-gated,
# which prevents a user in São Paulo from triggering Singapore/Chicago downloads.
BUILTIN_SOURCES: list[dict[str, Any]] = [
    {"name": "openstreetmap", "bbox": None, "fetch": fetch_osm, "official": False, "ttl_h": 18},
    {"name": "antt", "bbox": (-34.0, -74.5, 5.5, -32.0), "fetch": fetch_antt, "official": True, "ttl_h": 24},
    {"name": "dgt_spain", "bbox": (35.5, -10.0, 44.5, 4.8), "fetch": fetch_dgt_spain, "official": True, "ttl_h": 8},
    {"name": "france_open_data", "bbox": (41.0, -5.8, 51.5, 10.0), "fetch": fetch_france, "official": False, "ttl_h": 48},
    {"name": "singapore_spf", "bbox": (1.15, 103.55, 1.50, 104.15), "fetch": fetch_singapore, "official": True, "ttl_h": 48},
    {"name": "taiwan_npa", "bbox": (21.7, 119.2, 25.5, 122.2), "fetch": fetch_taiwan, "official": True, "ttl_h": 12},
    {"name": "hong_kong_td", "bbox": (22.12, 113.80, 22.60, 114.50), "fetch": fetch_hong_kong, "official": True, "ttl_h": 48},
    {"name": "nsw_transport", "bbox": (-37.6, 140.8, -28.0, 154.2), "fetch": fetch_nsw, "official": True, "ttl_h": 24},
    {"name": "chicago_dot", "bbox": (41.60, -87.95, 42.10, -87.45), "fetch": fetch_chicago, "official": True, "ttl_h": 12},
    {"name": "dc_ddot", "bbox": (38.70, -77.20, 39.05, -76.85), "fetch": fetch_dc, "official": True, "ttl_h": 8},
    {"name": "ottawa", "bbox": (44.95, -76.40, 45.65, -75.20), "fetch": fetch_ottawa, "official": True, "ttl_h": 12},
    {"name": "edmonton_open_data", "bbox": (53.30, -114.0, 53.80, -113.1), "fetch": fetch_edmonton, "official": True, "ttl_h": 24},
    {"name": "uzbekistan_osm_dataset", "bbox": (37.0, 55.0, 46.0, 74.5), "fetch": fetch_uzbekistan_open, "official": False, "ttl_h": 48},
]


def _cell_key(lat: float, lon: float) -> str:
    # ~1.1 km latitude cells; remote query radius covers neighboring cells too.
    return f"{math.floor(lat * 100) / 100:.2f}:{math.floor(lon * 100) / 100:.2f}"


def _scan_row(db, cell_key: str, source: str):
    return db.execute("SELECT * FROM radar_scan_cells WHERE cell_key=? AND source=?", (cell_key, source)).fetchone()


def _source_due(db, cell_key: str, source: dict[str, Any]) -> bool:
    row = _scan_row(db, cell_key, source["name"])
    if not row:
        return True
    success = _parse_iso(row.get("last_success_at") if isinstance(row, dict) else row["last_success_at"])
    attempt = _parse_iso(row.get("last_attempt_at") if isinstance(row, dict) else row["last_attempt_at"])
    now = _utcnow()
    ttl_h = max(1, int(source.get("ttl_h") or RADAR_CELL_TTL_HOURS))
    if success and now - success < timedelta(hours=ttl_h):
        return False
    if not success and attempt and now - attempt < timedelta(minutes=RADAR_FAILURE_RETRY_MIN):
        return False
    return True


def _mark_scan(db, cell_key: str, source: str, *, ok: bool, count: int = 0, error: str = "") -> None:
    now = _iso()
    db.execute(
        """INSERT INTO radar_scan_cells(cell_key,source,last_attempt_at,last_success_at,last_error,item_count)
           VALUES(?,?,?,?,?,?)
           ON CONFLICT(cell_key,source) DO UPDATE SET
             last_attempt_at=EXCLUDED.last_attempt_at,
             last_success_at=CASE WHEN EXCLUDED.last_success_at<>'' THEN EXCLUDED.last_success_at ELSE radar_scan_cells.last_success_at END,
             last_error=EXCLUDED.last_error,item_count=EXCLUDED.item_count""",
        (cell_key, source, now, now if ok else "", _clean_text(error, 240), int(count)),
    )


def upsert_radars(db, items: list[dict[str, Any]]) -> int:
    if not items:
        return 0
    now = _iso()
    stored = 0
    sql = """INSERT INTO radar_points(
                geo_key,radar_type,latitude,longitude,speed_limit,direction,road_name,city,state,country,
                source,source_id,source_url,official,confidence,active,metadata_json,first_seen_at,last_seen_at,last_verified_at,seen_count
             ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)
             ON CONFLICT(geo_key) DO UPDATE SET
                speed_limit=COALESCE(EXCLUDED.speed_limit,radar_points.speed_limit),
                direction=CASE WHEN EXCLUDED.direction<>'' THEN EXCLUDED.direction ELSE radar_points.direction END,
                road_name=CASE WHEN EXCLUDED.road_name<>'' THEN EXCLUDED.road_name ELSE radar_points.road_name END,
                city=CASE WHEN EXCLUDED.city<>'' THEN EXCLUDED.city ELSE radar_points.city END,
                state=CASE WHEN EXCLUDED.state<>'' THEN EXCLUDED.state ELSE radar_points.state END,
                country=CASE WHEN EXCLUDED.country<>'' THEN EXCLUDED.country ELSE radar_points.country END,
                source=CASE WHEN EXCLUDED.confidence>=radar_points.confidence THEN EXCLUDED.source ELSE radar_points.source END,
                source_id=CASE WHEN EXCLUDED.confidence>=radar_points.confidence THEN EXCLUDED.source_id ELSE radar_points.source_id END,
                source_url=CASE WHEN EXCLUDED.confidence>=radar_points.confidence THEN EXCLUDED.source_url ELSE radar_points.source_url END,
                official=GREATEST(radar_points.official,EXCLUDED.official),
                confidence=GREATEST(radar_points.confidence,EXCLUDED.confidence),
                active=GREATEST(radar_points.active,EXCLUDED.active),
                metadata_json=CASE WHEN EXCLUDED.confidence>=radar_points.confidence THEN EXCLUDED.metadata_json ELSE radar_points.metadata_json END,
                last_seen_at=EXCLUDED.last_seen_at,
                last_verified_at=CASE WHEN EXCLUDED.official=1 THEN EXCLUDED.last_verified_at ELSE radar_points.last_verified_at END,
                seen_count=radar_points.seen_count+1"""
    for item in items[:3000]:
        db.execute(sql, (
            item["geo_key"], item["radar_type"], float(item["lat"]), float(item["lon"]), item.get("speed_limit"),
            item.get("direction", ""), item.get("road_name", ""), item.get("city", ""), item.get("state", ""), item.get("country", ""),
            item.get("source", ""), item.get("source_id", ""), item.get("source_url", ""), 1 if item.get("official") else 0,
            float(item.get("confidence") or .7), 1 if item.get("active", True) else 0,
            json.dumps(item.get("metadata") or {}, ensure_ascii=False, separators=(",", ":"))[:3000], now, now,
            now if item.get("official") else "",
        ))
        stored += 1
    return stored



def persist_osm_awareness(db, items: list[dict[str, Any]]) -> int:
    """Persist speed-camera records already returned by VANO's shared Overpass scan.

    This avoids making a second Overpass request just for radars.
    """
    normalized = []
    for raw in items or []:
        if str(raw.get("type") or "") != "speed_camera":
            continue
        item = _radar(
            "openstreetmap", raw.get("id") or raw.get("source_id") or "",
            raw.get("lat"), raw.get("lon"), radar_type=raw.get("radar_type") or "fixed_speed",
            speed_limit=raw.get("maxspeed") or raw.get("speed_limit"), direction=raw.get("direction") or "",
            road_name=raw.get("road_name") or "", source_url="https://www.openstreetmap.org/copyright",
            official=False, confidence=.78,
        )
        if item: normalized.append(item)
    stored = upsert_radars(db, normalized)
    if normalized:
        db.commit()
    return stored


def query_radars(db, lat: float, lon: float, radius_m: int, limit: int = RADAR_MAX_RETURN) -> list[dict[str, Any]]:
    radius = max(250, min(RADAR_MAX_RADIUS_M, int(radius_m)))
    dlat = radius / 110540.0
    dlon = radius / max(25000.0, 111320.0 * math.cos(math.radians(lat)))
    rows = db.execute(
        """SELECT id,radar_type,latitude,longitude,speed_limit,direction,road_name,city,state,country,
                  source,source_id,source_url,official,confidence,last_seen_at
           FROM radar_points
           WHERE active=1 AND latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?
           ORDER BY official DESC, confidence DESC, last_seen_at DESC LIMIT ?""",
        (lat - dlat, lat + dlat, lon - dlon, lon + dlon, max(limit * 3, 120)),
    ).fetchall()
    out = []
    for row in rows:
        d = _haversine_m(lat, lon, float(row["latitude"]), float(row["longitude"]))
        if d > radius:
            continue
        kind = str(row["radar_type"] or "fixed_speed")
        out.append({
            "id": f"vano-radar-{row['id']}", "type": "speed_camera", "radar_type": kind,
            "label": _label_for_type(kind), "lat": float(row["latitude"]), "lon": float(row["longitude"]),
            "maxspeed": str(row["speed_limit"] or ""), "speed_limit": row["speed_limit"],
            "direction": row["direction"] or "", "road_name": row["road_name"] or "",
            "city": row["city"] or "", "state": row["state"] or "", "country": row["country"] or "",
            "source": row["source"] or "vano-radar-db", "source_id": row["source_id"] or "",
            "source_url": row["source_url"] or "", "official": bool(row["official"]),
            "confidence": round(float(row["confidence"] or 0), 2), "distance_m": round(d),
            "last_seen_at": row["last_seen_at"], "cached": True,
        })
    out.sort(key=lambda x: (x["distance_m"], -int(x["official"]), -x["confidence"]))
    return out[:limit]


def _eligible_sources(lat: float, lon: float) -> list[dict[str, Any]]:
    enabled = []
    disabled = {x.strip().lower() for x in os.environ.get("VANO_RADAR_DISABLED_SOURCES", "").split(",") if x.strip()}
    for src in BUILTIN_SOURCES:
        if src["name"].lower() not in disabled and _bbox_contains(src.get("bbox"), lat, lon):
            enabled.append(src)
    for spec in _custom_sources():
        bbox_raw = spec.get("bbox")
        bbox = tuple(float(x) for x in bbox_raw) if isinstance(bbox_raw, list) and len(bbox_raw) == 4 else None
        if _bbox_contains(bbox, lat, lon):
            enabled.append({"name": _clean_text(spec.get("name") or "custom", 48), "bbox": bbox, "fetch": lambda la, lo, ra, s=spec: fetch_custom(s, la, lo, ra), "official": bool(spec.get("official")), "ttl_h": max(1, int(spec.get("cell_ttl_hours") or 24))})
    return enabled


def discover_radars(db, lat: float, lon: float, radius_m: int, skip_source_names: set[str] | None = None) -> dict[str, Any]:
    """Return nearby radars, using DB first and remote feeds only for stale cells."""
    radius = max(300, min(RADAR_MAX_RADIUS_M, int(radius_m)))
    if not RADAR_ENABLED:
        return {"items": [], "stored": 0, "queried_sources": [], "cache_only": True}

    existing = query_radars(db, lat, lon, radius)
    if not RADAR_REMOTE_ENABLED:
        return {"items": existing, "stored": 0, "queried_sources": [], "cache_only": True}

    cell = _cell_key(lat, lon)
    skip = {str(x).lower() for x in (skip_source_names or set())}
    due = [s for s in _eligible_sources(lat, lon) if s["name"].lower() not in skip and _source_due(db, cell, s)]
    if not due:
        return {"items": existing, "stored": 0, "queried_sources": [], "cache_only": True}

    # Worldwide OSM + at most the small number of official sources that overlap
    # this coordinate are fetched concurrently. Normal use is 1-2 HTTP calls.
    fetched: list[dict[str, Any]] = []
    queried: list[str] = []
    errors: dict[str, str] = {}
    workers = min(3, max(1, len(due)))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(s["fetch"], lat, lon, radius): s for s in due[:4]}
        for future in as_completed(futures):
            src = futures[future]
            name = src["name"]
            queried.append(name)
            try:
                items = future.result() or []
                fetched.extend(items)
                _mark_scan(db, cell, name, ok=True, count=len(items))
            except Exception as exc:
                errors[name] = type(exc).__name__
                _mark_scan(db, cell, name, ok=False, error=f"{type(exc).__name__}: {exc}")
    stored = upsert_radars(db, fetched)
    db.commit()
    items = query_radars(db, lat, lon, radius)
    return {"items": items, "stored": stored, "queried_sources": queried, "errors": errors, "cache_only": False}


def source_catalog(lat: float | None = None, lon: float | None = None) -> list[dict[str, Any]]:
    out = []
    for src in BUILTIN_SOURCES:
        out.append({
            "name": src["name"], "official": bool(src.get("official")),
            "eligible": True if lat is None or lon is None else _bbox_contains(src.get("bbox"), float(lat), float(lon)),
            "cell_ttl_hours": int(src.get("ttl_h") or RADAR_CELL_TTL_HOURS),
        })
    for spec in _custom_sources():
        out.append({"name": _clean_text(spec.get("name") or "custom", 48), "official": bool(spec.get("official")), "eligible": True, "custom": True})
    return out
