"""VANO safety and route intelligence.

Extracted from the historical monolithic app.py without changing route bodies or
business rules. Runtime dependencies are injected once during application startup.
"""
from vano.bootstrap import inject as _vano_inject
_vano_inject(globals())
del _vano_inject

def report_author_weight(user_id):
    """Small anti-abuse weight based only on admin-rejected prior reports.

    New/community users start at full weight. A history of confirmed false reports
    gradually reduces the impact of future reports without exposing identity.
    """
    if not user_id:
        return 1.0
    try:
        row = get_db().execute("SELECT COUNT(*) total,SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END) rejected FROM reports WHERE user_id=?", (user_id,)).fetchone()
        total = int((row["total"] if row else 0) or 0); rejected = int((row["rejected"] if row else 0) or 0)
        if total < 3 or rejected < 1: return 1.0
        return round(clamp(1.0 - (rejected/max(3,total))*.72, .55, 1.0), 3)
    except Exception:
        return 1.0


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def haversine_m(lat1, lon1, lat2, lon2):
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def point_to_segment_distance_m(lat, lon, a_lon, a_lat, b_lon, b_lat):
    """Distância aproximada ponto-segmento em metros usando projeção local.

    Para navegação urbana isso é bem mais estável do que medir somente a distância
    aos vértices da polyline e evita falsos desvios em trechos longos e retos.
    """
    ref_lat = math.radians(float(lat))
    mx = 111320.0 * max(0.15, math.cos(ref_lat))
    my = 110540.0
    ax, ay = (float(a_lon) - float(lon)) * mx, (float(a_lat) - float(lat)) * my
    bx, by = (float(b_lon) - float(lon)) * mx, (float(b_lat) - float(lat)) * my
    vx, vy = bx - ax, by - ay
    vv = vx * vx + vy * vy
    if vv <= 1e-9:
        return math.hypot(ax, ay)
    # Ponto consultado é a origem (0,0) no plano local.
    t = clamp((-(ax * vx + ay * vy)) / vv, 0.0, 1.0)
    px, py = ax + vx * t, ay + vy * t
    return math.hypot(px, py)


