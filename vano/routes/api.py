"""VANO map, alert, live context and sharing APIs.

Extracted from the historical monolithic app.py without changing route bodies or
business rules. Runtime dependencies are injected once during application startup.
"""
from vano.bootstrap import inject as _vano_inject
_vano_inject(globals())
del _vano_inject

@app.route("/api/presence", methods=["POST"])
def api_presence_update():
    user = current_user()
    if not user:
        return jsonify({"ok": True, "published": False, "reason": "login"})
    if not validate_csrf():
        abort(400)
    if not (int(user["presence_visible"] or 0) == 1 and int(user["is_app_driver"] or 0) == 1 and int(user["age"] or 0) >= 18 and user["presence_terms_accepted_at"]):
        get_db().execute("DELETE FROM nearby_presence WHERE user_id=?", (user["id"],))
        get_db().commit()
        return jsonify({"ok": True, "published": False, "reason": "private"})
    data = request.get_json(silent=True) or {}
    try:
        lat, lon = float(data.get("lat")), float(data.get("lon"))
    except (TypeError, ValueError):
        return jsonify({"error": "Localização inválida."}), 400
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return jsonify({"error": "Localização inválida."}), 400
    # Aproximadamente 100 m por célula em latitude. Nunca persistimos o GPS exato.
    qlat, qlon = round(lat, 3), round(lon, 3)
    db = get_db()
    db.execute(
        """INSERT INTO nearby_presence(user_id,cell_lat,cell_lon,updated_at) VALUES(?,?,?,?)
           ON CONFLICT(user_id) DO UPDATE SET cell_lat=excluded.cell_lat,cell_lon=excluded.cell_lon,updated_at=excluded.updated_at""",
        (user["id"], qlat, qlon, utcnow_iso()),
    )
    db.commit()
    return jsonify({"ok": True, "published": True})


@app.route("/api/nearby-drivers")
def api_nearby_drivers():
    viewer = current_user()
    if not viewer:
        return jsonify({"drivers": []})
    try:
        lat, lon = float(request.args.get("lat")), float(request.args.get("lon"))
    except (TypeError, ValueError):
        return jsonify({"drivers": []})
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=3)).isoformat()
    db = get_db()
    rows = db.execute(
        """SELECT p.user_id,p.cell_lat,p.cell_lon,p.updated_at
           FROM nearby_presence p JOIN users u ON u.id=p.user_id
           WHERE p.updated_at>=? AND u.is_active=1 AND u.is_app_driver=1 AND u.presence_visible=1 AND u.presence_terms_accepted_at IS NOT NULL AND u.id<>?
           LIMIT 120""",
        (cutoff, viewer["id"]),
    ).fetchall()
    out = []
    for row in rows:
        d = haversine_m(lat, lon, float(row["cell_lat"]), float(row["cell_lon"]))
        if d <= 1500:
            out.append({"id": f"driver-{row['user_id']}", "lat": row["cell_lat"], "lon": row["cell_lon"], "distance_m": round(d), "label": "Motorista próximo"})
    out.sort(key=lambda x: x["distance_m"])
    return jsonify({"drivers": out[:40], "privacy": "Posições aproximadas; somente motoristas adultos que ativaram presença."})


@app.route("/api/nearby-users-summary")
def api_nearby_users_summary():
    """Return only an aggregate nearby-presence count for the map notice.

    Presence rows are already approximate (~100 m cells) and opt-in. This
    endpoint deliberately exposes no user ids or coordinates, so guests can
    see honest nearby activity without receiving another person's position.
    """
    try:
        lat, lon = float(request.args.get("lat")), float(request.args.get("lon"))
    except (TypeError, ValueError):
        return jsonify({"count": 0})
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return jsonify({"count": 0})

    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=3)).isoformat()
    viewer = current_user()
    params = [cutoff]
    exclude_sql = ""
    if viewer:
        exclude_sql = " AND u.id<>?"
        params.append(viewer["id"])

    rows = get_db().execute(
        f"""SELECT p.cell_lat,p.cell_lon
            FROM nearby_presence p JOIN users u ON u.id=p.user_id
            WHERE p.updated_at>=? AND u.is_active=1 AND u.is_app_driver=1
              AND u.presence_visible=1 AND u.presence_terms_accepted_at IS NOT NULL
              {exclude_sql}
            LIMIT 160""",
        tuple(params),
    ).fetchall()
    count = sum(
        1 for row in rows
        if haversine_m(lat, lon, float(row["cell_lat"]), float(row["cell_lon"])) <= 1500
    )
    return jsonify({
        "count": min(count, 120),
        "radius_m": 1500,
        "fresh_for_minutes": 3,
        "privacy": "Contagem agregada de presenças aproximadas e voluntárias; nenhuma posição é retornada.",
    })


@app.route("/api/recent-destinations")
def api_recent_destinations():
    user = current_user()
    if not user:
        return jsonify({"results": []})
    # Rank by recency + frequency + hour-of-day affinity instead of returning a
    # purely chronological list. This keeps the quick-destination surface useful
    # without storing any extra location history beyond the existing route rows.
    rows = get_db().execute(
        """
        SELECT destination_label, destination_lat, destination_lon, created_at
        FROM route_history
        WHERE user_id=? AND destination_label<>''
        ORDER BY created_at DESC
        LIMIT 120
        """,
        (user["id"],),
    ).fetchall()
    now = datetime.now()
    buckets = {}
    for row in rows:
        label = str(row["destination_label"] or "").strip()
        if not label:
            continue
        key = (label, round(float(row["destination_lat"] or 0), 5), round(float(row["destination_lon"] or 0), 5))
        item = buckets.setdefault(key, {
            "label": label,
            "lat": row["destination_lat"],
            "lon": row["destination_lon"],
            "uses": 0,
            "latest": None,
            "hour_hits": 0,
        })
        item["uses"] += 1
        dt = parse_iso(row["created_at"])
        if dt:
            if item["latest"] is None or dt > item["latest"]:
                item["latest"] = dt
            hour_delta = min((dt.hour - now.hour) % 24, (now.hour - dt.hour) % 24)
            if hour_delta <= 1:
                item["hour_hits"] += 1
    ranked = []
    for item in buckets.values():
        latest = item.pop("latest", None)
        age_h = max(0.0, (now - latest.replace(tzinfo=None)).total_seconds() / 3600.0) if latest else 9999.0
        recency = max(0.0, 34.0 - min(34.0, age_h / 5.0))
        frequency = min(42.0, item["uses"] * 5.5)
        hour_affinity = min(24.0, item.pop("hour_hits", 0) * 8.0)
        item["smart_score"] = round(recency + frequency + hour_affinity, 1)
        item["reason"] = "Bom para este horário" if hour_affinity >= 8 else ("Destino frequente" if item["uses"] >= 3 else "Usado recentemente")
        ranked.append(item)
    ranked.sort(key=lambda x: (-x["smart_score"], -x["uses"], x["label"].lower()))
    return jsonify({"results": ranked[:6]})


@app.route("/api/geocode")
def api_geocode():
    if not rate_limit("geocode", 90, 60):
        return jsonify({"error": "Muitas buscas. Aguarde um pouco."}), 429
    q = request.args.get("q", "").strip()
    if len(q) < 3 or len(q) > 240:
        return jsonify({"error": "Digite um endereço, cidade ou CEP válido."}), 400
    proximity = None
    try:
        if request.args.get("proximity_lat") and request.args.get("proximity_lon"):
            plat = float(request.args["proximity_lat"]); plon = float(request.args["proximity_lon"])
            if -90 <= plat <= 90 and -180 <= plon <= 180:
                proximity = (plon, plat)
    except ValueError:
        proximity = None
    try:
        results = smart_location_search(q, proximity=proximity)
        providers = sorted({str(x.get("source") or "mapbox") for x in results})
        return jsonify({"results": results, "provider": "+".join(providers) or "search", "query": parse_brazil_location_query(q)})
    except Exception as exc:
        return jsonify({"error": "Busca de endereço temporariamente indisponível.", "detail": str(exc)}), 502


@app.route("/api/reverse")
def api_reverse():
    if not rate_limit("reverse", 45, 60):
        return jsonify({"error": "Muitas buscas."}), 429
    try:
        lat = float(request.args.get("lat", "")); lon = float(request.args.get("lon", ""))
    except ValueError:
        return jsonify({"error": "Coordenadas inválidas."}), 400
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return jsonify({"error": "Coordenadas inválidas."}), 400
    try:
        return jsonify({"label": mapbox_reverse_geocode(lon, lat), "provider": "mapbox"})
    except Exception as exc:
        return jsonify({"label": f"{lat:.5f}, {lon:.5f}", "warning": str(exc)})


@app.route("/api/snap-road", methods=["POST"])
@login_required
def api_snap_road():
    if not validate_csrf():
        return jsonify({"ok": False, "error": "Sessão inválida."}), 400
    if not rate_limit("snap-road", 50, 60):
        return jsonify({"ok": False, "error": "Muitas tentativas de ajuste de via."}), 429
    data = request.get_json(silent=True) or {}
    try:
        lat = float(data.get("lat")); lon = float(data.get("lon"))
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "Localização inválida."}), 400
    hit = snap_alert_to_nearest_road(lat, lon)
    if not hit:
        return jsonify({"ok": False, "error": "Nenhuma via dirigível encontrada próxima deste ponto."}), 404
    return jsonify({"ok": True, **hit})


