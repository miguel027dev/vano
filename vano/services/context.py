"""VANO weather, road context, events and support points.

Extracted from the historical monolithic app.py without changing route bodies or
business rules. Runtime dependencies are injected once during application startup.
"""
from vano.bootstrap import inject as _vano_inject
_vano_inject(globals())
del _vano_inject

def weather_risk_summary(current):
    """Converte condições meteorológicas em contexto de condução, sem alegar precisão de rua."""
    current = current or {}
    precip = max(float(current.get("precipitation") or 0), float(current.get("rain") or 0), float(current.get("showers") or 0))
    visibility = float(current.get("visibility") or 10000)
    gust = float(current.get("wind_gusts_10m") or 0)
    wind = float(current.get("wind_speed_10m") or 0)
    code = int(current.get("weather_code") or 0)
    risk = 0.0
    reasons = []
    if precip >= 8:
        risk += 45; reasons.append("chuva muito forte")
    elif precip >= 3:
        risk += 32; reasons.append("chuva forte")
    elif precip >= 0.8:
        risk += 20; reasons.append("pista possivelmente molhada")
    elif precip > 0:
        risk += 9; reasons.append("chuva leve")
    if visibility < 1200:
        risk += 34; reasons.append("visibilidade muito baixa")
    elif visibility < 3000:
        risk += 22; reasons.append("visibilidade reduzida")
    elif visibility < 6000:
        risk += 10; reasons.append("visibilidade moderada")
    if gust >= 70:
        risk += 28; reasons.append("rajadas muito fortes")
    elif gust >= 50:
        risk += 18; reasons.append("rajadas fortes")
    elif wind >= 40:
        risk += 10; reasons.append("vento forte")
    if code in {95, 96, 99}:
        risk += 26; reasons.append("trovoadas")
    elif code in {80, 81, 82}:
        risk += 12
    risk = round(clamp(risk, 0, 100), 1)
    level = "normal" if risk < 15 else "atenção" if risk < 38 else "elevado" if risk < 65 else "alto"
    return {"risk_score": risk, "risk_level": level, "reasons": reasons[:4]}


def open_meteo_current(lat, lon):
    """Condições atuais sem chave via Open-Meteo; falha silenciosamente para não quebrar navegação."""
    lat, lon = float(lat), float(lon)
    key = (round(lat, 2), round(lon, 2))
    now = time.time()
    with WEATHER_LOCK:
        cached = WEATHER_CACHE.get(key)
        if cached and now - cached[0] < 900:
            return cached[1]
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": "temperature_2m,precipitation,rain,showers,weather_code,visibility,wind_speed_10m,wind_gusts_10m,is_day",
        "timezone": "auto",
        "forecast_days": 1,
    }
    try:
        r = requests.get(OPEN_METEO_URL, params=params, headers={"User-Agent": "VANO MAPS/5.0 live-road"}, timeout=8)
        r.raise_for_status()
        data = r.json() or {}
        cur = data.get("current") or {}
        summary = weather_risk_summary(cur)
        result = {
            "available": True,
            "source": "open-meteo",
            "time": cur.get("time"),
            "temperature_c": cur.get("temperature_2m"),
            "precipitation_mm": cur.get("precipitation"),
            "rain_mm": cur.get("rain"),
            "showers_mm": cur.get("showers"),
            "visibility_m": cur.get("visibility"),
            "wind_kmh": cur.get("wind_speed_10m"),
            "gust_kmh": cur.get("wind_gusts_10m"),
            "weather_code": cur.get("weather_code"),
            "is_day": cur.get("is_day"),
            **summary,
        }
    except Exception:
        result = {"available": False, "source": "open-meteo", "risk_score": 0, "risk_level": "indisponível", "reasons": []}
    with WEATHER_LOCK:
        WEATHER_CACHE[key] = (now, result)
        if len(WEATHER_CACHE) > 600:
            stale = sorted(WEATHER_CACHE.items(), key=lambda kv: kv[1][0])[:150]
            for k, _ in stale:
                WEATHER_CACHE.pop(k, None)
    return result


def _element_center(el):
    lat_v, lon_v = el.get("lat"), el.get("lon")
    if lat_v is None or lon_v is None:
        c = el.get("center") or {}
        lat_v, lon_v = c.get("lat"), c.get("lon")
    try:
        return float(lat_v), float(lon_v)
    except (TypeError, ValueError):
        return None


def overpass_live_road_context(lat, lon, radius=850):
    """Consulta periodicamente obstáculos e atributos viários mapeados no OpenStreetMap."""
    radius = int(clamp(radius, 350, 1300))
    key = (round(float(lat), 3), round(float(lon), 3), int(radius / 200) * 200)
    now = time.time()
    with LIVE_CONTEXT_LOCK:
        cached = LIVE_CONTEXT_CACHE.get(key)
        if cached and now - cached[0] < 240:
            return cached[1]
    q = f'''[out:json][timeout:9];
(
  nwr(around:{radius},{float(lat):.6f},{float(lon):.6f})["highway"="construction"];
  nwr(around:{radius},{float(lat):.6f},{float(lon):.6f})["construction"];
  nwr(around:{radius},{float(lat):.6f},{float(lon):.6f})["barrier"];
  nwr(around:{radius},{float(lat):.6f},{float(lon):.6f})["traffic_calming"];
  nwr(around:{radius},{float(lat):.6f},{float(lon):.6f})["smoothness"~"^(bad|very_bad|horrible|very_horrible|impassable)$"];
  nwr(around:{radius},{float(lat):.6f},{float(lon):.6f})["surface"~"^(unpaved|gravel|fine_gravel|dirt|earth|ground|sand|mud|cobblestone|sett)$"];
  nwr(around:{radius},{float(lat):.6f},{float(lon):.6f})["lit"="no"];
  nwr(around:{radius},{float(lat):.6f},{float(lon):.6f})["ford"];
  nwr(around:{radius},{float(lat):.6f},{float(lon):.6f})["flood_prone"="yes"];
  nwr(around:{radius},{float(lat):.6f},{float(lon):.6f})["hazard"];
);
out center tags 140;'''
    try:
        r = requests.post(OVERPASS_URL, data={"data": q}, headers={"User-Agent": "VANO MAPS/5.0 live-road-context"}, timeout=11)
        r.raise_for_status()
        elements = (r.json() or {}).get("elements") or []
    except Exception:
        elements = []
    items, seen = [], set()
    for el in elements:
        center = _element_center(el)
        if not center:
            continue
        elat, elon = center
        tags = el.get("tags") or {}
        highway = str(tags.get("highway") or "")
        surface = str(tags.get("surface") or "")
        smooth = str(tags.get("smoothness") or "")
        barrier = str(tags.get("barrier") or "")
        calming = str(tags.get("traffic_calming") or "")
        kind = label = None
        severity = 2
        avoid = False
        if highway == "construction" or tags.get("construction"):
            kind, label, severity, avoid = "roadwork", "Obra viária mapeada", 4, True
        elif barrier and barrier not in {"kerb", "bollard", "cycle_barrier"}:
            kind, label, severity, avoid = "barrier", "Barreira/obstáculo mapeado", 4, True
        elif smooth in {"very_bad", "horrible", "very_horrible", "impassable"}:
            kind, label, severity = "rough_road", "Pavimento muito irregular", 4
        elif smooth == "bad":
            kind, label, severity = "rough_road", "Pavimento irregular", 3
        elif surface in {"mud", "sand", "dirt", "earth", "ground", "gravel", "fine_gravel", "unpaved", "cobblestone", "sett"}:
            kind, label, severity = "surface", f"Piso {surface.replace('_',' ')}", 2
        elif tags.get("flood_prone") == "yes" or tags.get("ford") is not None:
            kind, label, severity = "water_risk", "Trecho com água/alagamento mapeado", 4
        elif tags.get("hazard"):
            kind, label, severity = "hazard", "Perigo viário mapeado", 3
        elif tags.get("lit") == "no":
            kind, label, severity = "unlit", "Trecho sem iluminação mapeada", 2
        elif calming:
            kind, label, severity = "traffic_calming", "Redutor de velocidade", 1
        if not kind:
            continue
        k = (kind, round(elat, 5), round(elon, 5))
        if k in seen:
            continue
        seen.add(k)
        items.append({
            "id": f"osm-{el.get('type','x')}-{el.get('id','')}", "type": kind, "label": label,
            "lat": elat, "lon": elon, "severity": severity, "avoid_candidate": avoid,
            "source": "openstreetmap", "freshness": "mapped", "name": str(tags.get("name") or "")[:100],
        })
    result = items[:120]
    with LIVE_CONTEXT_LOCK:
        LIVE_CONTEXT_CACHE[key] = (now, result)
        if len(LIVE_CONTEXT_CACHE) > 650:
            stale = sorted(LIVE_CONTEXT_CACHE.items(), key=lambda kv: kv[1][0])[:160]
            for k, _ in stale:
                LIVE_CONTEXT_CACHE.pop(k, None)
    return result