def min_distance_to_geometry_m(lat, lon, coords):
    if not coords:
        return 10**9
    if len(coords) == 1:
        try:
            return haversine_m(lat, lon, float(coords[0][1]), float(coords[0][0]))
        except Exception:
            return 10**9
    # Mantém custo previsível em rotas enormes, mas mede segmentos em vez de só pontos.
    stride = max(1, (len(coords) - 1) // 1600)
    best = 10**9
    for i in range(0, len(coords) - 1, stride):
        j = min(len(coords) - 1, i + stride)
        try:
            a, b = coords[i], coords[j]
            d = point_to_segment_distance_m(lat, lon, a[0], a[1], b[0], b[1])
            if d < best:
                best = d
        except Exception:
            continue
    return best


def parse_iso(value):
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def safety_level_from_score(score):
    score = float(score or 0)
    if score >= 86: return 5
    if score >= 70: return 4
    if score >= 50: return 3
    if score >= 32: return 2
    if score >= 15: return 1
    return 0


def safety_level_label(level):
    return {
        5: "Muito favorável",
        4: "Favorável",
        3: "Atenção",
        2: "Cautela elevada",
        1: "Risco alto",
        0: "Evite se possível",
    }.get(int(level), "Atenção")


def zone_active_for_hour(zone, local_hour):
    if local_hour is None or zone["start_hour"] is None or zone["end_hour"] is None:
        return True
    start_h, end_h = int(zone["start_hour"]), int(zone["end_hour"])
    if start_h == end_h:
        return True
    if start_h < end_h:
        return start_h <= local_hour < end_h
    return local_hour >= start_h or local_hour < end_h


def _risk_profile_factor(category, travel_profile, local_hour=None):
    """Ajusta somente o tipo de exposição da viagem; nunca usa perfil demográfico."""
    personal = category in {"robbery", "harassment", "poor_lighting"}
    road = category in {"accident", "flood", "construction"}
    if travel_profile == "walking":
        factor = 1.20 if personal else 0.92 if road else 1.0
    elif travel_profile == "cycling":
        factor = 1.05 if personal else 1.12 if road else 1.0
    elif travel_profile == "motorcycle":
        # Motorcycles use the motorized road graph, but road-surface, crash,
        # construction and flood exposure matters more than it does in a car.
        factor = 0.88 if personal else 1.38 if road else 1.05
    else:  # driving
        factor = 0.78 if personal else 1.22 if road else 1.0
    if category == "poor_lighting" and local_hour is not None and (local_hour >= 18 or local_hour <= 6):
        factor *= 1.18 if travel_profile == "motorcycle" else (1.35 if travel_profile != "driving" else 1.12)
    return factor


def _risk_corridor_radius(category, severity, travel_profile):
    base = {
        "robbery": 460, "harassment": 360, "poor_lighting": 310,
        "accident": 245, "flood": 330, "construction": 210,
        "crowd": 190, "other": 240,
    }.get(category, 240)
    base *= .92 + clamp(float(severity), 1, 5) * .035
    if travel_profile == "driving" and category in {"accident", "flood", "construction"}:
        base *= 1.12
    elif travel_profile == "motorcycle" and category in {"accident", "flood", "construction"}:
        base *= 1.20
    return clamp(base, 150, 620)


def route_risk_metrics(route, reports, risk_zones=None, local_hour=None, travel_profile="walking"):
    """Vano Maps Safety Engine v3.

    O motor separa quatro ideias que antes ficavam misturadas:
    1) intensidade do evento/risco observado;
    2) quanto do corredor da rota fica exposto;
    3) hotspots concentrados (pior trecho);
    4) incerteza/cobertura dos dados.

    Isso evita dois erros comuns: uma rota longa ser punida só por ter mais pontos e
    uma rota sem relatos receber automaticamente nota 100.
    """
    coords = route.get("geometry", {}).get("coordinates", [])
    route_length_m = max(float(route.get("distance") or 0), 1.0)
    distance_km = route_length_m / 1000.0
    duration_min = float(route.get("duration", 0)) / 60.0
    now = datetime.now(timezone.utc)

    nearby = []
    zone_hits = []
    risk_factors = []
    level_cap = 5
    quiet_penalty = 0.0
    weighted_exposure_m = 0.0
    zone_exposure_m = 0.0
    hotspot_risk = 0.0
    high_signal_count = 0
    evidence_strength = 0.0
    confirmations_total = 0
    dimension_exposure = {"personal": 0.0, "road": 0.0, "context": 0.0}

    for report in reports:
        category = report["category"]
        severity_i = int(clamp(int(report["severity"]), 1, 5))
        radius = _risk_corridor_radius(category, severity_i, travel_profile)
        d = min_distance_to_geometry_m(report["latitude"], report["longitude"], coords)
        if d > radius + 260:
            continue

        created = parse_iso(report["created_at"]) or now
        age_hours = max(0.0, (now - created).total_seconds() / 3600)
        # Eventos recentes têm mais peso, mas não desaparecem abruptamente.
        freshness = math.exp(-age_hours / (24 * 7.0))
        proximity = max(0.0, 1.0 - (d / max(radius, 1))) ** 1.55
        severity = severity_i / 5.0
        confirmations = min(int(report["confirmations"] or 0), 12)
        confirmations_total += confirmations
        absence_votes = min(int(report.get("absence_votes") or 0), 8) if isinstance(report, dict) else 0
        confirmation_factor = (0.90 + min(.55, confirmations * .055)) * max(.42, 1.0 - absence_votes*.15)
        meta = CATEGORY_META.get(category, CATEGORY_META["other"])
        profile_factor = _risk_profile_factor(category, travel_profile, local_hour)
        quiet_time_factor = 1.20 if local_hour is not None and category == "crowd" and 16 <= local_hour <= 23 else 1.0

        strength = severity * float(meta["weight"]) * freshness * confirmation_factor * profile_factor
        event_risk = clamp(58.0 * strength * proximity, 0, 100)
        hotspot_risk = max(hotspot_risk, event_risk)
        if event_risk >= 24:
            high_signal_count += 1

        if d < radius:
            # Aproxima o comprimento do corredor atravessado pelo raio do evento.
            chord = 2.0 * math.sqrt(max(0.0, radius * radius - d * d))
            exposure = chord * clamp(.30 + strength * .70, .18, 1.70)
            weighted_exposure_m += exposure
            dim = "personal" if category in {"robbery", "harassment", "poor_lighting"} else "road" if category in {"accident", "road_block", "road_hazard", "pothole", "stopped_vehicle", "object_on_road", "broken_signal", "flood", "construction"} else "context"
            dimension_exposure[dim] += exposure

        quiet_penalty += 13.0 * severity * float(meta["quiet"]) * freshness * max(.08, proximity) * confirmation_factor * quiet_time_factor
        evidence_strength += clamp(event_risk / 42.0, 0.05, 1.5)

        if category == "robbery" and d <= 300 and severity_i >= 4 and confirmations >= 2 and freshness >= .20:
            level_cap = min(level_cap, 3)
            risk_factors.append("Relatos recentes e confirmados de roubo/furto próximos ao corredor")
        if category == "harassment" and d <= 220 and severity_i >= 4 and confirmations >= 2 and freshness >= .25 and travel_profile != "driving":
            level_cap = min(level_cap, 3)
            risk_factors.append("Relatos recentes e confirmados de assédio/importunação próximos")
        if category == "poor_lighting" and local_hour is not None and (local_hour >= 18 or local_hour <= 6) and d <= 180 and travel_profile != "driving":
            risk_factors.append("Trecho com iluminação ruim reportada no período noturno")
        if category == "flood" and d <= 180 and severity_i >= 4:
            risk_factors.append("Alagamento relevante reportado próximo da rota")

        if d <= min(430, radius + 80):
            nearby.append({
                "id": report["id"], "category": category, "category_label": meta["label"],
                "title": report["title"], "severity": severity_i,
                "distance_to_route_m": round(d), "created_at": report["created_at"],
                "lat": float(report["latitude"]), "lon": float(report["longitude"]),
                "confirmations": confirmations, "risk_strength": round(event_risk, 1),
            })

    zone_hotspot = 0.0
    for zone in (risk_zones or []):
        if not zone_active_for_hour(zone, local_hour):
            continue
        radius = clamp(float(zone["radius_m"] or 350), 80, 5000)
        d = min_distance_to_geometry_m(float(zone["latitude"]), float(zone["longitude"]), coords)
        if d > radius + 420:
            continue
        confidence = clamp(float(zone["confidence"] or .75), 0.0, 1.0)
        if d <= radius:
            cap = int(clamp(int(zone["level_cap"] if zone["level_cap"] is not None else 3), 0, 5))
            level_cap = min(level_cap, cap)
            proximity = max(.10, 1.0 - d / max(radius, 1))
            zone_event_risk = clamp(72.0 * confidence * (proximity ** 1.25), 0, 100)
            zone_hotspot = max(zone_hotspot, zone_event_risk)
            chord = 2.0 * math.sqrt(max(0.0, radius * radius - d * d))
            zone_exposure_m += chord * clamp(confidence, .2, 1.0)
            evidence_strength += .75 + confidence
            zone_hits.append({
                "id": zone["id"], "name": zone["name"], "risk_type": zone["risk_type"],
                "level_cap": cap, "distance_to_route_m": round(d), "source": zone["source"],
                "lat": float(zone["latitude"]), "lon": float(zone["longitude"]),
                "radius_m": round(radius), "confidence": round(confidence, 2),
            })
            risk_factors.append(f"Zona de atenção verificada: {zone['name']}")

    exposure_ratio = clamp(weighted_exposure_m / route_length_m, 0.0, 2.2)
    zone_ratio = clamp(zone_exposure_m / route_length_m, 0.0, 1.8)
    exposure_risk = clamp(exposure_ratio * 50.0, 0, 100)
    zone_risk = clamp(zone_ratio * 62.0, 0, 100)
    cluster_risk = clamp((high_signal_count / max(distance_km, .8)) * 11.0, 0, 55)
    hotspot_risk = max(hotspot_risk, zone_hotspot)

    observed_risk = clamp(
        exposure_risk * .46 + hotspot_risk * .34 + zone_risk * .14 + cluster_risk * .06,
        0, 99,
    )
    observed_safety = clamp(100.0 - observed_risk, 1.0, 100.0)

    # Confiança é evidência, não ausência de ocorrências. Sem dados suficientes o
    # motor converge para um prior conservador em vez de declarar a rota "100 segura".
    # Rotas longas exigem mais evidência para atingir a mesma confiança. Um único
    # relato não deve fazer o motor parecer igualmente informado em 800 m e 20 km.
    evidence_density = evidence_strength / max(1.0, math.sqrt(max(distance_km, .6)))
    data_confidence = clamp(
        30.0 + math.log1p(evidence_density) * 23.0 + min(15.0, confirmations_total * .85),
        30.0, 93.0,
    )
    conf_norm = clamp((data_confidence - 30.0) / 63.0, 0.0, 1.0)
    blend = .28 + .72 * conf_norm
    neutral_prior = 58.0
    uncertainty_penalty = max(0.0, 58.0 - data_confidence) * .09
    safety_score = clamp(neutral_prior + (observed_safety - neutral_prior) * blend - uncertainty_penalty, 1.0, 100.0)
    conservative_score = clamp(safety_score - max(0.0, 68.0 - data_confidence) * .12, 1.0, 100.0)

    if data_confidence < 42:
        level_cap = min(level_cap, 3)
    elif data_confidence < 58:
        level_cap = min(level_cap, 4)

    safety_level = min(safety_level_from_score(safety_score), level_cap)
    confidence_label = "alta" if data_confidence >= 78 else "média" if data_confidence >= 56 else "limitada"
    quiet_score = clamp(100.0 - quiet_penalty, 1.0, 100.0)

    def dim_score(value):
        return round(clamp((value / route_length_m) * 55.0, 0, 100), 1)

    return {
        "risk": round(observed_risk, 2),
        "observed_safety_score": round(observed_safety, 1),
        "safety_score": round(safety_score, 1),
        "safety_conservative_score": round(conservative_score, 1),
        "safety_level": int(safety_level),
        "safety_level_label": safety_level_label(safety_level),
        "data_confidence": round(data_confidence),
        "data_confidence_label": confidence_label,
        "uncertainty_penalty": round(uncertainty_penalty, 1),
        "risk_exposure_pct": round(clamp(exposure_ratio * 100.0, 0, 100), 1),
        "hotspot_risk": round(hotspot_risk, 1),
        "cluster_risk": round(cluster_risk, 1),
        "risk_profile": {k: dim_score(v) for k, v in dimension_exposure.items()},
        "evidence_count": len(nearby) + len(zone_hits),
        "evidence_density": round(evidence_density, 3),
        "quiet_score": round(quiet_score, 1),
        "distance_km": round(distance_km, 2),
        "duration_min": round(duration_min),
        "nearby_alerts": sorted(nearby, key=lambda x: (-x.get("risk_strength", 0), x["distance_to_route_m"]))[:14],
        "risk_zones": sorted(zone_hits, key=lambda x: (x["distance_to_route_m"], -x["confidence"]))[:10],
        "risk_factors": list(dict.fromkeys(risk_factors))[:7],
        "safety_engine": "rairo-safety-v3",
    }


def apply_route_intelligence(routes, travel_profile="walking", safety_bias=68, traffic_bias=60):
    """Enriquece alternativas com um score comparável (0-100).

    Não é um modelo opaco: é um motor de decisão explicável que normaliza tempo,
    segurança, trânsito, detour e confiança entre as alternativas daquela viagem.
    """
    if not routes:
        return routes
    safety_bias = clamp(float(safety_bias), 0, 100)
    traffic_bias = clamp(float(traffic_bias), 0, 100)
    fastest = min(max(float(r.get("duration") or 0), 1.0) for r in routes)
    shortest = min(max(float(r.get("distance") or 0), 1.0) for r in routes)
    max_traffic = max([float(r.get("traffic_score") or 0) for r in routes] + [1.0])

    # Pesos adaptativos. Segurança nunca vai a zero, mesmo se o usuário costuma escolher rápido.
    w_safety = 0.34 + (safety_bias / 100.0) * 0.25
    w_time = 0.38 - (safety_bias / 100.0) * 0.16
    w_traffic = (0.04 + (traffic_bias / 100.0) * 0.11) if is_motorized_profile(travel_profile) else 0.02
    w_detour = 0.08
    w_conf = 0.07
    total_w = w_safety + w_time + w_traffic + w_detour + w_conf

    for r in routes:
        duration = max(float(r.get("duration") or 0), 1.0)
        distance = max(float(r.get("distance") or 0), 1.0)
        safety = clamp(float(r.get("safety_conservative_score", r.get("safety_score")) or 0), 0, 100)
        eta_score = clamp(100.0 * fastest / duration, 45, 100)
        detour_score = clamp(100.0 - max(0.0, distance / shortest - 1.0) * 150.0, 45, 100)
        traffic_score = 100.0 - clamp(float(r.get("traffic_score") or 0), 0, 100)
        confidence = clamp(float(r.get("data_confidence") or 40), 0, 100)
        incident_penalty = min(24.0, int(r.get("incidents_count") or 0) * 4.0 + int(r.get("closures_count") or 0) * 9.0)
        low_safety_penalty = max(0, 3 - int(r.get("safety_level") or 0)) * 8.0
        raw = (
            safety * w_safety + eta_score * w_time + traffic_score * w_traffic +
            detour_score * w_detour + confidence * w_conf
        ) / total_w
        rairo_score = clamp(raw - incident_penalty - low_safety_penalty, 0, 100)
        reasons = []
        if safety >= 82: reasons.append("boa leitura de segurança")
        elif int(r.get("safety_level") or 0) <= 2: reasons.append("atenção elevada no corredor")
        if eta_score >= 96: reasons.append("ETA competitivo")
        if is_motorized_profile(travel_profile) and float(r.get("traffic_score") or 0) >= 55: reasons.append("trânsito relevante")
        if travel_profile == "motorcycle" and int(r.get("incidents_count") or 0) + int(r.get("closures_count") or 0) > 0: reasons.append("atenção extra para moto")
        if float(r.get("distance") or 0) > shortest * 1.18: reasons.append("desvio maior")
        if r.get("micro_route"): reasons.append("micro-rota anti-gargalo")
        r["rairo_score"] = round(rairo_score, 1)
        r["decision_confidence"] = round(clamp(confidence * 0.72 + 24, 35, 95))
        r["score_breakdown"] = {
            "safety": round(safety, 1), "eta": round(eta_score, 1),
            "traffic": round(traffic_score, 1), "detour": round(detour_score, 1),
            "data": round(confidence, 1),
        }
        r["decision_reasons"] = reasons[:4]
    return routes


def learned_route_biases(user_id):
    """Deriva preferências suaves do histórico recente do próprio usuário.

    Não tenta inferir atributos pessoais; somente pondera os modos de rota que a
    conta vem escolhendo. O efeito é limitado para não sacrificar segurança.
    """
    if not user_id:
        return {"safety_bias": 68.0, "traffic_bias": 62.0, "samples": 0}
    try:
        rows = get_db().execute(
            "SELECT mode FROM route_history WHERE user_id=? ORDER BY created_at DESC LIMIT 36",
            (user_id,),
        ).fetchall()
    except Exception:
        return {"safety_bias": 68.0, "traffic_bias": 62.0, "samples": 0}
    if not rows:
        return {"safety_bias": 68.0, "traffic_bias": 62.0, "samples": 0}
    counts = {"safest": 0, "fastest": 0, "smart": 0, "quietest": 0}
    # Recência: as escolhas mais novas pesam um pouco mais.
    weighted = {k: 0.0 for k in counts}
    for i, row in enumerate(rows):
        mode = str(row["mode"] or "").lower()
        if mode not in counts:
            continue
        counts[mode] += 1
        weighted[mode] += max(.35, 1.0 - i * .018)
    total = max(sum(weighted.values()), 1.0)
    safe_share = (weighted["safest"] + weighted["quietest"] * .55 + weighted["smart"] * .28) / total
    fast_share = weighted["fastest"] / total
    smart_share = weighted["smart"] / total
    safety = clamp(64 + safe_share * 23 - fast_share * 12, 52, 90)
    traffic = clamp(57 + smart_share * 21 + fast_share * 8, 48, 88)
    return {
        "safety_bias": round(safety, 1), "traffic_bias": round(traffic, 1),
        "samples": len(rows), "mode_counts": counts,
    }


def navigation_profile(user_id=None, local_hour=None, travel_profile="walking"):
    """Return routing preferences without inferring risk from demographic attributes.

    `sex` and `age` may be stored as profile information, but routing decisions use
    explicit safety preferences, time of day, trip mode and objective road/risk data.
    """
    profile = {
        "professional_driver": False,
        "night_safety": False,
        "night_active": False,
        "route_preference": "balanced",
        "safety_delta": 0.0,
        "traffic_delta": 0.0,
        "strict_constraints": False,
    }
    if not user_id:
        return profile
    try:
        row = get_db().execute(
            "SELECT is_app_driver,night_safety_mode,route_preference FROM users WHERE id=?",
            (int(user_id),),
        ).fetchone()
    except Exception:
        row = None
    if not row:
        return profile
    professional = bool(row["is_app_driver"]) and travel_profile == "driving"
    night_enabled = bool(row["night_safety_mode"])
    night_active = bool(local_hour is not None and (local_hour >= 19 or local_hour <= 5) and night_enabled)
    pref = str(row["route_preference"] or "balanced")
    if pref not in {"balanced", "safety_first", "fast_first"}:
        pref = "balanced"
    safety_delta = {"balanced": 0, "safety_first": 11, "fast_first": -7}[pref]
    traffic_delta = {"balanced": 0, "safety_first": -2, "fast_first": 8}[pref]
    if night_active:
        # Safety rises, but ETA/traffic remain relevant: this is a balanced night mode.
        safety_delta += 14
        traffic_delta += 4
    if professional:
        safety_delta += 10
        traffic_delta += 5
    profile.update({
        "professional_driver": professional,
        "night_safety": night_enabled,
        "night_active": night_active,
        "route_preference": pref,
        "safety_delta": float(safety_delta),
        "traffic_delta": float(traffic_delta),
        "strict_constraints": professional,
    })
    return profile


def _objective_risk_zone(zone):
    """Only objective/verified hazard types may become hard routing exclusions.

    Community labels (including favela/slum terminology) are deliberately not used
    as a proxy for danger. The engine needs incident/access evidence instead.
    """
    text = " ".join([str(zone["risk_type"] or ""), str(zone["name"] or ""), str(zone["source"] or "")]).lower()
    disallowed_proxy_terms = {"favela", "slum", "comunidade", "community", "periferia"}
    if any(term in text for term in disallowed_proxy_terms):
        return False
    allowed = {
        "verified_incident_area", "repeated_incident_corridor", "road_hazard",
        "access_restriction", "flood", "construction", "closure", "poor_road",
        "robbery_cluster", "accident_cluster",
    }
    return str(zone["risk_type"] or "").lower() in allowed


def verified_safety_avoidance_points(reports, risk_zones, local_hour=None, travel_profile="driving", max_points=12):
    """Return only high-confidence, objective hazards suitable for safest-route variants.

    Neighborhood identity, favela/community labels and demographics are never used as
    risk proxies. Points come from verified incident zones or sufficiently severe,
    confirmed and recent event reports.
    """
    now = datetime.now(timezone.utc)
    candidates = []
    for zone in (risk_zones or []):
        if not _objective_risk_zone(zone) or not zone_active_for_hour(zone, local_hour):
            continue
        confidence = clamp(float(zone["confidence"] or 0), 0, 1)
        cap = int(clamp(int(zone["level_cap"] if zone["level_cap"] is not None else 5), 0, 5))
        if confidence < .72 or cap > 2:
            continue
        candidates.append({
            "point": [float(zone["longitude"]), float(zone["latitude"])],
            "score": (5-cap)*20 + confidence*35,
            "reason": str(zone["name"] or "zona verificada")[:120],
            "kind": str(zone["risk_type"] or "verified_zone"),
        })
    allowed_reports = {"robbery", "flood", "accident", "construction", "poor_lighting"}
    for report in (reports or []):
        category = str(report["category"] or "").lower()
        if category not in allowed_reports:
            continue
        severity = int(clamp(int(report["severity"] or 0), 1, 5))
        confirmations = int(report["confirmations"] or 0)
        created = parse_iso(report["created_at"]) or now
        age_h = max(0.0, (now-created).total_seconds()/3600.0)
        freshness = math.exp(-age_h/(24*7.0))
        # Personal safety requires confirmation; road hazards may be urgent even with
        # fewer reports when severity is maximal.
        if category in {"robbery", "poor_lighting"}:
            if severity < 4 or confirmations < 2 or freshness < .18:
                continue
            if category == "poor_lighting" and not (local_hour is not None and (local_hour >= 18 or local_hour <= 6)):
                continue
        else:
            if severity < 4 or (confirmations < 1 and severity < 5) or freshness < .12:
                continue
        score = severity*14 + min(confirmations, 10)*3.5 + freshness*22
        if is_motorized_profile(travel_profile) and category in {"flood", "accident", "construction"}:
            score += 10 if travel_profile == "motorcycle" else 8
        candidates.append({
            "point": [float(report["longitude"]), float(report["latitude"])],
            "score": score,
            "reason": str(report["title"] or CATEGORY_META.get(category, CATEGORY_META["other"])["label"])[:120],
            "kind": category,
        })
    candidates.sort(key=lambda x: -x["score"])
    out = []
    for item in candidates:
        lon, lat = item["point"]
        if any(haversine_m(lat, lon, p["point"][1], p["point"][0]) < 220 for p in out):
            continue
        out.append(item)
        if len(out) >= max_points:
            break
    return out


def build_safety_bypass_routes(base_routes, start_lon, start_lat, end_lon, end_lat, avoidance_points, depart_at="now", budget=5):
    """Ask the road provider for variants around verified hazards, then score them normally.

    Point exclusions are best-effort, so every returned candidate still goes through
    Safety Engine scoring. This only expands the candidate pool; it never declares a
    street safe because of neighborhood identity or missing data.
    """
    if not base_routes or not avoidance_points:
        return []
    fastest_s = max(1.0, min(float(r.get("duration") or 10**12) for r in base_routes))
    top = list(avoidance_points)[:6]
    specs = []
    for item in top[:3]:
        specs.append([item])
    if len(top) >= 2:
        specs.append(top[:2])
    if len(top) >= 3:
        specs.append(top[:3])
    specs = specs[:max(1, min(6, int(budget or 5)))]

    def fetch(group):
        try:
            found = mapbox_routes(
                start_lon, start_lat, end_lon, end_lat, "driving", depart_at,
                exclusions=[x["point"] for x in group], alternatives=False,
                extra_excludes=None,
            )
            if not found:
                return None
            candidate = found[0]
            if float(candidate.get("duration") or 10**12) > fastest_s*1.58:
                return None
            candidate["_safety_variant"] = True
            candidate["_safety_avoided_points"] = len(group)
            candidate["_safety_avoid_reasons"] = [x["reason"] for x in group][:3]
            return candidate
        except Exception:
            return None

    with ThreadPoolExecutor(max_workers=min(5, len(specs))) as pool:
        fetched = list(pool.map(fetch, specs))
    seen = {route_signature(r) for r in base_routes}
    out = []
    for candidate in fetched:
        if not candidate:
            continue
        sig = route_signature(candidate)
        if sig and sig in seen:
            continue
        seen.add(sig)
        out.append(candidate)
    return out[:budget]


def professional_exclusion_points(start_lat, start_lon, end_lat, end_lon, local_hour=None):
    """Build hard-avoid points from verified hazards, never neighborhood identity."""
    pad = max(.035, min(.16, haversine_m(start_lat, start_lon, end_lat, end_lon) / 1000.0 / 900.0))
    min_lat, max_lat = min(start_lat, end_lat)-pad, max(start_lat, end_lat)+pad
    min_lon, max_lon = min(start_lon, end_lon)-pad, max(start_lon, end_lon)+pad
    line = [[float(start_lon), float(start_lat)], [float(end_lon), float(end_lat)]]
    points, reasons = [], []
    now = datetime.now(timezone.utc)
    try:
        zones = get_risk_zones_for_bounds(min_lat, min_lon, max_lat, max_lon)
    except Exception:
        zones = []
    for zone in zones:
        if not _objective_risk_zone(zone) or not zone_active_for_hour(zone, local_hour):
            continue
        confidence = float(zone["confidence"] or 0)
        cap = int(zone["level_cap"] if zone["level_cap"] is not None else 5)
        if confidence < .78 or cap > 2:
            continue
        lat, lon = float(zone["latitude"]), float(zone["longitude"])
        if min(haversine_m(lat, lon, start_lat, start_lon), haversine_m(lat, lon, end_lat, end_lon)) < 260:
            continue
        if min_distance_to_geometry_m(lat, lon, line) > 2600:
            continue
        points.append((lon, lat))
        reasons.append(f"Zona verificada: {zone['name']}")
        if len(points) >= 12:
            break
    try:
        reports = get_active_reports_for_bounds(min_lat, min_lon, max_lat, max_lon)
    except Exception:
        reports = []
    for report in reports:
        if len(points) >= 18:
            break
        category = str(report["category"] or "")
        if category not in {"flood", "construction", "accident", "robbery", "road_block", "object_on_road"}:
            continue
        severity = int(report["severity"] or 0)
        confirmations = int(report["confirmations"] or 0)
        if severity < 4 or confirmations < 2:
            continue
        created = parse_iso(report["created_at"]) or now
        age_h = max(0.0, (now-created).total_seconds()/3600.0)
        ttl = 96 if category in {"flood", "construction", "accident"} else 24*7
        if age_h > ttl:
            continue
        lat, lon = float(report["latitude"]), float(report["longitude"])
        if min(haversine_m(lat, lon, start_lat, start_lon), haversine_m(lat, lon, end_lat, end_lon)) < 220:
            continue
        if min_distance_to_geometry_m(lat, lon, line) > 1800:
            continue
        points.append((lon, lat))
        reasons.append(f"Alerta confirmado: {CATEGORY_META.get(category, CATEGORY_META['other'])['label']}")
    # de-duplicate close points to avoid wasting Mapbox's exclusion quota
    dedup=[]
    for lon,lat in points:
        if all(haversine_m(lat,lon,py,px) > 180 for px,py in dedup):
            dedup.append((lon,lat))
    return dedup[:18], list(dict.fromkeys(reasons))[:8]


def route_exclusion_violations(route):
    notifications = list(route.get("notifications") or [])
    for leg in route.get("legs", []) or []:
        notifications.extend(leg.get("notifications") or [])
    violations=[]
    for item in notifications:
        if str(item.get("type") or "") != "violation":
            continue
        subtype = str(item.get("subtype") or "")
        if subtype in {"pointExclusion", "unpaved", "maxWidth", "maxWeight", "maxHeight"}:
            violations.append(subtype)
    return violations


def professional_route_assessment(route, metrics, road):
    """Hard constraints for professional driving based on objective route evidence."""
    flags=[]
    blocking=False
    violations = route_exclusion_violations(route)
    if violations:
        blocking=True
        flags.append("Uma exclusão obrigatória não pôde ser respeitada")
    if int(road.get("closures_count") or 0) > 0:
        blocking=True
        flags.append("Fechamento viário detectado")
    for z in metrics.get("risk_zones", []) or []:
        if int(z.get("level_cap", 5)) <= 2 and float(z.get("confidence", 0)) >= .78:
            blocking=True
            flags.append("Zona verificada de risco alto no corredor")
            break
    for alert in metrics.get("nearby_alerts", []) or []:
        if alert.get("category") in {"flood", "construction", "accident", "robbery"} and int(alert.get("severity", 0)) >= 4 and int(alert.get("confirmations", 0)) >= 2 and float(alert.get("distance_to_route_m", 9999)) <= 180:
            blocking=True
            flags.append(f"Alerta severo confirmado: {alert.get('category_label','atenção')}")
            break
    return {
        "professional_ok": not blocking,
        "professional_flags": list(dict.fromkeys(flags))[:5],
        "exclusion_violations": violations,
    }


def _candidate_bounds(routes, start_lat, start_lon, end_lat, end_lon):
    coords = []
    for route in (routes or [])[:20]:
        coords.extend((route.get("geometry") or {}).get("coordinates") or [])
    if coords:
        lons = [float(c[0]) for c in coords if len(c) >= 2]
        lats = [float(c[1]) for c in coords if len(c) >= 2]
        if lons and lats:
            pad = .018
            return min(lats)-pad, min(lons)-pad, max(lats)+pad, max(lons)+pad
    pad = .025
    return min(start_lat,end_lat)-pad, min(start_lon,end_lon)-pad, max(start_lat,end_lat)+pad, max(start_lon,end_lon)+pad


def admin_blocked_zone_points(zones, start_lat, start_lon, end_lat, end_lon, local_hour=None):
    """Strong-avoid points explicitly configured by an administrator.

    A zone containing the trip origin/destination is not hard-avoided; otherwise
    users could be unable to leave or reach their own neighborhood. The zone still
    participates in the Safety Engine and can lower the route's safety score.
    """
    out = []
    for zone in (zones or []):
        if not int(zone["active"] or 0) or not int(zone["block_routes"] or 0):
            continue
        if not zone_active_for_hour(zone, local_hour):
            continue
        radius = float(clamp(float(zone["radius_m"] or 700), 100, 5000))
        zlat, zlon = float(zone["latitude"]), float(zone["longitude"])
        if haversine_m(start_lat, start_lon, zlat, zlon) <= radius or haversine_m(end_lat, end_lon, zlat, zlon) <= radius:
            continue
        out.append({
            "point": [zlon, zlat],
            "score": 200 + int(zone["danger_level"] or 1) * 25,
            "reason": str(zone["name"] or zone["neighborhood"] or "área evitada")[:120],
            "kind": "admin_blocked_area",
            "zone_id": int(zone["id"]),
            "radius_m": radius,
        })
    return out[:12]


def route_blocked_zone_hits(route, zones, start_lat, start_lon, end_lat, end_lon, local_hour=None):
    coords = (route.get("geometry") or {}).get("coordinates") or []
    if len(coords) < 2:
        return []
    hits = []
    for zone in (zones or []):
        if not int(zone["active"] or 0) or not int(zone["block_routes"] or 0):
            continue
        if not zone_active_for_hour(zone, local_hour):
            continue
        radius = float(clamp(float(zone["radius_m"] or 700), 100, 5000))
        zlat, zlon = float(zone["latitude"]), float(zone["longitude"])
        # Never hard-block the origin/destination zone.
        if haversine_m(start_lat, start_lon, zlat, zlon) <= radius or haversine_m(end_lat, end_lon, zlat, zlon) <= radius:
            continue
        d = min_distance_to_geometry_m(zlat, zlon, coords)
        if d <= radius:
            hits.append({"id": int(zone["id"]), "name": zone["name"], "distance_to_route_m": round(d), "radius_m": round(radius)})
    return hits


def apply_admin_route_blocks(routes, zones, start_lat, start_lon, end_lat, end_lon, local_hour=None):
    """Drop candidates crossing admin strong-avoid areas whenever an alternative exists."""
    evaluated = []
    for route in (routes or []):
        hits = route_blocked_zone_hits(route, zones, start_lat, start_lon, end_lat, end_lon, local_hour)
        route["_admin_block_hits"] = hits
        evaluated.append(route)
    clear = [r for r in evaluated if not r.get("_admin_block_hits")]
    if clear:
        return clear, {"enforced": True, "fallback": False, "filtered": len(evaluated)-len(clear)}
    return evaluated, {"enforced": bool(evaluated), "fallback": bool(evaluated), "filtered": 0}


_ROUTE_CONTEXT_CACHE = {}
_ROUTE_CONTEXT_CACHE_LOCK = threading.Lock()
_ROUTE_CONTEXT_CACHE_TTL = max(5, min(45, int(os.environ.get("RAIRO_ROUTE_CONTEXT_TTL", "14"))))

def _route_context_key(kind,min_lat,min_lon,max_lat,max_lon):
    # Coarse corridor buckets maximize reuse between Segura/Smart prefetches while
    # keeping the cache short enough for live reports.
    return (str(kind),round(float(min_lat),3),round(float(min_lon),3),round(float(max_lat),3),round(float(max_lon),3))

def _route_context_get(key):
    now=time.time()
    with _ROUTE_CONTEXT_CACHE_LOCK:
        item=_ROUTE_CONTEXT_CACHE.get(key)
        if not item:return None
        ts,rows=item
        if now-ts>_ROUTE_CONTEXT_CACHE_TTL:
            _ROUTE_CONTEXT_CACHE.pop(key,None);return None
        return copy.deepcopy(rows)

def _route_context_put(key,rows):
    with _ROUTE_CONTEXT_CACHE_LOCK:
        _ROUTE_CONTEXT_CACHE[key]=(time.time(),copy.deepcopy(list(rows or [])))
        if len(_ROUTE_CONTEXT_CACHE)>180:
            for k,_ in sorted(_ROUTE_CONTEXT_CACHE.items(),key=lambda kv:kv[1][0])[:50]:_ROUTE_CONTEXT_CACHE.pop(k,None)

def invalidate_route_context(kind=None):
    """Invalidate short-lived route/report context after live community changes."""
    with _ROUTE_CONTEXT_CACHE_LOCK:
        if kind is None:
            _ROUTE_CONTEXT_CACHE.clear()
            return
        prefix=str(kind)
        for key in [k for k in _ROUTE_CONTEXT_CACHE if k and str(k[0]) == prefix]:
            _ROUTE_CONTEXT_CACHE.pop(key, None)

def get_risk_zones_for_bounds(min_lat, min_lon, max_lat, max_lon):
    key=_route_context_key("zones",min_lat,min_lon,max_lat,max_lon)
    cached=_route_context_get(key)
    if cached is not None:return cached
    pad = 0.05
    rows=get_db().execute(
        """
        SELECT id,name,risk_type,latitude,longitude,radius_m,level_cap,confidence,source,source_url,start_hour,end_hour,neighborhood,city,state,danger_level,block_routes,active
        FROM risk_zones
        WHERE active=1 AND latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?
        ORDER BY confidence DESC, id DESC
        """,
        (min_lat-pad, max_lat+pad, min_lon-pad, max_lon+pad),
    ).fetchall()
    rows=[dict(r) for r in rows]
    _route_context_put(key,rows)
    return rows

def get_active_reports_for_bounds(min_lat, min_lon, max_lat, max_lon):
    key=_route_context_key("reports",min_lat,min_lon,max_lat,max_lon)
    cached=_route_context_get(key)
    if cached is not None:return cached
    cutoff = (datetime.now(timezone.utc) - timedelta(days=MAX_REPORT_AGE_DAYS)).replace(microsecond=0).isoformat()
    rows=get_db().execute(
        """
        SELECT r.id,r.user_id,r.category,r.title,r.description,r.severity,r.latitude,r.longitude,r.address,r.status,r.created_at,r.expires_at,r.confirmations,
               (SELECT COUNT(*) FROM report_absence_votes v WHERE v.report_id=r.id) AS absence_votes
        FROM reports r
        WHERE r.status='active'
          AND r.created_at >= ?
          AND r.latitude BETWEEN ? AND ?
          AND r.longitude BETWEEN ? AND ?
          AND (r.expires_at IS NULL OR r.expires_at > ?)
        """,
        (cutoff, min_lat, max_lat, min_lon, max_lon, utcnow_iso()),
    ).fetchall()
    rows=[dict(r) for r in rows]
    _route_context_put(key,rows)
    return rows

# -----------------------------
# External providers — Mapbox
# -----------------------------

CEP_RE = re.compile(r"^\s*(?:CEP\s*)?(\d{5})[-.\s]?(\d{3})\s*$", re.IGNORECASE)
CEP_ANY_RE = re.compile(r"(?<!\d)(\d{5})[-.\s]?(\d{3})(?!\d)", re.IGNORECASE)
HOUSE_NUMBER_RE = re.compile(r"(?:^|[,\s])(?:n(?:[º°o]\.?|\.?|úmero)?|#)\s*([0-9]{1,6}[A-Za-z]?)\b", re.IGNORECASE)

# Common European postcode forms. This is a detection aid only; Mapbox remains
# the source of truth for geocoding and address validation.
EUROPE_POSTCODE_RE = re.compile(
    r"^(?:"
    r"[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}"      # UK
    r"|\d{4}[- ]?\d{3}"                         # Portugal
    r"|\d{4}\s?[A-Z]{2}"                        # Netherlands
    r"|\d{4}"                                      # Switzerland/Austria/etc.
    r"|\d{5}"                                      # FR/DE/ES/IT/etc.
    r"|[A-Z]{1,2}-?\d{4,5}"                        # prefixed forms
    r")$", re.IGNORECASE
)

# Explicit country names are used only to narrow an intentional international
# search. If no country is written, no country filter is sent to Mapbox.
EUROPE_COUNTRY_HINTS = {
    "portugal":"pt", "portuguesa":"pt",
    "espanha":"es", "spain":"es", "espana":"es",
    "franca":"fr", "france":"fr",
    "alemanha":"de", "germany":"de", "deutschland":"de",
    "italia":"it", "italy":"it",
    "reino unido":"gb", "united kingdom":"gb", "great britain":"gb", "uk":"gb",
    "inglaterra":"gb", "england":"gb", "escocia":"gb", "scotland":"gb",
    "suica":"ch", "switzerland":"ch", "schweiz":"ch",
    "paises baixos":"nl", "netherlands":"nl", "holanda":"nl",
    "belgica":"be", "belgium":"be",
    "austria":"at", "irlanda":"ie", "ireland":"ie",
    "dinamarca":"dk", "denmark":"dk", "noruega":"no", "norway":"no",
    "suecia":"se", "sweden":"se", "finlandia":"fi", "finland":"fi",
    "polonia":"pl", "poland":"pl", "republica tcheca":"cz", "czechia":"cz",
    "grecia":"gr", "greece":"gr", "romenia":"ro", "romania":"ro",
    "hungria":"hu", "hungary":"hu", "croacia":"hr", "croatia":"hr",
    "eslovenia":"si", "slovenia":"si", "eslovaquia":"sk", "slovakia":"sk",
    "luxemburgo":"lu", "luxembourg":"lu", "islandia":"is", "iceland":"is",
    "estonia":"ee", "letonia":"lv", "latvia":"lv", "lituania":"lt", "lithuania":"lt",
}