@app.route("/api/alerts/quick", methods=["POST"])
def api_alert_quick():
    """Create a compact map alert and always return JSON to the map client."""
    user = current_user()
    if not user:
        return jsonify({"ok": False, "error": "Entre na sua conta para enviar um alerta."}), 401
    if not validate_csrf():
        return jsonify({"ok": False, "error": "Sessão expirada. Atualize a página e tente novamente."}), 400
    if not rate_limit("quick-alert", 8, 300):
        return jsonify({"ok": False, "error": "Muitos alertas em pouco tempo. Aguarde alguns minutos."}), 429

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"ok": False, "error": "Dados do alerta inválidos."}), 400

    category = str(data.get("category") or "other").strip()
    if category not in CATEGORY_META:
        category = "other"
    try:
        lat = float(data.get("lat"))
        lon = float(data.get("lon"))
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "Localização inválida."}), 400
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return jsonify({"ok": False, "error": "Localização inválida."}), 400

    # Fast path while navigating: the client may send the point already projected
    # onto the active route geometry. We only accept it when it stays close to the
    # raw GPS fix, so a stale/bad client cannot move an alert far away.
    road_hit = None
    snap_source = str(data.get("snap_source") or "").strip().lower()
    if snap_source == "active-route":
        try:
            hint_lat = float(data.get("snap_lat"))
            hint_lon = float(data.get("snap_lon"))
            accuracy = float(data.get("accuracy") or 35.0)
            hint_distance = haversine_m(lat, lon, hint_lat, hint_lon)
            hint_limit = max(45.0, min(160.0, max(6.0, accuracy) * 2.2))
            if -90 <= hint_lat <= 90 and -180 <= hint_lon <= 180 and hint_distance <= hint_limit:
                road_hit = {
                    "lat": hint_lat, "lon": hint_lon, "distance_m": hint_distance,
                    "road_name": "", "highway": "route", "osm_way_id": "",
                    "source": "active-route",
                }
        except (TypeError, ValueError):
            road_hit = None
    if road_hit is None:
        road_hit = snap_alert_to_nearest_road(lat, lon)
    if not road_hit:
        return jsonify({"ok": False, "error": "Não foi possível fixar o alerta em uma via próxima. Tente novamente."}), 503
    lat, lon = road_hit["lat"], road_hit["lon"]

    severity_by_category = {
        "robbery": 5, "harassment": 4, "poor_lighting": 3, "accident": 4, "traffic": 3,
        "road_block": 4, "blitz": 2, "speed_camera": 2, "road_hazard": 3, "pothole": 3,
        "stopped_vehicle": 3, "object_on_road": 4, "broken_signal": 3, "flood": 4,
        "construction": 3, "crowd": 2, "other": 3,
    }
    ttl_hours = {"robbery": 4, "harassment": 6, "poor_lighting": 48, "traffic": 4, "blitz": 4, "speed_camera": 8, "road_block": 12, "accident": 16, "flood": 18, "road_hazard": 16, "pothole": 36, "stopped_vehicle": 6, "object_on_road": 8, "broken_signal": 12, "construction": 24, "crowd": 8}
    severity = severity_by_category.get(category, 3)
    severity = max(1, int(round(severity * report_author_weight(user["id"]))))
    label = CATEGORY_META.get(category, CATEGORY_META["other"])["label"]
    now = datetime.now(timezone.utc)
    created_at = now.replace(microsecond=0).isoformat()
    expires_at = (now + timedelta(hours=ttl_hours.get(category, 8))).replace(microsecond=0).isoformat()
    db = get_db()

    # Same user + same category + almost same point in the last 90 seconds = reuse it.
    cutoff = (now - timedelta(seconds=90)).replace(microsecond=0).isoformat()
    recent = db.execute(
        """SELECT id,latitude,longitude FROM reports
           WHERE user_id=? AND category=? AND status='active' AND created_at>=?
           ORDER BY created_at DESC LIMIT 8""",
        (user["id"], category, cutoff),
    ).fetchall()
    for row in recent:
        if haversine_m(lat, lon, float(row["latitude"]), float(row["longitude"])) <= 120:
            return jsonify({"ok": True, "duplicate": True, "id": row["id"], "category": category, "category_label": label, "severity": severity, "lat": float(row["latitude"]), "lon": float(row["longitude"]), "created_at": created_at, "road_snapped": True, "snap_distance_m": round(road_hit["distance_m"], 1), "road_name": road_hit.get("road_name") or "", "snap_source": road_hit.get("source") or ""})

    cur = db.execute(
        """INSERT INTO reports(user_id,category,title,description,severity,latitude,longitude,address,status,created_at,expires_at,road_snapped,snap_distance_m,road_name)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (user["id"], category, label, "", severity, lat, lon, road_hit.get("road_name") or "", "active", created_at, expires_at, 1, round(road_hit["distance_m"], 1), road_hit.get("road_name") or ""),
    )
    db.commit()
    report_id = cur.lastrowid
    invalidate_route_context("reports")
    audit("quick_alert_created", {"report_id": report_id, "category": category, "severity": severity, "road_snapped": True, "snap_distance_m": round(road_hit["distance_m"], 1)})
    record_activity("alert", {"label": "road-snap:quick", "target": "quick-alert", "snap_distance_m": round(road_hit["distance_m"], 1)}, status_code=201, method="EVENT", path="/api/alerts/quick", endpoint="api_alert_quick")
    return jsonify({
        "ok": True, "duplicate": False, "id": report_id, "category": category,
        "category_label": label, "severity": severity, "lat": lat, "lon": lon,
        "created_at": created_at, "expires_at": expires_at, "road_snapped": True,
        "snap_distance_m": round(road_hit["distance_m"], 1), "road_name": road_hit.get("road_name") or "",
        "snap_source": road_hit.get("source") or "",
    }), 201


@app.route("/api/alerts/<int:report_id>/confirm", methods=["POST"])
@login_required
def api_confirm_alert(report_id):
    if not validate_csrf():
        return jsonify({"ok": False, "error": "Sessão inválida."}), 400
    db = get_db()
    report = db.execute("SELECT id,status FROM reports WHERE id=?", (report_id,)).fetchone()
    if not report or report["status"] != "active":
        return jsonify({"ok": False, "error": "Alerta não está mais ativo."}), 404
    already = False
    try:
        db.execute("INSERT INTO report_confirmations(report_id,user_id,created_at) VALUES(?,?,?)", (report_id, session["user_id"], utcnow_iso()))
        db.execute("UPDATE reports SET confirmations=confirmations+1 WHERE id=?", (report_id,))
        db.commit()
        invalidate_route_context("reports")
    except IntegrityError:
        db.rollback(); already = True
    row = db.execute("SELECT confirmations FROM reports WHERE id=?", (report_id,)).fetchone()
    audit("map_alert_confirmed", {"report_id": report_id, "already": already})
    return jsonify({"ok": True, "already_confirmed": already, "confirmations": int(row["confirmations"] or 0) if row else 0})


@app.route("/api/alerts/<int:report_id>/not-there", methods=["POST"])
@login_required
def api_alert_not_there(report_id):
    if not validate_csrf():
        return jsonify({"ok": False, "error": "Sessão inválida."}), 400
    if not rate_limit("alert-not-there", 40, 3600):
        return jsonify({"ok": False, "error": "Aguarde antes de avaliar mais alertas."}), 429
    db = get_db()
    report = db.execute("SELECT id,status,confirmations FROM reports WHERE id=?", (report_id,)).fetchone()
    if not report or report["status"] != "active":
        return jsonify({"ok": False, "error": "Alerta não está mais ativo."}), 404
    already = False
    try:
        db.execute("INSERT INTO report_absence_votes(report_id,user_id,created_at) VALUES(?,?,?)", (report_id, session["user_id"], utcnow_iso()))
        db.commit()
        invalidate_route_context("reports")
    except IntegrityError:
        db.rollback(); already = True
    row = db.execute("SELECT COUNT(*) c FROM report_absence_votes WHERE report_id=?", (report_id,)).fetchone()
    votes = int(row["c"] or 0)
    confirmations = int(report["confirmations"] or 0)
    resolved = bool(votes >= 5 or (votes >= 3 and confirmations <= 1))
    if resolved:
        db.execute("UPDATE reports SET status='resolved' WHERE id=? AND status='active'", (report_id,)); db.commit(); invalidate_route_context("reports")
    audit("map_alert_not_there", {"report_id": report_id, "votes": votes, "resolved": resolved, "already": already})
    return jsonify({"ok": True, "already_voted": already, "absence_votes": votes, "resolved": resolved})


@app.route("/api/alerts")
def api_alerts():
    try:
        min_lat = float(request.args.get("min_lat", -90))
        min_lon = float(request.args.get("min_lon", -180))
        max_lat = float(request.args.get("max_lat", 90))
        max_lon = float(request.args.get("max_lon", 180))
    except ValueError:
        return jsonify({"error": "Limites inválidos."}), 400

    rows = get_active_reports_for_bounds(min_lat, min_lon, max_lat, max_lon)
    snap_updates = _resnap_visible_report_rows(rows, limit=6)
    items = []
    now = datetime.now(timezone.utc)
    for r in rows:
        try:
            created = datetime.fromisoformat(str(r["created_at"]).replace("Z", "+00:00")); age_h = max(0.0, (now-created).total_seconds()/3600.0)
        except Exception:
            age_h = 24.0
        confirmations = int(r["confirmations"] or 0)
        absence_votes = int(r.get("absence_votes") or 0)
        confidence = int(clamp(48 + confirmations*12 - absence_votes*15 - min(28, age_h*2.2), 5, 99))
        snapped = snap_updates.get(int(r["id"])) if snap_updates else None
        # Never render a legacy raw-GPS report off-road. If an older row cannot
        # be snapped right now, it stays hidden until a road projection succeeds.
        if not snapped and int(_row_value(r, "road_snapped", 0) or 0) != 1:
            continue
        alert_lat = snapped["lat"] if snapped else r["latitude"]
        alert_lon = snapped["lon"] if snapped else r["longitude"]
        items.append({
            "id": r["id"], "category": r["category"], "category_label": CATEGORY_META.get(r["category"], CATEGORY_META["other"])["label"],
            "title": r["title"], "description": r["description"], "severity": r["severity"],
            "lat": alert_lat, "lon": alert_lon, "address": (snapped.get("road_name") if snapped else (_row_value(r, "road_name", "") or r["address"])),
            "road_snapped": bool(snapped or int(_row_value(r, "road_snapped", 0) or 0)),
            "created_at": r["created_at"], "confirmations": confirmations, "absence_votes": absence_votes, "confidence": confidence,
        })
    response = jsonify({"alerts": items, "generated_at": utcnow_iso()})
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    return response



@app.route("/api/weather-now")
def api_weather_now():
    """Small, cached weather endpoint used only to choose the environmental map style."""
    if not rate_limit("weather-now", 30, 60):
        return jsonify({"available": False, "error": "rate_limited"}), 429
    try:
        lat, lon = float(request.args.get("lat")), float(request.args.get("lon"))
    except (TypeError, ValueError):
        return jsonify({"available": False, "error": "Localização inválida."}), 400
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return jsonify({"available": False, "error": "Localização inválida."}), 400
    weather = open_meteo_current(lat, lon)
    code = int(weather.get("weather_code") or 0) if weather.get("available") else 0
    wet_codes = {51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99}
    rainy = bool(
        weather.get("available") and (
            float(weather.get("precipitation_mm") or 0) > 0.05
            or float(weather.get("rain_mm") or 0) > 0.05
            or float(weather.get("showers_mm") or 0) > 0.05
            or code in wet_codes
        )
    )
    return jsonify({
        "available": bool(weather.get("available")),
        "rainy": rainy,
        "is_day": weather.get("is_day"),
        "weather_code": weather.get("weather_code"),
        "precipitation_mm": weather.get("precipitation_mm"),
        "temperature_c": weather.get("temperature_c"),
        "time": weather.get("time"),
    })


@app.route("/api/live-context")
def api_live_context():
    if not rate_limit("live-context", 24, 60):
        return jsonify({"error": "Muitas atualizações do contexto ao vivo. Aguarde um instante."}), 429
    try:
        lat = float(request.args["lat"]); lon = float(request.args["lon"])
        radius = int(request.args.get("radius", 900))
    except (KeyError, ValueError):
        return jsonify({"error": "Localização inválida."}), 400
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return jsonify({"error": "Localização inválida."}), 400
    radius = int(clamp(radius, 450, 1800))
    with ThreadPoolExecutor(max_workers=2) as pool:
        weather_future = pool.submit(open_meteo_current, lat, lon)
        road_future = pool.submit(overpass_live_road_context, lat, lon, min(radius, 1300))
        weather = weather_future.result()
        road = road_future.result()
    community = community_context(lat, lon, radius)
    flow = query_live_flow(lat, lon, min(3200, radius * 2))
    important = sorted(
        [*road, *community],
        key=lambda x: (-int(x.get("severity") or 0), haversine_m(lat, lon, float(x.get("lat") or lat), float(x.get("lon") or lon)))
    )[:100]
    return jsonify({
        "updated_at": utcnow_iso(),
        "weather": weather,
        "road_context": road,
        "community": community,
        "live_flow": flow,
        "important": important,
        "sources": [
            {"id": "open-meteo", "kind": "weather", "credential": "none", "freshness": "current-model"},
            {"id": "openstreetmap-overpass", "kind": "road-map", "credential": "none", "freshness": "mapped"},
            {"id": "vano-community", "kind": "user-reports", "credential": "internal", "freshness": "recent"},
            {"id": "vano-live-flow", "kind": "anonymous-speed-aggregate", "credential": "internal", "freshness": "20-min"},
        ],
        "disclaimer": "Tempo e tráfego são estimativas. Dados OSM são mapeados e podem não refletir mudanças momentâneas; alertas comunitários precisam de confirmação.",
    })



def overpass_parking_nearby(lat, lon, radius=1400):
    """Busca estacionamentos mapeados perto do destino usando OpenStreetMap."""
    radius = int(clamp(radius, 350, 2500))
    key = (round(float(lat), 3), round(float(lon), 3), int(radius / 250) * 250)
    now = time.time()
    with PARKING_LOCK:
        cached = PARKING_CACHE.get(key)
        if cached and now - cached[0] < 600:
            return copy.deepcopy(cached[1])
    query = f'''[out:json][timeout:10];
(
  nwr(around:{radius},{float(lat):.6f},{float(lon):.6f})["amenity"="parking"];
  node(around:{radius},{float(lat):.6f},{float(lon):.6f})["amenity"="parking_entrance"];
);
out center tags 90;'''
    elements = (_overpass_query_json(query, timeout=9).get("elements") or [])
    items, seen = [], set()
    for el in elements:
        center = _element_center(el)
        if not center:
            continue
        plat, plon = center
        tags = el.get("tags") or {}
        straight = haversine_m(float(lat), float(lon), plat, plon)
        if straight > radius * 1.1:
            continue
        name = str(tags.get("name") or tags.get("operator") or "Estacionamento")[:100]
        access = str(tags.get("access") or "")[:30]
        fee = str(tags.get("fee") or "")[:20]
        capacity = tags.get("capacity")
        parking_type = str(tags.get("parking") or tags.get("parking_space") or "")[:40]
        k = (round(plat, 5), round(plon, 5), name.lower())
        if k in seen:
            continue
        seen.add(k)
        items.append({
            "id": f"osm-{el.get('type','x')}-{el.get('id','')}",
            "name": name,
            "lat": float(plat), "lon": float(plon),
            "distance_straight_m": round(straight),
            "access": access, "fee": fee, "capacity": capacity,
            "parking_type": parking_type, "source": "openstreetmap",
        })
    if len(items) < 3:
        for poi in _mapbox_nearby_pois(["estacionamento", "parking"], lat, lon, radius, limit=12):
            plat, plon = float(poi["lat"]), float(poi["lon"])
            name = str(poi.get("name") or "Estacionamento")[:100]
            k = (round(plat, 5), round(plon, 5), name.lower())
            if k in seen:
                continue
            seen.add(k)
            items.append({
                "id": f"mapbox-{poi.get('mapbox_id') or len(items)}", "name": name,
                "lat": plat, "lon": plon,
                "distance_straight_m": round(float(poi.get("distance_m") or haversine_m(float(lat), float(lon), plat, plon))),
                "access": "", "fee": "", "capacity": None, "parking_type": "",
                "source": "mapbox-searchbox",
            })
    items.sort(key=lambda x: x["distance_straight_m"])
    result = items[:10]
    with PARKING_LOCK:
        PARKING_CACHE[key] = (now, copy.deepcopy(result))
        if len(PARKING_CACHE) > 500:
            stale = sorted(PARKING_CACHE.items(), key=lambda kv: kv[1][0])[:120]
            for ck, _ in stale:
                PARKING_CACHE.pop(ck, None)
    return result


def parking_with_walk_eta(dest_lat, dest_lon, radius=1400, limit=4):
    candidates = overpass_parking_nearby(dest_lat, dest_lon, radius)[: max(5, limit + 2)]
    if not candidates:
        return []

    def enrich(item):
        out = dict(item)
        try:
            routes = mapbox_routes(
                item["lon"], item["lat"], float(dest_lon), float(dest_lat),
                travel_profile="walking", alternatives=False,
            )
            route = routes[0] if routes else None
            if route:
                out["walk_seconds"] = round(float(route.get("duration") or 0))
                out["walk_minutes"] = max(1, round(float(route.get("duration") or 0) / 60))
                out["walk_distance_m"] = round(float(route.get("distance") or 0))
        except Exception:
            pass
        if not out.get("walk_minutes"):
            out["walk_distance_m"] = int(out.get("distance_straight_m") or 0)
            out["walk_minutes"] = max(1, round(out["walk_distance_m"] / 82.0))
            out["walk_estimated"] = True
        return out

    with ThreadPoolExecutor(max_workers=min(4, len(candidates))) as pool:
        enriched = list(pool.map(enrich, candidates))
    enriched.sort(key=lambda x: (int(x.get("walk_minutes") or 999), int(x.get("walk_distance_m") or 999999)))
    return enriched[:limit]


@app.route("/api/parking-nearby")
def api_parking_nearby():
    if not rate_limit("parking-nearby", 20, 60):
        return jsonify({"error": "Muitas buscas de estacionamento. Aguarde um instante."}), 429
    try:
        lat = float(request.args["lat"]); lon = float(request.args["lon"])
        radius = int(request.args.get("radius", 1400))
    except (KeyError, TypeError, ValueError):
        return jsonify({"error": "Destino inválido."}), 400
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return jsonify({"error": "Destino inválido."}), 400
    items = parking_with_walk_eta(lat, lon, radius=radius, limit=4)
    return jsonify({
        "items": items,
        "source": "openstreetmap/mapbox-poi+mapbox-walking",
        "coverage": "mapped-data",
        "disclaimer": "Estacionamentos usam dados mapeados do OpenStreetMap e, quando necessário, POIs do provedor de mapas. O tempo a pé usa o serviço de rotas quando disponível; não informa vagas livres em tempo real.",
    })

@app.route("/api/live-flow/probe", methods=["POST"])
def api_live_flow_probe():
    if not rate_limit("live-flow-probe", 12, 60):
        return jsonify({"ok": True, "stored": False, "reason": "rate"})
    if not validate_csrf():
        abort(400)
    payload = request.get_json(silent=True) or {}
    if str(payload.get("profile") or "") != "driving":
        return jsonify({"ok": True, "stored": False, "reason": "profile"})
    try:
        lat = float(payload["lat"]); lon = float(payload["lon"])
        speed_kmh = float(payload.get("speed_kmh", 0))
        accuracy = float(payload.get("accuracy", 999))
        heading = payload.get("heading")
    except (KeyError, TypeError, ValueError):
        return jsonify({"error": "Amostra inválida."}), 400
    if not (-90 <= lat <= 90 and -180 <= lon <= 180) or not (0 <= speed_kmh <= 180) or accuracy > 80:
        return jsonify({"ok": True, "stored": False, "reason": "quality"})
    cell_lat, cell_lon = store_flow_probe(lat, lon, speed_kmh, heading)
    return jsonify({
        "ok": True, "stored": True,
        "privacy": "A coordenada exata não é armazenada; somente uma célula aproximada e um identificador efêmero sem user_id.",
        "cell": [cell_lon, cell_lat],
    })

@app.route("/api/road-awareness")
def api_road_awareness():
    if not rate_limit("road-awareness", 45, 60):
        return jsonify({"error": "Muitas consultas de sinalização. Aguarde um instante."}), 429
    try:
        lat = float(request.args["lat"]); lon = float(request.args["lon"])
        radius = int(request.args.get("radius", 320))
    except (KeyError, ValueError):
        return jsonify({"error": "Localização inválida."}), 400
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return jsonify({"error": "Localização inválida."}), 400
    radius = int(clamp(radius, 250, 6500))

    # Radar Intelligence: banco VANO primeiro; fontes remotas somente quando a
    # célula está vencida. A descoberta é persistida para as próximas passagens.
    radar_meta = {"items": [], "stored": 0, "queried_sources": [], "cache_only": True}
    try:
        radar_meta = discover_radars(get_db(), lat, lon, radius, skip_source_names={"openstreetmap"})
    except Exception as exc:
        # Falha de uma fonte pública nunca derruba a navegação. Ainda devolvemos
        # o cache persistido, se existir, e os demais controles viários.
        app.logger.warning("Radar discovery degraded: %s", type(exc).__name__)
        try:
            radar_meta["items"] = query_radars(get_db(), lat, lon, radius)
        except Exception:
            radar_meta["items"] = []

    controls = overpass_road_awareness(lat, lon, radius)
    osm_radars = [x for x in (controls or []) if str(x.get("type") or "") == "speed_camera"]
    non_radar_controls = [x for x in (controls or []) if str(x.get("type") or "") != "speed_camera"]
    try:
        persisted_osm = persist_osm_awareness(get_db(), osm_radars)
        radar_meta["stored"] = int(radar_meta.get("stored") or 0) + int(persisted_osm or 0)
        radar_meta["items"] = query_radars(get_db(), lat, lon, radius)
    except Exception as exc:
        app.logger.debug("OSM radar persistence degraded: %s", type(exc).__name__)
        if not radar_meta.get("items"):
            radar_meta["items"] = osm_radars
    items = list(radar_meta.get("items") or []) + non_radar_controls
    return jsonify({
        "items": items[:220],
        "coverage": "vano-radar-db+official-open-data+openstreetmap",
        "radars": {
            "count": len(radar_meta.get("items") or []),
            "new_or_refreshed": int(radar_meta.get("stored") or 0),
            "queried_sources": radar_meta.get("queried_sources") or [],
            "cache_only": bool(radar_meta.get("cache_only")),
        },
        "disclaimer": "Radares e sinalização dependem das bases públicas disponíveis e podem estar incompletos ou desatualizados. Respeite sempre a sinalização real da via.",
    })


@app.route("/api/radars/sources")
def api_radar_sources():
    """Public diagnostics for coverage; never exposes secrets or user location history."""
    if not rate_limit("radar-sources", 20, 60):
        return jsonify({"error": "Muitas consultas."}), 429
    lat = request.args.get("lat"); lon = request.args.get("lon")
    try:
        lat_v = float(lat) if lat is not None else None
        lon_v = float(lon) if lon is not None else None
    except ValueError:
        return jsonify({"error": "Coordenadas inválidas."}), 400
    return jsonify({"sources": source_catalog(lat_v, lon_v), "database": "vano-radar-db"})


@app.route("/api/support-points")
def api_support_points():
    if not rate_limit("support-points", 18, 60):
        return jsonify({"error": "Muitas buscas de pontos de apoio. Aguarde um instante."}), 429
    try:
        lat = float(request.args["lat"]); lon = float(request.args["lon"])
        radius = int(request.args.get("radius", 1800))
    except (KeyError, ValueError):
        return jsonify({"error": "Localização inválida."}), 400
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return jsonify({"error": "Localização inválida."}), 400
    items = overpass_support_points(lat, lon, radius)
    return jsonify({
        "items": items,
        "coverage": "mapped-data",
        "disclaimer": "São pontos de apoio mapeados, não uma garantia de segurança, funcionamento ou atendimento.",
    })


@app.route("/api/share-route", methods=["POST"])
def create_shared_route():
    if not rate_limit("share_route", 18, 60):
        return jsonify({"error": "Muitos links criados. Aguarde um instante."}), 429
    if not validate_csrf():
        abort(400)
    payload = request.get_json(silent=True) or {}
    route = payload.get("route") or {}
    geometry = route.get("geometry") or {}
    coords = geometry.get("coordinates") or []
    if geometry.get("type") != "LineString" or len(coords) < 2 or len(coords) > 30000:
        return jsonify({"error": "Rota inválida para compartilhamento."}), 400
    try:
        origin = payload.get("origin") or {}; destination = payload.get("destination") or {}
        olat, olon = float(origin["lat"]), float(origin["lon"])
        dlat, dlon = float(destination["lat"]), float(destination["lon"])
    except Exception:
        return jsonify({"error": "Origem ou destino inválidos."}), 400
    if not (-90 <= olat <= 90 and -90 <= dlat <= 90 and -180 <= olon <= 180 and -180 <= dlon <= 180):
        return jsonify({"error": "Coordenadas inválidas."}), 400
    profile = str(payload.get("profile") or route.get("profile") or "walking")[:20]
    if profile not in {"walking", "cycling", "driving", "motorcycle"}: profile = "walking"
    mode = str(payload.get("mode") or "safest")[:20]
    if mode not in {"safest", "fastest", "quietest", "smart"}: mode = "safest"
    # Mantém somente campos necessários para exibir e reutilizar a rota.
    safe_route = {
        "id": 0,
        "distance": float(route.get("distance") or 0),
        "duration": float(route.get("duration") or 0),
        "duration_min": float(route.get("duration_min") or (float(route.get("duration") or 0)/60.0)),
        "geometry": {"type": "LineString", "coordinates": coords},
        "steps": (route.get("steps") or [])[:700],
        "profile": profile,
        "safety_score": float(route.get("safety_score") or 0),
        "safety_level": int(clamp(float(route.get("safety_level") or 3), 0, 5)),
        "safety_level_label": str(route.get("safety_level_label") or "Estimativa")[:80],
        "traffic_score": float(route.get("traffic_score") or 0),
        "traffic_level": str(route.get("traffic_level") or "—")[:40],
        "nearby_alerts": (route.get("nearby_alerts") or [])[:40],
        "risk_zones": (route.get("risk_zones") or [])[:30],
        "road_controls": (route.get("road_controls") or [])[:500],
        "road_controls_count": int(route.get("road_controls_count") or 0),
        "micro_route": bool(route.get("micro_route")),
        "micro_avoided_points": int(route.get("micro_avoided_points") or 0),
        "badges": list(route.get("badges") or [])[:6],
        "routing_provider": str(route.get("routing_provider") or "")[:80],
        "shared": True,
    }
    token = secrets.token_urlsafe(22)
    now = datetime.now(timezone.utc)
    expires = (now + timedelta(days=30)).replace(microsecond=0).isoformat()
    db = get_db()
    db.execute("""
        INSERT INTO shared_routes(token,creator_user_id,origin_label,destination_label,origin_lat,origin_lon,destination_lat,destination_lon,profile,mode,route_json,created_at,expires_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
    """, (token, session.get("user_id"), str(origin.get("label") or "Origem")[:180], str(destination.get("label") or "Destino")[:180], olat, olon, dlat, dlon, profile, mode, json.dumps(safe_route, separators=(",", ":")), now.replace(microsecond=0).isoformat(), expires))
    db.commit()
    url = request.host_url.rstrip("/") + url_for("shared_route_view", token=token)
    return jsonify({"url": url, "token": token, "expires_at": expires})


def get_shared_route_or_404(token):
    if not re.fullmatch(r"[A-Za-z0-9_-]{20,64}", token or ""):
        abort(404)
    row = get_db().execute("SELECT * FROM shared_routes WHERE token=?", (token,)).fetchone()
    if not row:
        abort(404)
    try:
        expires = datetime.fromisoformat(row["expires_at"])
        if expires.tzinfo is None: expires = expires.replace(tzinfo=timezone.utc)
        if expires < datetime.now(timezone.utc): abort(404)
    except ValueError:
        abort(404)
    return row


@app.route("/route/share/<token>")
def shared_route_view(token):
    row = get_shared_route_or_404(token)
    try: route = json.loads(row["route_json"])
    except Exception: abort(404)
    return render_template("shared_route.html", share=row, route=route, mapbox_token=MAPBOX_ACCESS_TOKEN if mapbox_ready() else "", mapbox_style=MAPBOX_STYLE, mapbox_style_night=MAPBOX_STYLE_NIGHT, mapbox_ready=mapbox_ready())


@app.route("/api/shared-route/<token>")
def shared_route_api(token):
    row = get_shared_route_or_404(token)
    try: route = json.loads(row["route_json"])
    except Exception: abort(404)
    return jsonify({
        "token": token, "route": route, "profile": row["profile"], "mode": row["mode"],
        "origin": {"lat": row["origin_lat"], "lon": row["origin_lon"], "label": row["origin_label"]},
        "destination": {"lat": row["destination_lat"], "lon": row["destination_lon"], "label": row["destination_label"]},
    })


@app.route("/route/share/<token>/use")
def use_shared_route(token):
    row = get_shared_route_or_404(token)
    if not session.get("user_id"):
        return redirect(url_for("login", next=url_for("use_shared_route", token=token)))
    db = get_db()
    db.execute("UPDATE shared_routes SET uses_count=uses_count+1 WHERE id=?", (row["id"],))
    try:
        route = json.loads(row["route_json"])
        db.execute("""
            INSERT INTO route_history(user_id,origin_label,destination_label,origin_lat,origin_lon,destination_lat,destination_lon,mode,distance_m,duration_s,safety_score,created_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
        """, (session.get("user_id"), row["origin_label"], row["destination_label"], row["origin_lat"], row["origin_lon"], row["destination_lat"], row["destination_lon"], row["mode"], float(route.get("distance") or 0), float(route.get("duration") or 0), float(route.get("safety_score") or 0), utcnow_iso()))
    except Exception:
        pass
    db.commit()
    return redirect(url_for("index", shared=token))



@app.route("/api/event-route-check", methods=["POST"])
def event_route_check():
    """Proactively detect event pressure and propose a real road detour.

    Venue presence alone never triggers a detour. The engine requires live traffic,
    recent crowd/road reports, or a configured active event feed. This keeps a
    stadium on an ordinary day from changing the route.
    """
    if not validate_csrf():
        abort(400)
    if not VANO_EVENT_INTELLIGENCE_ENABLED:
        return jsonify({"active":False,"enabled":False,"events":[],"recommend":False})
    if not rate_limit("event_route_check", 10, 60):
        return jsonify({"error":"Checagens de evento muito frequentes."}),429
    payload=request.get_json(silent=True) or {}
    try:
        slat=float(payload["current_lat"]);slon=float(payload["current_lon"]);elat=float(payload["destination_lat"]);elon=float(payload["destination_lon"])
    except Exception:
        return jsonify({"error":"Posição atual ou destino inválidos."}),400
    if not (-90<=slat<=90 and -90<=elat<=90 and -180<=slon<=180 and -180<=elon<=180):
        return jsonify({"error":"Coordenadas inválidas."}),400
    direct_km=haversine_m(slat,slon,elat,elon)/1000.0
    if direct_km>VANO_EVENT_SCAN_MAX_KM:
        return jsonify({"active":False,"events":[],"recommend":False,"skipped":"long_distance"})
    profile=str(payload.get("profile") or "driving").strip().lower()
    if profile not in {"driving","motorcycle"}:
        return jsonify({"active":False,"events":[],"recommend":False,"skipped":"non_motorized"})
    mode=str(payload.get("route_mode") or "smart").strip().lower()
    if mode not in {"fastest","safest","smart"}:mode="smart"
    try:
        local_hour=int(payload.get("local_hour",datetime.now().hour));local_hour=local_hour if 0<=local_hour<=23 else None
        current_level=int(clamp(float(payload.get("current_safety_level",3) if payload.get("current_safety_level") is not None else 3),0,5))
    except Exception:
        local_hour,current_level=None,3
    start_bearing=sanitize_start_bearing(payload.get("heading"));start_speed=sanitize_start_speed(payload.get("speed"))
    points=[]
    for raw in (payload.get("route_points") or [])[:8]:
        try:
            lon,lat=float(raw[0]),float(raw[1])
            if -180<=lon<=180 and -90<=lat<=90:
                if not points or haversine_m(lat,lon,points[-1][1],points[-1][0])>15:points.append([lon,lat])
        except Exception:continue
    if not points or haversine_m(slat,slon,points[0][1],points[0][0])>120:points.insert(0,[slon,slat])
    if haversine_m(elat,elon,points[-1][1],points[-1][0])>120:points.append([elon,elat])
    # mapbox_routes_via uses a bounded number of shaping points, so trim evenly.
    if len(points)>8:
        points=[points[round(i*(len(points)-1)/7)] for i in range(8)]
    user_nav=navigation_profile(session.get("user_id"),local_hour,profile)
    extra_excludes=["unpaved"] if (profile=="motorcycle" or user_nav.get("professional_driver")) else None
    try:
        baseline=mapbox_routes_via(points,"now",start_bearing=start_bearing,start_speed=start_speed,reroute=True)
    except Exception:
        try:
            base=mapbox_routes(slon,slat,elon,elat,profile,"now",alternatives=False,extra_excludes=extra_excludes,start_bearing=start_bearing,start_speed=start_speed,reroute=True)
            baseline=base[0] if base else None
        except Exception as exc:
            return jsonify({"error":"Não foi possível verificar o corredor do evento agora.","detail":str(exc)}),502
    if not baseline:
        return jsonify({"active":False,"events":[],"recommend":False})
    bounds=_event_bounds_from_geometry(((baseline.get("geometry") or {}).get("coordinates") or []),.018)
    reports=get_active_reports_for_bounds(*bounds) if bounds else []
    disruptions=route_event_disruptions(baseline,slat,slon,elat,elon,reports=reports)
    clean_events=[{k:v for k,v in ev.items() if k!="avoid_points"} for ev in disruptions]
    if not disruptions:
        return jsonify({"active":False,"events":[],"recommend":False,"message":"Nenhuma pressão de evento relevante foi detectada no corredor."})
    destination_events=[ev for ev in disruptions if ev.get("destination_related")]
    avoidable=[ev for ev in disruptions if not ev.get("destination_related") and not ev.get("origin_related")]
    if not avoidable:
        main=destination_events[0] if destination_events else disruptions[0]
        return jsonify({"active":True,"events":clean_events,"destination_event":bool(destination_events),"recommend":False,"message":f"Movimento intenso perto de {main.get('venue_name') or main.get('name')}. Os acessos finais podem mudar."})
    bypass=build_event_bypass_routes(slon,slat,elon,elat,profile,avoidable,"now",start_bearing=start_bearing,start_speed=start_speed,reroute=True,extra_excludes=extra_excludes)
    base_exp=event_exposure_for_route(baseline,avoidable);base_s=float(baseline.get("duration") or 0);base_effective=base_s+float(base_exp.get("penalty_s") or 0)
    if not bypass:
        return jsonify({"active":True,"events":clean_events,"destination_event":False,"recommend":False,"baseline_duration":base_s,"event_delay_buffer_s":base_exp.get("penalty_s",0),"message":"Movimento de evento detectado, mas nenhuma alternativa confiável ficou disponível agora."})
    ranked=[]
    for raw in bypass:
        exp=event_exposure_for_route(raw,avoidable);duration=float(raw.get("duration") or 10**12);effective=duration+float(exp.get("penalty_s") or 0)
        ranked.append((effective,duration,int(exp.get("penalty_s") or 0),raw,exp))
    ranked.sort(key=lambda x:(x[0],x[1]))
    best_effective,best_s,best_penalty,best_raw,best_exp=ranked[0]
    pressure=max(float(ev.get("pressure_score") or 0) for ev in avoidable)
    effective_saving=max(0.0,base_effective-best_effective);provider_saving=base_s-best_s
    actually_avoids=best_penalty<=max(20,int(base_exp.get("penalty_s") or 0)*.25)
    detour_ok=best_s<=base_s*1.22+45
    recommend=bool(actually_avoids and detour_ok and (effective_saving>=45 or (pressure>=76 and best_s<=base_s+150)))
    candidate=None;auto_apply=False
    if recommend:
        candidate=event_candidate_payload(best_raw,9001,profile,local_hour,user_nav,mode,avoidable)
        candidate["event_variant"]=True;candidate["event_disruptions"]=clean_events;candidate["event_delay_buffer_min"]=round(float(base_exp.get("penalty_s") or 0)/60.0,1);candidate["event_effective_gain_min"]=round(effective_saving/60.0,1)
        safety_ok=(mode=="fastest" or current_level<=1 or int(candidate.get("safety_level") or 0)>=max(1,current_level-1))
        auto_apply=bool(safety_ok and pressure>=68 and (effective_saving>=75 or pressure>=80) and best_s<=base_s*1.18+30)
    main=avoidable[0]
    return jsonify({
        "active":True,"events":clean_events,"destination_event":False,"recommend":recommend,"auto_apply":auto_apply,
        "baseline_duration":round(base_s,1),"baseline_effective_duration":round(base_effective,1),"event_delay_buffer_s":int(base_exp.get("penalty_s") or 0),
        "suggested_duration":round(best_s,1),"suggested_effective_duration":round(best_effective,1),"saving_seconds":round(provider_saving),"effective_saving_seconds":round(effective_saving),"effective_saving_minutes":round(effective_saving/60.0,1),
        "suggestion":{"route":candidate,"kind":"event_detour"} if candidate else None,
        "message":(f"Movimento intenso perto de {main.get('venue_name') or main.get('name')}. O VANO MAPS encontrou um contorno melhor." if recommend else f"Movimento intenso perto de {main.get('venue_name') or main.get('name')}; a rota atual ainda é a melhor opção confiável."),
    })


@app.route("/api/traffic-recommendation", methods=["POST"])
def traffic_recommendation():
    if not validate_csrf():
        abort(400)
    if not rate_limit("traffic_recommendation", 20, 60):
        return jsonify({"error": "Atualização de trânsito em intervalo muito curto."}), 429
    payload = request.get_json(silent=True) or {}
    try:
        clat, clon = float(payload["current_lat"]), float(payload["current_lon"])
        dlat, dlon = float(payload["destination_lat"]), float(payload["destination_lon"])
    except Exception:
        return jsonify({"error": "Posição atual ou destino inválidos."}), 400
    if not (-90 <= clat <= 90 and -90 <= dlat <= 90 and -180 <= clon <= 180 and -180 <= dlon <= 180):
        return jsonify({"error": "Coordenadas inválidas."}), 400
    try:
        current_level = int(clamp(float(payload.get("current_safety_level", 3)), 0, 5))
        local_hour = int(payload.get("local_hour", datetime.now().hour))
        local_hour = local_hour if 0 <= local_hour <= 23 else None
    except Exception:
        current_level, local_hour = 3, None
    route_mode = str(payload.get("route_mode") or "safest").strip().lower()
    fast_eta_only = route_mode == "fastest"
    travel_profile = str(payload.get("profile") or "driving").strip().lower()
    if travel_profile not in {"driving", "motorcycle"}:
        travel_profile = "driving"
    start_bearing = sanitize_start_bearing(payload.get("heading"))
    start_speed = sanitize_start_speed(payload.get("speed"))
    user_nav = navigation_profile(session.get("user_id"), local_hour, travel_profile)
    route_extra_excludes = ["unpaved"] if (travel_profile == "motorcycle" or user_nav["professional_driver"]) else None
    pro_exclusions, pro_exclusion_reasons = (([], []) if fast_eta_only else (professional_exclusion_points(clat, clon, dlat, dlon, local_hour) if user_nav["professional_driver"] else ([], [])))
    future = []
    for point in (payload.get("future_points") or [])[:4]:
        try:
            lon, lat = float(point[0]), float(point[1])
            if -180 <= lon <= 180 and -90 <= lat <= 90:
                future.append([lon, lat])
        except Exception:
            continue
    forced_points = [[clon, clat]] + future + [[dlon, dlat]]
    if fast_eta_only:
        try:
            # Fresh Mapbox traffic-aware alternatives from the current GPS position,
            # expanded by Vano Maps with nearby block/corridor micro-variants.
            baseline_raw = mapbox_routes_via(forced_points, "now", start_bearing=start_bearing, start_speed=start_speed, reroute=True)
            base_routes = mapbox_routes(clon, clat, dlon, dlat, travel_profile, "now", alternatives=True, extra_excludes=route_extra_excludes, start_bearing=start_bearing, start_speed=start_speed, reroute=True)
            if not base_routes:
                raise RuntimeError("Nenhuma rota de trânsito disponível")
            base_routes = ensure_adaptive_route_pool(base_routes, clon, clat, dlon, dlat, "now", target=6, budget=6)
            dense_micro = build_dense_micro_route_pool(base_routes, clon, clat, dlon, dlat, "now", budget=10)
            micro = build_fast_micro_routes(base_routes + dense_micro, clon, clat, dlon, dlat, "now")
            raw_candidates = select_diverse_routes(base_routes + dense_micro + micro, max_routes=13, max_overlap=.985, sort_key=lambda r: float(r.get("duration", 10**12)))
            raw_candidates, _live_direction_guard = apply_start_direction_guard(raw_candidates, start_bearing, start_speed)
            candidates = [fast_route_payload(raw, idx, travel_profile) for idx, raw in enumerate(raw_candidates)]
            baseline = fast_route_payload(baseline_raw, 999, travel_profile)
            best = min(candidates, key=lambda r: float(r.get("duration", 10**12))) if candidates else baseline
            base_s = float(baseline.get("duration") or 0)
            best_s = float(best.get("duration") or base_s)
            saving = max(0.0, base_s - best_s)
            traffic_detected = bool(float(baseline.get("traffic_score") or 0) >= 35 or int(baseline.get("severe_segments") or 0) > 0)
            # V167: avoid route churn. A faster route is only surfaced when the
            # improvement is meaningful enough to be perceived by the driver.
            threshold = 180.0
            recommend = bool(best and route_overlap_ratio(best, baseline) < .95 and saving >= threshold)
            previous_score = payload.get("previous_traffic_score")
            previous_delay = payload.get("previous_delay_min")
            try: score_delta = float(baseline.get("traffic_score") or 0) - float(previous_score) if previous_score is not None else 0.0
            except Exception: score_delta = 0.0
            try: delay_delta = float(baseline.get("traffic_delay_min") or 0) - float(previous_delay) if previous_delay is not None else 0.0
            except Exception: delay_delta = 0.0
            traffic_worsening = bool(previous_score is not None and (score_delta >= 8 or delay_delta >= 1.2))
            return jsonify({
                "traffic_detected": traffic_detected, "mapped_road_detected": False,
                "traffic_level": baseline.get("traffic_level", "Sem dados"),
                "traffic_score": baseline.get("traffic_score", 0),
                "congested_distance_km": baseline.get("congested_distance_km", 0),
                "hotspots": (baseline.get("traffic_corridors") or [])[:8],
                "traffic_delay_min": baseline.get("traffic_delay_min", 0),
                "baseline_duration": base_s, "recommend": recommend,
                "saving_seconds": round(saving), "saving_minutes": max(1, round(saving/60)) if recommend else 0,
                "traffic_worsening": traffic_worsening, "traffic_score_delta": round(score_delta,1), "traffic_delay_delta_min": round(delay_delta,1),
                "fast_eta_only": True,
                "auto_apply": bool(recommend and saving >= 300 and best and best.get("micro_route")),
                "suggestion": {"route": best, "kind": "micro" if best and best.get("micro_route") else "alternative"} if recommend else None,
                "message": (f"Rota mais rápida encontrada: economiza cerca de {max(1,round(saving/60))} min." if recommend else ("Trânsito detectado; nenhuma alternativa ficou realmente mais rápida agora." if traffic_detected else "Fluxo sem ganho de ETA relevante em outra rota.")),
            })
        except Exception as exc:
            return jsonify({"error": "Não foi possível atualizar a rota rápida agora.", "detail": str(exc)}), 502

    try:
        baseline = mapbox_routes_via(forced_points, "now", start_bearing=start_bearing, start_speed=start_speed, reroute=True) if len(forced_points) >= 2 else mapbox_routes(clon, clat, dlon, dlat, travel_profile, "now", alternatives=False, extra_excludes=route_extra_excludes, start_bearing=start_bearing, start_speed=start_speed, reroute=True)[0]
        alternatives = mapbox_routes(
            clon, clat, dlon, dlat, travel_profile, "now",
            exclusions=pro_exclusions if user_nav["professional_driver"] else None,
            alternatives=True, extra_excludes=route_extra_excludes,
            start_bearing=start_bearing, start_speed=start_speed, reroute=True,
        )
        alternatives = ensure_adaptive_route_pool(
            alternatives, clon, clat, dlon, dlat, "now", target=6, budget=6,
            base_exclusions=(pro_exclusions if user_nav["professional_driver"] else None),
            extra_excludes=route_extra_excludes,
        )
        alternatives.extend(build_dense_micro_route_pool(
            [baseline] + alternatives, clon, clat, dlon, dlat, "now", budget=10,
            base_exclusions=(pro_exclusions if user_nav["professional_driver"] else None),
            extra_excludes=route_extra_excludes,
        ))
        exact_live = {}
        for candidate in alternatives:
            sig = route_signature(candidate) or f"anon-{id(candidate)}"
            old_candidate = exact_live.get(sig)
            if old_candidate is None or float(candidate.get("duration") or 10**12) < float(old_candidate.get("duration") or 10**12):
                exact_live[sig] = candidate
        alternatives = sorted(exact_live.values(), key=lambda r: float(r.get("duration") or 10**12))[:14]
        alternatives, _live_direction_guard = apply_start_direction_guard(alternatives, start_bearing, start_speed)
        base_traffic = route_traffic_metrics(baseline)
        # Vano Maps Live Road: além dos gargalos do provedor, tenta contornar apenas
        # obstáculos viários mapeados (obra/barreira/trecho com água) encontrados
        # pelo próprio servidor. Não aceita pontos arbitrários do cliente e não
        # consulta/expõe fiscalização policial.
        mapped_context = overpass_live_road_context(clat, clon, 1200)
        base_geometry = ((baseline or {}).get("geometry") or {}).get("coordinates") or []
        mapped_avoid = []
        for item in mapped_context:
            if not item.get("avoid_candidate") or int(item.get("severity") or 0) < 4:
                continue
            try:
                ilat, ilon = float(item["lat"]), float(item["lon"])
            except Exception:
                continue
            if base_geometry and min_distance_to_geometry_m(ilat, ilon, base_geometry) <= 85:
                mapped_avoid.append([ilon, ilat])
            if len(mapped_avoid) >= 3:
                break
        avoid_points = list(base_traffic.get("traffic_points") or [])[:4]
        for point in mapped_avoid:
            if all(haversine_m(point[1], point[0], p[1], p[0]) > 90 for p in avoid_points):
                avoid_points.append(point)
        if avoid_points:
            try:
                merged_avoid = list(pro_exclusions if user_nav["professional_driver"] else []) + list(avoid_points[:6])
                micro = mapbox_routes(
                    clon, clat, dlon, dlat, travel_profile, "now", merged_avoid[:18], alternatives=False,
                    extra_excludes=route_extra_excludes,
                )
                if micro:
                    micro[0]["_micro_route"] = True
                    micro[0]["_micro_avoided_points"] = min(6, len(avoid_points))
                    micro[0]["_live_road_avoided"] = len(mapped_avoid)
                    alternatives.append(micro[0])
            except Exception:
                pass
    except Exception as exc:
        return jsonify({"error": "Não foi possível atualizar o trânsito agora.", "detail": str(exc)}), 502

    candidates_raw = [baseline] + alternatives[:11]
    all_coords = []
    for r in candidates_raw:
        all_coords.extend((r.get("geometry") or {}).get("coordinates") or [])
    if all_coords:
        lons=[float(c[0]) for c in all_coords if len(c)>=2]; lats=[float(c[1]) for c in all_coords if len(c)>=2]
        pad=.01; min_lat,max_lat=min(lats)-pad,max(lats)+pad; min_lon,max_lon=min(lons)-pad,max(lons)+pad
        reports=get_active_reports_for_bounds(min_lat,min_lon,max_lat,max_lon)
        zones=get_risk_zones_for_bounds(min_lat,min_lon,max_lat,max_lon)
    else:
        reports=[]; zones=[]

    def enrich_live(raw, idx):
        risk=route_risk_metrics(raw,reports,zones,local_hour,travel_profile)
        traffic=route_traffic_metrics(raw)
        flow=route_live_flow_metrics(raw)
        if int(flow.get("live_flow_cells") or 0) > 0:
            provider=float(traffic.get("traffic_score") or 0); live=float(flow.get("live_flow_score") or 0)
            conf=float(flow.get("live_flow_confidence") or 0)/100.0; blend=min(.34,.10+conf*.24)
            combined=provider*(1-blend)+live*blend if provider>0 else live
            traffic["traffic_score_provider"]=round(provider,1)
            traffic["traffic_score"]=round(clamp(combined,0,100),1)
            traffic["traffic_level"]=traffic_level_from_score(traffic["traffic_score"])
        road=route_road_controls(raw)
        professional=professional_route_assessment(raw,risk,road) if user_nav["professional_driver"] else {"professional_ok":True,"professional_flags":[],"exclusion_violations":[]}
        return {
            "id": idx, "distance": raw.get("distance",0), "duration": raw.get("duration",0), "duration_min": round(float(raw.get("duration",0))/60,1),
            "geometry": raw.get("geometry"), "steps": compact_steps(raw), "profile":travel_profile,
            "micro_route": bool(raw.get("_micro_route")), "micro_avoided_points": int(raw.get("_micro_avoided_points",0) or 0),
            "micro_strategy": raw.get("_micro_strategy") or "", "micro_streets": raw.get("_micro_streets") or [],
            "micro_traffic_relief": round(float(raw.get("_micro_traffic_relief") or 0), 1),
            "live_road_avoided": int(raw.get("_live_road_avoided",0) or 0),
            "routing_profile_used": raw.get("_profile_used", "driving-traffic"), "routing_provider": raw.get("_provider", "mapbox"), "route_signature": route_signature(raw),
            **risk, **{k:v for k,v in traffic.items() if k != "traffic_points"}, **flow, **road, **professional,
        }
    base = enrich_live(baseline, 0)
    options=[]
    seen={base["route_signature"]}
    for idx, raw in enumerate(alternatives[:11], start=1):
        item=enrich_live(raw,idx)
        if item["route_signature"] and item["route_signature"] in seen: continue
        seen.add(item["route_signature"]); options.append(item)

    # Segurança é a trava principal. Entre alternativas seguras, o mesmo motor Vano Maps X2
    # equilibra ETA, trânsito, exposição e confiança, em vez de usar só uma soma fixa.
    live_safety_bias = clamp(76 + user_nav["safety_delta"], 0, 100)
    live_traffic_bias = clamp(84 + user_nav["traffic_delta"], 0, 100)
    apply_route_intelligence([base] + options, "driving", safety_bias=live_safety_bias, traffic_bias=live_traffic_bias)
    safety_floor=max(0, max(current_level, int(base.get("safety_level", current_level))))
    base_s=float(base.get("duration") or 0)
    safe_options=[r for r in options if (r.get("professional_ok",True) or not user_nav["professional_driver"]) and int(r.get("safety_level",0)) >= safety_floor and float(r.get("duration") or 1e12) <= max(base_s*(1.12 if user_nav["night_active"] else 1.08), base_s+(150 if user_nav["night_active"] else 90))]
    best=max(safe_options, key=lambda r:(float(r.get("vano_score",0)), -float(r.get("duration",1e12)))) if safe_options else None
    base_traffic_score = float(base.get("traffic_score") or 0)
    if base_traffic_score >= 40:
        live_micro = [r for r in safe_options if r.get("micro_route") and (float(r.get("traffic_score") or 0) <= base_traffic_score - 6 or float(r.get("micro_traffic_relief") or 0) >= 5)]
        if live_micro:
            best=max(live_micro,key=lambda r:(float(r.get("vano_score",0))+min(18.0,max(0.0,base_traffic_score-float(r.get("traffic_score") or 0))*.45),-float(r.get("duration",1e12))))
    saving=max(0, base_s-float(best.get("duration") or base_s)) if best else 0
    # V167: route-change hysteresis. The UI only offers a change from ~3 min,
    # and automatic changes require a stronger ~5 min benefit unless there is a
    # confirmed closure. This reduces ping-pong between two similar corridors.
    threshold=180.0
    traffic_detected=bool(float(base.get("traffic_score",0)) >= 42 or int(base.get("severe_segments",0)) > 0)
    severe_traffic=bool(float(base.get("traffic_score",0)) >= 74 or int(base.get("severe_segments",0)) >= 2)
    closure_detected=bool(int(base.get("closures_count",0) or 0)>0)
    mapped_road_detected=bool(locals().get("mapped_avoid"))
    # Se houver obstáculo viário mapeado sobre o corredor, uma alternativa pode ser
    # oferecida mesmo sem congestionamento, mas continua presa à trava de segurança
    # e a um detour pequeno. Como OSM não é um feed instantâneo, a UI informa isso.
    road_benefit=bool(best and int(best.get("live_road_avoided",0) or 0)>0 and float(best.get("duration") or 1e12) <= base_s*1.08)
    recommend=bool(best and ((traffic_detected and saving >= threshold) or (severe_traffic and saving >= threshold) or (closure_detected and saving >= 60.0) or (mapped_road_detected and road_benefit and saving >= threshold)))
    previous_score = payload.get("previous_traffic_score")
    previous_delay = payload.get("previous_delay_min")
    try: score_delta = float(base.get("traffic_score") or 0) - float(previous_score) if previous_score is not None else 0.0
    except Exception: score_delta = 0.0
    try: delay_delta = float(base.get("traffic_delay_min") or 0) - float(previous_delay) if previous_delay is not None else 0.0
    except Exception: delay_delta = 0.0
    traffic_worsening = bool(previous_score is not None and (score_delta >= 8 or delay_delta >= 1.2))
    auto_apply=bool(recommend and best and best.get("micro_route") and saving>=300.0 and (traffic_worsening or severe_traffic or closure_detected))
    return jsonify({
        "traffic_detected": traffic_detected,
        "severe_traffic": severe_traffic,
        "closure_detected": closure_detected,
        "mapped_road_detected": mapped_road_detected,
        "mapped_road_items": [
            {"type":x.get("type"),"label":x.get("label"),"lat":x.get("lat"),"lon":x.get("lon"),"severity":x.get("severity"),"freshness":x.get("freshness")}
            for x in (locals().get("mapped_context") or []) if x.get("avoid_candidate")
        ][:8],
        "traffic_level": base.get("traffic_level","Sem dados"),
        "traffic_score": base.get("traffic_score",0),
        "congested_distance_km": base.get("congested_distance_km",0),
        "hotspots": (base.get("traffic_corridors") or [])[:8],
        "traffic_delay_min": base.get("traffic_delay_min",0),
        "baseline_duration": base_s,
        "recommend": recommend,
        "auto_apply": auto_apply,
        "traffic_worsening": traffic_worsening,
        "traffic_score_delta": round(score_delta, 1),
        "traffic_delay_delta_min": round(delay_delta, 1),
        "micro_candidates_checked": sum(1 for r in options if r.get("micro_route")),
        "saving_seconds": round(saving),
        "saving_minutes": max(1, round(saving/60)) if recommend else 0,
        "profile_mode": {"professional_driver": bool(user_nav["professional_driver"]), "night_safety_active": bool(user_nav["night_active"]), "hard_exclusions_count": len(pro_exclusions), "reasons": pro_exclusion_reasons},
        "suggestion": {"route": best, "kind": "micro" if best and best.get("micro_route") else "alternative"} if recommend else None,
        "message": (f"Há uma alternativa segura para melhorar o corredor à frente." if recommend and mapped_road_detected and not traffic_detected else (f"Trânsito {str(base.get('traffic_level','')).lower()} à frente. Há uma alternativa segura que economiza cerca de {max(1,round(saving/60))} min." if recommend else (f"Trânsito {str(base.get('traffic_level','')).lower()} detectado; nenhuma alternativa segura melhora o tempo o suficiente." if traffic_detected else ("Há contexto viário mapeado no corredor; nenhuma troca foi aplicada automaticamente." if mapped_road_detected else "Fluxo sem gargalo relevante à frente.")))),
    })


def get_live_trip_or_404(token):
    if not re.fullmatch(r"[A-Za-z0-9_-]{20,64}", token or ""):
        abort(404)
    row = get_db().execute("SELECT * FROM live_trips WHERE token=?", (token,)).fetchone()
    if not row:
        abort(404)
    expires = parse_iso(row["expires_at"])
    if not expires or expires < datetime.now(timezone.utc):
        abort(404)
    return row


@app.route("/api/live-trip", methods=["POST"])
@login_required
def create_live_trip():
    if not validate_csrf():
        abort(400)
    if not rate_limit("live_trip_create", 8, 3600):
        return jsonify({"error": "Muitos compartilhamentos ao vivo criados."}), 429
    payload = request.get_json(silent=True) or {}
    destination_label = str(payload.get("destination_label") or "Destino")[:180]
    try:
        safety_level = int(clamp(float(payload.get("safety_level", 3)), 0, 5))
    except Exception:
        safety_level = 3
    token = secrets.token_urlsafe(24)
    now = datetime.now(timezone.utc).replace(microsecond=0)
    expires = (now + timedelta(hours=6)).isoformat()
    db = get_db()
    db.execute("""
        INSERT INTO live_trips(token,creator_user_id,destination_label,safety_level,created_at,updated_at,expires_at,active)
        VALUES(?,?,?,?,?,?,?,1)
    """, (token, session["user_id"], destination_label, safety_level, now.isoformat(), now.isoformat(), expires))
    db.commit()
    audit("live_trip_created", {"destination": destination_label})
    url = request.host_url.rstrip("/") + url_for("live_trip_view", token=token)
    return jsonify({"token": token, "url": url, "expires_at": expires})


@app.route("/api/live-trip/<token>/update", methods=["POST"])
@login_required
def update_live_trip(token):
    if not validate_csrf():
        abort(400)
    if not rate_limit("live_trip_update", 150, 60):
        return jsonify({"error": "Atualizações rápidas demais."}), 429
    row = get_live_trip_or_404(token)
    if int(row["creator_user_id"]) != int(session["user_id"]):
        abort(403)
    payload = request.get_json(silent=True) or {}
    try:
        lat, lon = float(payload["lat"]), float(payload["lon"])
        accuracy = clamp(float(payload.get("accuracy") or 0), 0, 5000)
        speed = clamp(float(payload.get("speed") or 0), 0, 120)
        heading = float(payload.get("heading")) if payload.get("heading") is not None else None
        progress = clamp(float(payload.get("progress") or 0), 0, 1)
        safety_level = int(clamp(float(payload.get("safety_level", row["safety_level"])), 0, 5))
    except Exception:
        return jsonify({"error": "Posição inválida."}), 400
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return jsonify({"error": "Posição inválida."}), 400
    now = utcnow_iso()
    db = get_db()
    db.execute("""
        UPDATE live_trips SET last_lat=?,last_lon=?,last_accuracy=?,last_speed=?,last_heading=?,route_progress=?,safety_level=?,updated_at=?
        WHERE id=? AND active=1
    """, (lat, lon, accuracy, speed, heading, progress, safety_level, now, row["id"]))
    db.commit()
    return jsonify({"ok": True, "updated_at": now})


@app.route("/api/live-trip/<token>/stop", methods=["POST"])
@login_required
def stop_live_trip(token):
    if not validate_csrf():
        abort(400)
    row = get_live_trip_or_404(token)
    if int(row["creator_user_id"]) != int(session["user_id"]):
        abort(403)
    db = get_db(); db.execute("UPDATE live_trips SET active=0,updated_at=? WHERE id=?", (utcnow_iso(), row["id"])); db.commit()
    audit("live_trip_stopped", {"token_prefix": token[:6]})
    return jsonify({"ok": True})


@app.route("/api/live-trip/<token>")
def live_trip_api(token):
    row = get_live_trip_or_404(token)
    return jsonify({
        "active": bool(row["active"]), "destination_label": row["destination_label"],
        "lat": row["last_lat"], "lon": row["last_lon"], "accuracy": row["last_accuracy"],
        "speed": row["last_speed"], "heading": row["last_heading"], "progress": row["route_progress"],
        "safety_level": row["safety_level"], "updated_at": row["updated_at"], "expires_at": row["expires_at"],
    })


@app.route("/live/<token>")
def live_trip_view(token):
    row = get_live_trip_or_404(token)
    return render_template("live_trip.html", token=token, destination_label=row["destination_label"], mapbox_token=MAPBOX_ACCESS_TOKEN if mapbox_ready() else "", mapbox_style=MAPBOX_STYLE, mapbox_style_night=MAPBOX_STYLE_NIGHT, mapbox_ready=mapbox_ready())


@app.route("/api/telemetry/event", methods=["POST"])
def api_telemetry_event():
    if not validate_csrf():
        abort(400)
    if not rate_limit("telemetry", 240, 60):
        return ("", 429)
    payload = request.get_json(silent=True) or {}
    event_type = str(payload.get("event_type") or "click").strip().lower()
    if event_type not in {"click", "navigation", "ui", "visibility", "search", "route", "alert", "safety", "performance", "gps", "connectivity", "traffic"}:
        event_type = "ui"
    metadata = {
        "target": str(payload.get("target") or "")[:80],
        "element_id": str(payload.get("element_id") or "")[:120],
        "classes": str(payload.get("classes") or "")[:240],
        "label": str(payload.get("label") or "")[:100],
        "href": str(payload.get("href") or "")[:300],
        "page": str(payload.get("page") or request.path)[:300],
    }
    record_activity(event_type, metadata, status_code=204, method="EVENT", path=metadata["page"], endpoint="browser_event")
    return ("", 204)




@app.route("/api/route-feedback", methods=["POST"])
def route_feedback():
    if not validate_csrf():
        abort(400)
    if not rate_limit("route_feedback", 20, 3600):
        return jsonify({"error": "Muitos feedbacks em pouco tempo."}), 429
    payload = request.get_json(silent=True) or {}
    rating = str(payload.get("rating") or "").strip().lower()
    if rating not in {"good", "improve"}:
        return jsonify({"error": "Feedback inválido."}), 400
    mode = str(payload.get("mode") or "safest").strip().lower()
    if mode not in {"fastest", "safest", "smart", "quietest"}:
        mode = "safest"
    profile = str(payload.get("profile") or "walking").strip().lower()
    if profile not in {"walking", "cycling", "driving", "motorcycle"}:
        profile = "walking"
    try:
        progress = clamp(float(payload.get("progress") or 0), 0, 1)
        duration_s = clamp(float(payload.get("duration_s") or 0), 0, 7 * 24 * 3600)
        distance_m = clamp(float(payload.get("distance_m") or 0), 0, 2_000_000)
    except Exception:
        progress, duration_s, distance_m = 0, 0, 0
    signature = str(payload.get("route_signature") or "")[:180]
    db = get_db()
    db.execute(
        """INSERT INTO route_feedback(user_id,route_signature,rating,mode,profile,progress,duration_s,distance_m,created_at)
           VALUES(?,?,?,?,?,?,?,?,?)""",
        (session.get("user_id"), signature, rating, mode, profile, progress, duration_s, distance_m, utcnow_iso()),
    )
    db.commit()
    return jsonify({"ok": True})