def flow_source_hash():
    nonce = session.get("flow_probe_nonce")
    if not nonce:
        nonce = secrets.token_urlsafe(16)
        session["flow_probe_nonce"] = nonce
    return hmac.new(SECRET_KEY.encode("utf-8"), str(nonce).encode("utf-8"), hashlib.sha256).hexdigest()[:20]


def quantize_flow_cell(lat, lon, cell_deg=0.0022):
    return round(round(float(lat) / cell_deg) * cell_deg, 5), round(round(float(lon) / cell_deg) * cell_deg, 5)


_FLOW_PRUNE_LOCK = threading.Lock()
_FLOW_PRUNE_LAST = 0.0
_FLOW_PRUNE_INTERVAL = max(120, min(1800, int(os.environ.get("VANO_FLOW_PRUNE_INTERVAL", "600"))))
_FLOW_QUERY_CACHE = {}
_FLOW_QUERY_CACHE_LOCK = threading.Lock()
_FLOW_QUERY_CACHE_TTL = max(3, min(30, int(os.environ.get("VANO_FLOW_QUERY_TTL", "8"))))

def prune_flow_samples(db=None, force=False):
    global _FLOW_PRUNE_LAST
    now_ts=time.time()
    with _FLOW_PRUNE_LOCK:
        if not force and now_ts-_FLOW_PRUNE_LAST < _FLOW_PRUNE_INTERVAL:
            return False
        _FLOW_PRUNE_LAST=now_ts
    db = db or get_db()
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=45)).replace(microsecond=0).isoformat()
    db.execute("DELETE FROM flow_samples WHERE created_at < ?", (cutoff,))
    return True


def store_flow_probe(lat, lon, speed_kmh, heading=None):
    db = get_db()
    prune_flow_samples(db)
    cell_lat, cell_lon = quantize_flow_cell(lat, lon)
    try:
        heading_v = float(heading) if heading is not None else 0.0
    except (TypeError, ValueError):
        heading_v = 0.0
    hb = int((heading_v % 360) // 45) * 45
    src = flow_source_hash()
    now = utcnow_iso()
    recent_cutoff = (datetime.now(timezone.utc) - timedelta(seconds=24)).replace(microsecond=0).isoformat()
    exists = db.execute("SELECT 1 FROM flow_samples WHERE source_hash=? AND cell_lat=? AND cell_lon=? AND created_at>=? LIMIT 1", (src, cell_lat, cell_lon, recent_cutoff)).fetchone()
    if not exists:
        db.execute("INSERT INTO flow_samples(cell_lat,cell_lon,direction_bucket,speed_kmh,source_hash,created_at) VALUES(?,?,?,?,?,?)", (cell_lat, cell_lon, hb, clamp(float(speed_kmh), 0, 160), src, now))
        db.commit()
    return cell_lat, cell_lon


def query_live_flow(lat, lon, radius=2400):
    key=(round(float(lat),3),round(float(lon),3),int(float(radius)//400)*400)
    now_ts=time.time()
    with _FLOW_QUERY_CACHE_LOCK:
        item=_FLOW_QUERY_CACHE.get(key)
        if item and now_ts-item[0]<_FLOW_QUERY_CACHE_TTL:
            return copy.deepcopy(item[1])
    db = get_db()
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=20)).replace(microsecond=0).isoformat()
    deg_lat = float(radius) / 110540.0
    deg_lon = float(radius) / max(25000.0, 111320.0 * math.cos(math.radians(float(lat))))
    rows = db.execute('''
        SELECT cell_lat,cell_lon,direction_bucket,AVG(speed_kmh) avg_speed,COUNT(*) samples,COUNT(DISTINCT source_hash) sources,MAX(created_at) updated_at
        FROM flow_samples
        WHERE created_at>=? AND cell_lat BETWEEN ? AND ? AND cell_lon BETWEEN ? AND ?
        GROUP BY cell_lat,cell_lon,direction_bucket
        HAVING COUNT(DISTINCT source_hash) >= 3
        ORDER BY updated_at DESC LIMIT 120
    ''', (cutoff, float(lat)-deg_lat, float(lat)+deg_lat, float(lon)-deg_lon, float(lon)+deg_lon)).fetchall()
    out = []
    for row in rows:
        speed = float(row["avg_speed"] or 0)
        if speed < 8: level, score = "parado", 92
        elif speed < 18: level, score = "lento", 72
        elif speed < 32: level, score = "moderado", 48
        else: level, score = "fluindo", 18
        out.append({
            "lat": row["cell_lat"], "lon": row["cell_lon"], "direction": row["direction_bucket"],
            "avg_speed_kmh": round(speed, 1), "samples": int(row["samples"]), "sources": int(row["sources"]),
            "traffic_level": level, "traffic_score": score, "updated_at": row["updated_at"], "source": "vano-live-flow",
        })
    with _FLOW_QUERY_CACHE_LOCK:
        _FLOW_QUERY_CACHE[key]=(now_ts,copy.deepcopy(out))
        if len(_FLOW_QUERY_CACHE)>180:
            for k,_ in sorted(_FLOW_QUERY_CACHE.items(),key=lambda kv:kv[1][0])[:50]:_FLOW_QUERY_CACHE.pop(k,None)
    return out


def community_context(lat, lon, radius=1800):
    dlat = radius / 110540.0
    dlon = radius / max(25000.0, 111320.0 * math.cos(math.radians(float(lat))))
    rows = get_active_reports_for_bounds(float(lat)-dlat, float(lon)-dlon, float(lat)+dlat, float(lon)+dlon)
    items = []
    for r in rows:
        d = haversine_m(float(lat), float(lon), float(r["latitude"]), float(r["longitude"]))
        if d > radius:
            continue
        items.append({
            "id": f"report-{r['id']}", "type": str(r["category"]), "label": str(r["title"]),
            "lat": float(r["latitude"]), "lon": float(r["longitude"]), "severity": int(r["severity"]),
            "confirmations": int(r["confirmations"] or 0), "created_at": r["created_at"],
            "distance_m": round(d), "source": "vano-community", "freshness": "community-live",
        })
    return sorted(items, key=lambda x: (x["distance_m"], -x["severity"]))[:80]

def overpass_road_awareness(lat, lon, radius=320):
    radius = int(clamp(radius, 250, 5000))
    cache_key = (round(float(lat), 2), round(float(lon), 2), int(radius / 250) * 250)
    now = time.time()
    with ROAD_AWARENESS_LOCK:
        cached = ROAD_AWARENESS_CACHE.get(cache_key)
        if cached and now - cached[0] < 180:
            return cached[1]
    query = f"""[out:json][timeout:13];
(
  node(around:{radius},{float(lat):.6f},{float(lon):.6f})[\"highway\"=\"traffic_signals\"];
  node(around:{radius},{float(lat):.6f},{float(lon):.6f})[\"highway\"=\"stop\"];
  node(around:{radius},{float(lat):.6f},{float(lon):.6f})[\"highway\"=\"give_way\"];
  node(around:{radius},{float(lat):.6f},{float(lon):.6f})[\"traffic_sign\"];
  node(around:{radius},{float(lat):.6f},{float(lon):.6f})[\"highway\"=\"speed_camera\"];
  nwr(around:{radius},{float(lat):.6f},{float(lon):.6f})[\"enforcement\"~\"^(maxspeed|speed)$\"];
);
out center tags 3000;"""
    try:
        response = requests.post(OVERPASS_URL, data={"data": query}, headers={"User-Agent": "VANO MAPS/5.0 road-awareness"}, timeout=15)
        response.raise_for_status()
        data = response.json()
    except Exception:
        return []
    items, seen = [], set()
    for el in data.get("elements", []) or []:
        center = _element_center(el)
        if not center:
            continue
        elat, elon = center
        tags = el.get("tags") or {}
        highway = str(tags.get("highway") or "")
        enforcement = str(tags.get("enforcement") or "").lower()
        if highway == "speed_camera" or enforcement in {"maxspeed", "speed"}: kind, label = "speed_camera", "Radar de velocidade"
        elif highway == "traffic_signals": kind, label = "traffic_signal", "Semáforo"
        elif highway == "stop": kind, label = "stop_sign", "Parada obrigatória"
        elif highway == "give_way": kind, label = "yield_sign", "Dê a preferência"
        elif tags.get("traffic_sign"): kind, label = "traffic_sign", "Sinalização viária"
        else: continue
        key = (kind, round(float(elat), 6), round(float(elon), 6))
        if key in seen: continue
        seen.add(key)
        items.append({
            "id": str(el.get("id", "")), "type": kind, "label": label,
            "lat": float(elat), "lon": float(elon), "source": "openstreetmap",
            "maxspeed": str(tags.get("maxspeed") or tags.get("maxspeed:forward") or "")[:20],
        })
    with ROAD_AWARENESS_LOCK:
        ROAD_AWARENESS_CACHE[cache_key] = (now, items)
        if len(ROAD_AWARENESS_CACHE) > 800:
            stale = sorted(ROAD_AWARENESS_CACHE.items(), key=lambda kv: kv[1][0])[:200]
            for key, _ in stale: ROAD_AWARENESS_CACHE.pop(key, None)
    return items

def _overpass_query_json(query, timeout=10):
    """Consulta Overpass com failover curto para reduzir falsos 'nenhum resultado'."""
    endpoints = []
    for url in [OVERPASS_URL, "https://overpass.kumi.systems/api/interpreter", "https://overpass-api.de/api/interpreter"]:
        url = str(url or "").strip()
        if url and url not in endpoints:
            endpoints.append(url)
    last_error = None
    for url in endpoints[:2]:
        try:
            response = requests.post(
                url, data={"data": query},
                headers={"User-Agent": "VANO MAPS/6.4 nearby-data"}, timeout=max(5, int(timeout)),
            )
            response.raise_for_status()
            payload = response.json() or {}
            if isinstance(payload.get("elements"), list):
                return payload
        except Exception as exc:
            last_error = exc
    if last_error:
        app.logger.debug("Overpass indisponível: %s", last_error)
    return {"elements": []}


# V231 — canonical road snap for community alerts.
_ALERT_ROAD_SEGMENT_CACHE = {}
_ALERT_ROAD_SEGMENT_LOCK = threading.Lock()
_ALERT_ROAD_SEGMENT_TTL = 10 * 60
_ALERT_ROAD_TYPES = {
    "motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link",
    "secondary", "secondary_link", "tertiary", "tertiary_link", "residential",
    "unclassified", "living_street", "service", "road",
}

def _alert_segment_cache_key(lat, lon, radius):
    return (round(float(lat), 3), round(float(lon), 3), int(radius))

def _alert_road_segments(lat, lon, radius=450):
    radius = max(80, min(1200, int(radius or 450)))
    key = _alert_segment_cache_key(lat, lon, radius)
    now = time.time()
    with _ALERT_ROAD_SEGMENT_LOCK:
        cached = _ALERT_ROAD_SEGMENT_CACHE.get(key)
        if cached and now - cached[0] < _ALERT_ROAD_SEGMENT_TTL:
            return cached[1]
    highway_rx = "|".join(sorted(_ALERT_ROAD_TYPES))
    query = (f'[out:json][timeout:8];way(around:{radius},{float(lat):.7f},{float(lon):.7f})'
             f'["highway"~"^({highway_rx})$"];out tags geom;')
    data = _overpass_query_json(query, timeout=9)
    segments = []
    for el in data.get("elements", []) or []:
        tags = el.get("tags") or {}
        highway = str(tags.get("highway") or "").strip()
        if highway not in _ALERT_ROAD_TYPES:
            continue
        name = str(tags.get("name") or tags.get("ref") or "").strip()[:140]
        clean = []
        for pt in el.get("geometry") or []:
            try:
                plat, plon = float(pt.get("lat")), float(pt.get("lon"))
            except Exception:
                continue
            if -90 <= plat <= 90 and -180 <= plon <= 180:
                clean.append((plat, plon))
        for a, b in zip(clean, clean[1:]):
            segments.append((a[0], a[1], b[0], b[1], name, highway, str(el.get("id") or "")))
    with _ALERT_ROAD_SEGMENT_LOCK:
        _ALERT_ROAD_SEGMENT_CACHE[key] = (now, segments)
        if len(_ALERT_ROAD_SEGMENT_CACHE) > 900:
            for stale_key, _ in sorted(_ALERT_ROAD_SEGMENT_CACHE.items(), key=lambda kv: kv[1][0])[:180]:
                _ALERT_ROAD_SEGMENT_CACHE.pop(stale_key, None)
    return segments

def _project_point_to_road_segment(lat, lon, segment):
    alat, alon, blat, blon, name, highway, way_id = segment
    scale_x = 111320.0 * max(0.2, math.cos(math.radians(float(lat))))
    scale_y = 110540.0
    ax, ay = (alon - lon) * scale_x, (alat - lat) * scale_y
    bx, by = (blon - lon) * scale_x, (blat - lat) * scale_y
    vx, vy = bx - ax, by - ay
    denom = vx * vx + vy * vy
    t = 0.0 if denom <= 1e-9 else max(0.0, min(1.0, -(ax * vx + ay * vy) / denom))
    px, py = ax + t * vx, ay + t * vy
    return {
        "lat": float(lat) + py / scale_y,
        "lon": float(lon) + px / scale_x,
        "distance_m": float(math.hypot(px, py)),
        "road_name": name, "highway": highway, "osm_way_id": way_id,
    }

def snap_alert_to_nearest_road(lat, lon, *, max_radius=1200):
    try:
        lat, lon = float(lat), float(lon)
    except Exception:
        return None
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None
    best = None
    seen = set()
    for radius in [180, 420, 850, max(850, min(1200, int(max_radius or 1200)))]:
        if radius in seen:
            continue
        seen.add(radius)
        for seg in _alert_road_segments(lat, lon, radius):
            hit = _project_point_to_road_segment(lat, lon, seg)
            if best is None or hit["distance_m"] < best["distance_m"]:
                best = hit
        if best is not None and best["distance_m"] <= min(95.0, radius * 0.55):
            break
    if best is None or best["distance_m"] > float(max_radius):
        return None
    best["source"] = "openstreetmap-road-snap"
    return best

def _row_value(row, key, default=None):
    try:
        return row[key]
    except Exception:
        try:
            return row.get(key, default)
        except Exception:
            return default

def _resnap_visible_report_rows(rows, limit=8):
    db = get_db()
    updates = {}
    changed = 0
    for row in rows:
        if changed >= max(0, int(limit or 0)):
            break
        try:
            if int(_row_value(row, "road_snapped", 0) or 0) == 1:
                continue
            rid = int(row["id"]); lat = float(row["latitude"]); lon = float(row["longitude"])
        except Exception:
            continue
        hit = snap_alert_to_nearest_road(lat, lon)
        if not hit:
            continue
        db.execute("UPDATE reports SET latitude=?,longitude=?,road_snapped=1,snap_distance_m=?,road_name=? WHERE id=?",
                   (hit["lat"], hit["lon"], round(hit["distance_m"], 1), hit.get("road_name") or "", rid))
        updates[rid] = hit
        changed += 1
    if changed:
        db.commit(); invalidate_route_context("reports")
    return updates



# -----------------------------------------------------------------------------
# V164 — Event Pressure Engine
# -----------------------------------------------------------------------------
_EVENT_VENUE_CACHE = {}
_EVENT_VENUE_CACHE_LOCK = threading.Lock()
_EVENT_VENUE_CACHE_TTL = 12 * 60
_EVENT_FEED_CACHE = {"ts": 0.0, "items": []}
_EVENT_FEED_LOCK = threading.Lock()
_MATCH_SCHEDULE_CACHE = {"ts": 0.0, "items": []}
_MATCH_SCHEDULE_LOCK = threading.Lock()


def _event_bounds_from_geometry(coords, pad=.014):
    clean = [(float(c[0]), float(c[1])) for c in (coords or []) if len(c) >= 2]
    if not clean:
        return None
    lons = [x[0] for x in clean]; lats = [x[1] for x in clean]
    return min(lats)-pad, min(lons)-pad, max(lats)+pad, max(lons)+pad


def _event_bounds_key(bounds):
    if not bounds:
        return None
    a,b,c,d = bounds
    return tuple(round(float(x), 2) for x in (a,b,c,d))


def _event_element_center(el):
    try:
        lat = el.get("lat"); lon = el.get("lon")
        if lat is None or lon is None:
            center = el.get("center") or {}
            lat, lon = center.get("lat"), center.get("lon")
        lat, lon = float(lat), float(lon)
        if -90 <= lat <= 90 and -180 <= lon <= 180:
            return lat, lon
    except Exception:
        pass
    return None


def event_venues_for_bounds(bounds):
    """Discover large places where games/shows can materially change traffic.

    This is venue discovery, not an assertion that an event is happening. A venue
    only becomes an active disruption when live traffic, recent crowd/road reports
    or an optional configured event feed corroborates it.
    """
    if not VANO_EVENT_INTELLIGENCE_ENABLED or not bounds:
        return []
    min_lat,min_lon,max_lat,max_lon = [float(x) for x in bounds]
    if max_lat <= min_lat or max_lon <= min_lon:
        return []
    if max_lat-min_lat > .85 or max_lon-min_lon > .85:
        return []
    key = _event_bounds_key(bounds); now = time.time()
    with _EVENT_VENUE_CACHE_LOCK:
        row = _EVENT_VENUE_CACHE.get(key)
        if row and now-row[0] < _EVENT_VENUE_CACHE_TTL:
            return copy.deepcopy(row[1])
    bbox=f"{min_lat:.6f},{min_lon:.6f},{max_lat:.6f},{max_lon:.6f}"
    q=f"""[out:json][timeout:7];
(
  nwr({bbox})[\"leisure\"=\"stadium\"];
  nwr({bbox})[\"building\"=\"stadium\"];
  nwr({bbox})[\"amenity\"=\"events_venue\"];
  nwr({bbox})[\"amenity\"=\"concert_hall\"];
  nwr({bbox})[\"amenity\"=\"exhibition_centre\"];
  nwr({bbox})[\"amenity\"=\"conference_centre\"];
  nwr({bbox})[\"leisure\"=\"sports_centre\"][\"capacity\"];
);
out center tags qt;"""
    elements = (_overpass_query_json(q, timeout=7).get("elements") or [])[:220]
    venues=[]; seen=set()
    for el in elements:
        center=_event_element_center(el)
        if not center: continue
        lat,lon=center; tags=el.get("tags") or {}
        name=str(tags.get("name") or tags.get("official_name") or "Local de evento").strip()[:140]
        kind=(str(tags.get("leisure") or tags.get("amenity") or tags.get("building") or "event_venue").strip().lower())
        try: capacity=int(re.sub(r"[^0-9]", "", str(tags.get("capacity") or "0")) or 0)
        except Exception: capacity=0
        if kind == "sports_centre" and capacity and capacity < 1800: continue
        k=(round(lat,5),round(lon,5),name.lower())
        if k in seen: continue
        seen.add(k)
        base_radius = 720 if kind in {"stadium","events_venue"} else 620
        if capacity >= 30000: base_radius=1250
        elif capacity >= 12000: base_radius=1000
        elif capacity >= 5000: base_radius=850
        venues.append({"name":name,"lat":lat,"lon":lon,"kind":kind,"capacity":capacity,"radius_m":base_radius,"source":"openstreetmap"})
    venues.sort(key=lambda x:(-int(x.get("capacity") or 0), x["name"]))
    with _EVENT_VENUE_CACHE_LOCK:
        _EVENT_VENUE_CACHE[key]=(now,copy.deepcopy(venues[:80]))
        if len(_EVENT_VENUE_CACHE)>160:
            for old,_ in sorted(_EVENT_VENUE_CACHE.items(),key=lambda kv:kv[1][0])[:40]: _EVENT_VENUE_CACHE.pop(old,None)
    return venues[:80]



def _event_norm_name(value):
    value=unicodedata.normalize("NFKD",str(value or "")).encode("ascii","ignore").decode("ascii").lower()
    value=re.sub(r"\b(estadio|arena|stadium|estadium|estadio municipal|estadio estadual|do|da|de|the)\b"," ",value)
    return re.sub(r"[^a-z0-9]+"," ",value).strip()


def _scheduled_match_events():
    """Best-effort football schedule signal using ESPN's public site scoreboard.

    The endpoint is undocumented, so this source is never required for routing.
    Traffic/reports remain the fallback source of truth if the schema or service
    changes. Results are cached to avoid polling sports endpoints per route.
    """
    if not VANO_ESPN_MATCH_FEED_ENABLED or not VANO_ESPN_SOCCER_LEAGUES:
        return []
    now=time.time()
    with _MATCH_SCHEDULE_LOCK:
        if now-float(_MATCH_SCHEDULE_CACHE.get("ts") or 0)<8*60:
            return copy.deepcopy(_MATCH_SCHEDULE_CACHE.get("items") or [])
    dt=datetime.now(timezone.utc);start=(dt-timedelta(days=1)).strftime("%Y%m%d");end=(dt+timedelta(days=1)).strftime("%Y%m%d")
    def fetch(league):
        url=f"https://site.api.espn.com/apis/site/v2/sports/soccer/{league}/scoreboard"
        try:
            r=requests.get(url,params={"dates":f"{start}-{end}"},headers={"User-Agent":"VANO MAPS/164 event-intelligence"},timeout=4.5);r.raise_for_status();data=r.json() or {}
        except Exception:return []
        out=[]
        for ev in (data.get("events") or [])[:80]:
            comps=ev.get("competitions") or []
            if not comps:continue
            comp=comps[0] or {};venue=comp.get("venue") or {};venue_name=str(venue.get("fullName") or "").strip()
            if not venue_name:continue
            start_dt=parse_iso(ev.get("date") or comp.get("date"));
            if not start_dt:continue
            # Soccer road pressure: roughly 3 h before kickoff through 3 h after a
            # normal match; the live-traffic signal can keep it active longer.
            if not (start_dt-timedelta(hours=3)<=datetime.now(timezone.utc)<=start_dt+timedelta(hours=5)):continue
            status=((comp.get("status") or {}).get("type") or {})
            out.append({"event_name":str(ev.get("name") or ev.get("shortName") or "Jogo").strip()[:160],"venue_name":venue_name[:140],"venue_norm":_event_norm_name(venue_name),"start":start_dt.isoformat(),"league":league,"status":str(status.get("name") or status.get("description") or "")[:80],"source":"espn-scoreboard"})
        return out
    items=[]
    with ThreadPoolExecutor(max_workers=min(3,len(VANO_ESPN_SOCCER_LEAGUES))) as pool:
        for rows in pool.map(fetch,VANO_ESPN_SOCCER_LEAGUES):items.extend(rows)
    # same match can appear in national and continental schedule windows
    dedup={}
    for item in items:
        key=(item["venue_norm"],item["start"],_event_norm_name(item["event_name"]))
        dedup[key]=item
    items=list(dedup.values())[:180]
    with _MATCH_SCHEDULE_LOCK:
        _MATCH_SCHEDULE_CACHE["ts"]=now;_MATCH_SCHEDULE_CACHE["items"]=copy.deepcopy(items)
    return items


def _scheduled_event_for_venue(venue, schedule):
    vn=_event_norm_name(venue.get("name"));
    if not vn:return None
    best=None;best_score=0.0
    for ev in schedule or []:
        en=ev.get("venue_norm") or _event_norm_name(ev.get("venue_name"));
        if not en:continue
        if vn in en or en in vn:score=.96
        else:score=difflib.SequenceMatcher(None,vn,en).ratio()
        if score>best_score:best_score=score;best=ev
    return best if best is not None and best_score>=.66 else None


def _event_feed_items():
    if not VANO_EVENT_FEED_URLS:
        return []
    now=time.time()
    with _EVENT_FEED_LOCK:
        if now-float(_EVENT_FEED_CACHE.get("ts") or 0)<180:
            return copy.deepcopy(_EVENT_FEED_CACHE.get("items") or [])
    items=[]
    for url in VANO_EVENT_FEED_URLS:
        try:
            r=requests.get(url,headers={"User-Agent":"VANO MAPS/164 event-intelligence"},timeout=4)
            r.raise_for_status(); data=r.json()
            rows=data if isinstance(data,list) else (data.get("events") or data.get("items") or data.get("data") or []) if isinstance(data,dict) else []
            for raw in rows[:500]:
                if not isinstance(raw,dict): continue
                try:
                    lat=float(raw.get("lat",raw.get("latitude"))); lon=float(raw.get("lon",raw.get("lng",raw.get("longitude"))))
                except Exception: continue
                start=parse_iso(raw.get("start") or raw.get("start_at") or raw.get("starts_at") or raw.get("start_time"))
                end=parse_iso(raw.get("end") or raw.get("end_at") or raw.get("ends_at") or raw.get("end_time"))
                if not start: continue
                if not end: end=start+timedelta(hours=4)
                now_dt=datetime.now(timezone.utc)
                active=(start-timedelta(hours=2,minutes=15))<=now_dt<=(end+timedelta(hours=1,minutes=45))
                if not active: continue
                items.append({"name":str(raw.get("name") or raw.get("title") or "Evento").strip()[:140],"lat":lat,"lon":lon,"start":start.isoformat(),"end":end.isoformat(),"radius_m":int(clamp(float(raw.get("radius_m") or 1100),400,2500)),"source":str(raw.get("source") or "event-feed")[:80],"confirmed":True})
        except Exception as exc:
            app.logger.debug("Event feed unavailable: %s", type(exc).__name__)
    with _EVENT_FEED_LOCK:
        _EVENT_FEED_CACHE["ts"]=now;_EVENT_FEED_CACHE["items"]=copy.deepcopy(items[:300])
    return items[:300]


def _event_reports_near(reports, lat, lon, radius=1300):
    now=datetime.now(timezone.utc); out=[]
    for row in (reports or []):
        category=str((row.get("category") if isinstance(row,dict) else row["category"]) or "").lower()
        if category not in {"crowd","traffic","road_block","construction","accident"}: continue
        try:
            rlat=float(row.get("latitude") if isinstance(row,dict) else row["latitude"]); rlon=float(row.get("longitude") if isinstance(row,dict) else row["longitude"])
        except Exception: continue
        d=haversine_m(lat,lon,rlat,rlon)
        if d>radius: continue
        created=parse_iso(row.get("created_at") if isinstance(row,dict) else row["created_at"]) or now
        age_h=max(0,(now-created).total_seconds()/3600)
        if age_h>8 and category in {"crowd","traffic"}: continue
        if age_h>24 and category in {"road_block","construction","accident"}: continue
        out.append({"category":category,"distance_m":round(d),"severity":int((row.get("severity") if isinstance(row,dict) else row["severity"]) or 1),"confirmations":int((row.get("confirmations") if isinstance(row,dict) else row["confirmations"]) or 0),"age_h":age_h})
    return out


def _event_traffic_near(route, venue):
    traffic=route_traffic_metrics(route); best=0.0; congested_m=0.0; avoid=[]; nearest=10**9
    vlat,vlon=float(venue["lat"]),float(venue["lon"])
    for seg in (traffic.get("traffic_segments") or []):
        coords=seg.get("coordinates") or []
        if len(coords)<2: continue
        d=min_distance_to_geometry_m(vlat,vlon,coords); nearest=min(nearest,d)
        if d>1500: continue
        proximity=clamp(1.0-d/1700.0,.08,1.0); score=float(seg.get("score") or 0)
        best=max(best,score*(.72+.28*proximity))
        seg_len=max(0,float(seg.get("distance_end_m") or 0)-float(seg.get("distance_start_m") or 0))
        if score>=58:
            congested_m += seg_len*proximity
            mid=coords[len(coords)//2]
            if len(mid)>=2 and d<=1050 and all(haversine_m(float(mid[1]),float(mid[0]),p[1],p[0])>140 for p in avoid):
                avoid.append([float(mid[0]),float(mid[1])])
    for p in (traffic.get("traffic_points") or []):
        try:
            if haversine_m(vlat,vlon,float(p[1]),float(p[0]))<=1250 and all(haversine_m(float(p[1]),float(p[0]),q[1],q[0])>140 for q in avoid): avoid.append([float(p[0]),float(p[1])])
        except Exception: pass
    return {"score":round(best,1),"congested_m":round(congested_m),"avoid_points":avoid[:5],"nearest_traffic_m":round(nearest) if nearest<10**8 else None,"traffic":traffic}


def route_event_disruptions(route, start_lat, start_lon, end_lat, end_lon, reports=None, venues=None):
    """Return corroborated event-pressure zones touching a route corridor."""
    if not VANO_EVENT_INTELLIGENCE_ENABLED or not route:
        return []
    coords=((route.get("geometry") or {}).get("coordinates") or [])
    if len(coords)<2: return []
    bounds=_event_bounds_from_geometry(coords,.016)
    if not bounds: return []
    if venues is None:
        venues=event_venues_for_bounds(bounds)
    feed=_event_feed_items();schedule=_scheduled_match_events()
    combined=[dict(x) for x in venues]
    for ev in feed:
        if not (bounds[0]-.02<=ev["lat"]<=bounds[2]+.02 and bounds[1]-.02<=ev["lon"]<=bounds[3]+.02): continue
        match=None
        for v in combined:
            if haversine_m(ev["lat"],ev["lon"],v["lat"],v["lon"])<=850:
                match=v;break
        if match:
            match["confirmed_event"]=True;match["event_name"]=ev["name"];match["event_start"]=ev.get("start");match["event_end"]=ev.get("end");match["radius_m"]=max(float(match.get("radius_m") or 700),float(ev.get("radius_m") or 1100));match["event_source"]=ev.get("source")
        else:
            combined.append({"name":ev["name"],"lat":ev["lat"],"lon":ev["lon"],"kind":"scheduled_event","capacity":0,"radius_m":ev.get("radius_m",1100),"source":ev.get("source","event-feed"),"confirmed_event":True,"event_name":ev["name"],"event_start":ev.get("start"),"event_end":ev.get("end")})
    out=[]
    for venue in combined[:100]:
        vlat,vlon=float(venue["lat"]),float(venue["lon"]); base_radius=float(clamp(float(venue.get("radius_m") or 720),420,1800))
        droute=min_distance_to_geometry_m(vlat,vlon,coords)
        if droute>max(1450,base_radius+500): continue
        start_d=haversine_m(start_lat,start_lon,vlat,vlon); end_d=haversine_m(end_lat,end_lon,vlat,vlon)
        destination_related=end_d<=base_radius+330; origin_related=start_d<=base_radius+260
        scheduled=_scheduled_event_for_venue(venue,schedule)
        if scheduled:
            venue["confirmed_event"]=True;venue["event_name"]=scheduled.get("event_name") or venue.get("name");venue["event_start"]=scheduled.get("start");venue["event_source"]=scheduled.get("source");venue["scheduled_match"]=True
        signal=_event_traffic_near(route,venue); nearby_reports=_event_reports_near(reports or [],vlat,vlon,max(1300,base_radius+400))
        report_score=0.0
        for rep in nearby_reports:
            base={"crowd":30,"traffic":22,"road_block":34,"construction":26,"accident":24}.get(rep["category"],15)
            report_score=max(report_score,base+rep["severity"]*5+min(15,rep["confirmations"]*3)-min(15,rep["age_h"]*2))
        confirmed=bool(venue.get("confirmed_event")); score=max(float(signal["score"]),report_score,82.0 if confirmed else 0.0)
        active=bool(confirmed or score>=58 or (float(signal["score"])>=48 and signal["congested_m"]>=500))
        if not active: continue
        radius=base_radius
        if score>=82: radius=max(radius,1200)
        elif score>=70: radius=max(radius,950)
        expected=int(clamp(80+(max(0,score-50)*8.0)+(signal["congested_m"]/12.0)+(140 if any(r["category"]=="road_block" for r in nearby_reports) else 0),90,900))
        avoid=list(signal["avoid_points"])
        if not avoid:
            ring=min(430,max(240,radius*.36)); dlat=ring/110540.0; dlon=ring/(111320.0*max(.22,math.cos(math.radians(vlat))))
            avoid=[[vlon,vlat],[vlon+dlon,vlat],[vlon-dlon,vlat],[vlon,vlat+dlat],[vlon,vlat-dlat]]
        out.append({"name":str(venue.get("event_name") or venue.get("name") or "Área de evento")[:140],"venue_name":str(venue.get("name") or venue.get("event_name") or "Área de evento")[:140],"lat":vlat,"lon":vlon,"kind":venue.get("kind") or "event_venue","source":venue.get("event_source") or venue.get("source") or "event-pressure","confirmed_event":confirmed,"scheduled_match":bool(venue.get("scheduled_match")),"event_start":venue.get("event_start"),"event_end":venue.get("event_end"),"pressure_score":round(score,1),"radius_m":round(radius),"distance_to_route_m":round(droute),"expected_delay_s":expected,"destination_related":bool(destination_related),"origin_related":bool(origin_related),"traffic_score_nearby":signal["score"],"congested_nearby_m":signal["congested_m"],"reports_nearby":nearby_reports[:6],"avoid_points":avoid[:6]})
    out.sort(key=lambda x:(x["destination_related"],-x["pressure_score"],x["distance_to_route_m"]))
    return out[:6]


def event_exposure_for_route(route, disruptions):
    coords=((route or {}).get("geometry") or {}).get("coordinates") or []
    if len(coords)<2:return {"penalty_s":0,"hits":[]}
    hits=[]; penalty=0
    for ev in disruptions or []:
        if ev.get("destination_related") or ev.get("origin_related"): continue
        d=min_distance_to_geometry_m(float(ev["lat"]),float(ev["lon"]),coords); radius=float(ev.get("radius_m") or 900)
        if d<=radius:
            factor=clamp(1.0-d/max(radius,1),.25,1.0); p=int(float(ev.get("expected_delay_s") or 120)*factor)
            penalty+=p;hits.append({"name":ev.get("name"),"distance_m":round(d),"penalty_s":p,"pressure_score":ev.get("pressure_score")})
    return {"penalty_s":int(clamp(penalty,0,1200)),"hits":hits[:5]}


def build_event_bypass_routes(start_lon,start_lat,end_lon,end_lat,travel_profile,disruptions,depart_at="now",start_bearing=None,start_speed=None,reroute=False,extra_excludes=None):
    active=[x for x in (disruptions or []) if not x.get("destination_related") and not x.get("origin_related")]
    if not active:return []
    points=[];names=[]
    for ev in active[:2]:
        names.append(ev.get("name") or "evento")
        for pt in ev.get("avoid_points") or [[ev["lon"],ev["lat"]]]:
            if all(haversine_m(float(pt[1]),float(pt[0]),q[1],q[0])>110 for q in points):points.append([float(pt[0]),float(pt[1])])
            if len(points)>=12:break
        if len(points)>=12:break
    try:
        found=mapbox_routes(start_lon,start_lat,end_lon,end_lat,travel_profile,depart_at,exclusions=points[:12],alternatives=True,extra_excludes=extra_excludes,start_bearing=start_bearing,start_speed=start_speed,reroute=reroute)
    except Exception:
        return []
    out=[]
    for raw in found[:4]:
        raw["_event_variant"]=True;raw["_event_avoided_points"]=len(points);raw["_event_avoid_names"]=names[:2];raw["_event_pressure_score"]=max(float(x.get("pressure_score") or 0) for x in active)
        out.append(raw)
    return out


def event_candidate_payload(raw, idx, travel_profile, local_hour, user_nav, mode, disruptions):
    bounds=_event_bounds_from_geometry(((raw.get("geometry") or {}).get("coordinates") or []),.012)
    if bounds:
        reports=get_active_reports_for_bounds(*bounds);zones=get_risk_zones_for_bounds(*bounds)
    else: reports=[];zones=[]
    risk=route_risk_metrics(raw,reports,zones,local_hour,travel_profile);traffic=route_traffic_metrics(raw);flow=route_live_flow_metrics(raw);road=route_road_controls(raw)
    professional=professional_route_assessment(raw,risk,road) if user_nav.get("professional_driver") else {"professional_ok":True,"professional_flags":[],"exclusion_violations":[]}
    exposure=event_exposure_for_route(raw,disruptions)
    item={"id":idx,"distance":raw.get("distance",0),"duration":raw.get("duration",0),"duration_min":round(float(raw.get("duration",0))/60,1),"geometry":raw.get("geometry"),"steps":compact_steps(raw),"profile":travel_profile,"event_variant":bool(raw.get("_event_variant")),"event_avoided_points":int(raw.get("_event_avoided_points",0) or 0),"event_avoid_names":raw.get("_event_avoid_names") or [],"event_pressure_score":round(float(raw.get("_event_pressure_score") or 0),1),"event_disruptions":[{k:v for k,v in ev.items() if k!="avoid_points"} for ev in disruptions[:5]],"event_exposure_penalty_s":exposure["penalty_s"],"event_exposure_hits":exposure["hits"],"micro_route":bool(raw.get("_micro_route")),"micro_avoided_points":int(raw.get("_micro_avoided_points",0) or 0),"micro_strategy":raw.get("_micro_strategy") or "","micro_streets":raw.get("_micro_streets") or [],"micro_traffic_relief":round(float(raw.get("_micro_traffic_relief") or 0),1),"routing_profile_used":raw.get("_profile_used","driving-traffic"),"routing_provider":raw.get("_provider","mapbox"),"route_signature":route_signature(raw),"badges":[],**risk,**{k:v for k,v in traffic.items() if k!="traffic_points"},**flow,**road,**professional}
    apply_route_intelligence([item],travel_profile,safety_bias=74 if mode!="fastest" else 60,traffic_bias=88)
    if mode=="fastest":item["fast_eta_only"]=True;item["badges"]=["fastest"]
    elif mode=="safest":item["badges"]=["safest"]
    else:item["badges"]=["smart"]
    return item


def _mapbox_nearby_pois(queries, lat, lon, radius, limit=10):
    """Fallback de POIs usando o Search Box já configurado no VANO MAPS."""
    if not mapbox_ready():
        return []
    proximity = (float(lon), float(lat))
    radius = max(500, float(radius))
    found, seen = [], set()
    for query in queries:
        try:
            results = mapbox_searchbox_forward(query, proximity=proximity, language=preferred_language())
        except Exception:
            continue
        for item in results:
            try:
                plat, plon = float(item["lat"]), float(item["lon"])
                distance = float(item.get("distance_m") or haversine_m(float(lat), float(lon), plat, plon))
            except Exception:
                continue
            if distance > radius * 1.35:
                continue
            key = (round(plat, 5), round(plon, 5), _search_normalize(item.get("name") or item.get("label") or ""))
            if key in seen:
                continue
            seen.add(key)
            copy_item = dict(item)
            copy_item["distance_m"] = round(distance)
            copy_item["query_hint"] = query
            found.append(copy_item)
    found.sort(key=lambda x: float(x.get("distance_m") or 1e12))
    return found[:limit]


def overpass_support_points(lat, lon, radius=1800):
    """Busca pontos de apoio próximos em dados OSM, sem rotulá-los como "seguros".

    São locais potencialmente úteis em uma parada (polícia, hospital, farmácia,
    bombeiros, posto e conveniência). A disponibilidade depende do mapeamento.
    """
    radius = int(clamp(radius, 500, 4000))
    cache_key = (round(float(lat), 3), round(float(lon), 3), int(radius / 250) * 250)
    now = time.time()
    with SAFE_STOPS_LOCK:
        cached = SAFE_STOPS_CACHE.get(cache_key)
        if cached and now - cached[0] < 300:
            return cached[1]
    query = f"""[out:json][timeout:9];
(
  nwr(around:{radius},{float(lat):.6f},{float(lon):.6f})["amenity"~"^(police|hospital|clinic|pharmacy|fire_station|fuel)$"];
  nwr(around:{radius},{float(lat):.6f},{float(lon):.6f})["shop"="convenience"];
);
out center 80;"""
    data = _overpass_query_json(query, timeout=8)

    labels = {
        "police": ("police", "Polícia", 0),
        "fire_station": ("fire_station", "Bombeiros", 1),
        "hospital": ("hospital", "Hospital", 2),
        "clinic": ("clinic", "Clínica", 3),
        "pharmacy": ("pharmacy", "Farmácia", 4),
        "fuel": ("fuel", "Posto", 5),
        "convenience": ("convenience", "Conveniência", 6),
    }
    items, seen = [], set()
    for el in data.get("elements", []) or []:
        tags = el.get("tags") or {}
        lat_v = el.get("lat")
        lon_v = el.get("lon")
        if lat_v is None or lon_v is None:
            center = el.get("center") or {}
            lat_v, lon_v = center.get("lat"), center.get("lon")
        if lat_v is None or lon_v is None:
            continue
        amenity = tags.get("amenity") or ("convenience" if tags.get("shop") == "convenience" else "")
        if amenity not in labels:
            continue
        kind, generic_label, priority = labels[amenity]
        key = (kind, round(float(lat_v), 5), round(float(lon_v), 5))
        if key in seen:
            continue
        seen.add(key)
        distance = haversine_m(float(lat), float(lon), float(lat_v), float(lon_v))
        name = str(tags.get("name") or tags.get("brand") or generic_label)[:120]
        items.append({
            "id": f"{el.get('type','n')}-{el.get('id','')}",
            "type": kind, "label": generic_label, "name": name,
            "lat": float(lat_v), "lon": float(lon_v), "distance_m": round(distance),
            "priority": priority, "opening_hours": str(tags.get("opening_hours") or "")[:100],
            "source": "openstreetmap",
        })
    if len(items) < 3:
        fallback_terms = ["hospital", "farmácia", "delegacia de polícia", "posto de combustível", "clínica"]
        type_by_term = {
            "hospital": ("hospital", "Hospital", 2),
            "farmácia": ("pharmacy", "Farmácia", 4),
            "delegacia de polícia": ("police", "Polícia", 0),
            "posto de combustível": ("fuel", "Posto", 5),
            "clínica": ("clinic", "Clínica", 3),
        }
        for poi in _mapbox_nearby_pois(fallback_terms, lat, lon, radius, limit=12):
            kind, generic_label, priority = type_by_term.get(poi.get("query_hint"), ("support", "Ponto de apoio", 7))
            key = (kind, round(float(poi["lat"]), 5), round(float(poi["lon"]), 5))
            if key in seen:
                continue
            seen.add(key)
            items.append({
                "id": f"mapbox-{poi.get('mapbox_id') or len(items)}",
                "type": kind, "label": generic_label,
                "name": str(poi.get("name") or generic_label)[:120],
                "lat": float(poi["lat"]), "lon": float(poi["lon"]),
                "distance_m": round(float(poi.get("distance_m") or 0)),
                "priority": priority, "opening_hours": "", "source": "mapbox-searchbox",
            })
    items.sort(key=lambda x: (x["priority"], x["distance_m"]))
    # Garante diversidade: primeiro um exemplar próximo de cada tipo e depois completa.
    diverse, used = [], set()
    for item in items:
        if item["type"] not in used:
            diverse.append(item); used.add(item["type"])
        if len(diverse) >= 8:
            break
    if len(diverse) < 8:
        used_ids = {x["id"] for x in diverse}
        diverse.extend(x for x in sorted(items, key=lambda x: x["distance_m"]) if x["id"] not in used_ids)
    result = diverse[:8]
    with SAFE_STOPS_LOCK:
        SAFE_STOPS_CACHE[cache_key] = (now, result)
        if len(SAFE_STOPS_CACHE) > 400:
            stale = sorted(SAFE_STOPS_CACHE.items(), key=lambda kv: kv[1][0])[:100]
            for key, _ in stale:
                SAFE_STOPS_CACHE.pop(key, None)
    return result


# -----------------------------
# Embed / deployment diagnostics
# -----------------------------

