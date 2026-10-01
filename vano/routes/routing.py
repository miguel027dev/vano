"""VANO route calculation API.

Extracted from the historical monolithic app.py without changing route bodies or
business rules. Runtime dependencies are injected once during application startup.
"""
from vano.bootstrap import inject as _vano_inject
_vano_inject(globals())
del _vano_inject

def _heavy_route_central_fallback(slat, slon, elat, elon, travel_profile, mode, depart_at,
                                  avoid_ferries=False, avoid_tolls=False, avoid_unpaved=False,
                                  start_bearing=None, start_speed=None, reroute_request=False,
                                  remote_meta=None):
    """Low-cost emergency route when every worker failed.

    This deliberately avoids micro-route generation, Safety Engine expansion and
    broad DB corridor scans. The Central performs one base provider calculation
    so a Route Node incident degrades route quality instead of taking the service
    down. It is not used while any worker is successfully serving the request.
    """
    extra_excludes = []
    if travel_profile == "motorcycle" or avoid_unpaved:
        extra_excludes.append("unpaved")
    if avoid_ferries:
        extra_excludes.append("ferry")
    if avoid_tolls:
        extra_excludes.append("toll")
    try:
        routes = mapbox_routes(
            slon, slat, elon, elat, travel_profile, depart_at=depart_at,
            exclusions=None, alternatives=True, extra_excludes=list(dict.fromkeys(extra_excludes)) or None,
            start_bearing=start_bearing, start_speed=start_speed, reroute=reroute_request,
        )
    except Exception as exc:
        app.logger.warning("Heavy-route Central fallback failed: %s", type(exc).__name__)
        return None
    if not routes:
        return None
    compact = [fast_route_payload(r, i, travel_profile) for i, r in enumerate(routes[:4])]
    selected = min(compact, key=lambda r: float(r.get("duration") or 10**12))
    for route in compact:
        route["fast_eta_only"] = mode == "fastest"
        if mode != "fastest":
            route["safety_level_label"] = "Contingência — análise avançada temporariamente reduzida"
    meta = remote_meta or {}
    return {
        "routes": compact,
        "selected_id": selected.get("id", 0),
        "mode": mode,
        "profile": travel_profile,
        "provider": selected.get("routing_provider") or "mapbox",
        "depart_at": depart_at,
        "engine": "rairo-heavy-central-lite-fallback-v1233",
        "distributed_routing": {
            "used": False,
            "fallback": True,
            "reason": meta.get("reason") or "nodes_unavailable",
            "strategy": meta.get("strategy") or "central-lite-fallback",
            "distance_km": meta.get("distance_km"),
        },
        "distributed_routing_meta": {
            "fallback": True,
            "attempted": meta.get("attempted", []),
            "policy": meta.get("policy", {}),
        },
        "degraded_mode": {
            "active": True,
            "reason": "route_nodes_unavailable",
            "advanced_scoring_skipped": True,
        },
        "micro_routing": False,
        "adaptive_routing": {"enabled": False, "diverse_candidates": len(compact), "variant_budget": 0},
        "navigation_preferences": {"avoid_ferries": avoid_ferries, "avoid_tolls": avoid_tolls, "avoid_unpaved": avoid_unpaved},
    }


@app.route("/api/benchmark/v1/route")
@app.route("/api/route")
def api_route():
    truthy = {"1", "true", "on", "yes"}
    public_benchmark = request.path == "/api/benchmark/v1/route"
    if public_benchmark and not VANO_PUBLIC_BENCHMARK_ENABLED:
        return jsonify({"ok": False, "error": "benchmark_disabled"}), 503
    g.vano_public_benchmark = public_benchmark
    prefetch_requested = public_benchmark or str(request.args.get("prefetch", "0")).strip().lower() in truthy
    benchmark_requested = public_benchmark or str(request.headers.get("X-VANO-Benchmark", "0")).strip().lower() in truthy
    if benchmark_requested and not public_benchmark:
        user = current_user()
        if not user or str(user["role"] or "") != "admin":
            return jsonify({"ok": False, "error": "benchmark_admin_required", "message": "Benchmark interno disponível somente para administradores."}), 403
        prefetch_requested = True
    if public_benchmark:
        rate_bucket = "public-benchmark-route"
        rate_limit_max = VANO_PUBLIC_BENCHMARK_RATE_PER_MIN
    else:
        rate_bucket = "route-benchmark" if benchmark_requested else ("route-prefetch" if prefetch_requested else "route")
        rate_limit_max = 120 if benchmark_requested else (36 if prefetch_requested else 30)
    if not rate_limit(rate_bucket, rate_limit_max, 60):
        return jsonify({"ok": False, "error": "rate_limited", "message": "Muitos cálculos de rota. Aguarde um instante.", "retry_after_s": 60}), 429

    trial_id = re.sub(r"[^A-Za-z0-9_-]", "", str(request.args.get("trial_id", "") or ""))[:64]
    existing_guest_trials = guest_trial_ids() if (not public_benchmark and not session.get("user_id")) else []
    if not public_benchmark and not session.get("user_id") and guest_routes_remaining() <= 0 and (not trial_id or trial_id not in existing_guest_trials):
        return jsonify({
            "error": "Crie uma conta ou entre para continuar.",
            "code": "guest_route_limit_reached",
            "guest_trial": {"active": True, "limit": GUEST_ROUTE_LIMIT, "used": GUEST_ROUTE_LIMIT, "remaining": 0},
            "login_url": url_for("login", next=url_for("index")),
            "register_url": url_for("register"),
        }), 401

    try:
        slat = float(request.args["start_lat"]); slon = float(request.args["start_lon"])
        elat = float(request.args["end_lat"]); elon = float(request.args["end_lon"])
    except (KeyError, ValueError):
        return jsonify({"error": "Origem/destino inválidos."}), 400

    if not all([-90 <= slat <= 90, -90 <= elat <= 90, -180 <= slon <= 180, -180 <= elon <= 180]):
        return jsonify({"error": "Coordenadas inválidas."}), 400
    travel_profile = request.args.get("profile", "driving").strip().lower()
    if travel_profile not in {"walking", "cycling", "driving", "motorcycle"}:
        travel_profile = "driving"
    direct_distance_km = haversine_m(slat, slon, elat, elon) / 1000.0
    if public_benchmark and direct_distance_km > VANO_PUBLIC_BENCHMARK_MAX_KM:
        return jsonify({
            "ok": False,
            "error": "benchmark_distance_limit",
            "distance_km": round(direct_distance_km, 2),
            "max_distance_km": VANO_PUBLIC_BENCHMARK_MAX_KM,
            "message": "O endpoint público de benchmark limita a distância para proteger a infraestrutura. Use cenários menores ou o laboratório administrativo."
        }), 422
    if is_motorized_profile(travel_profile) and direct_distance_km > RAIRO_HEAVY_ROUTE_MAX_KM:
        return jsonify({
            "error": f"A VANO MAPS aceita rotas motorizadas de até {int(RAIRO_HEAVY_ROUTE_MAX_KM)} km por cálculo.",
            "code": "route_distance_limit",
            "distance_km": round(direct_distance_km, 1),
            "max_distance_km": int(RAIRO_HEAVY_ROUTE_MAX_KM),
        }), 422
    depart_at = sanitize_depart_at(request.args.get("depart_at", "now"))
    try:
        local_hour = int(request.args.get("local_hour", "")); local_hour = local_hour if 0 <= local_hour <= 23 else None
    except ValueError:
        local_hour = None
    default_mode = "smart" if public_benchmark else "safest"
    mode = str(request.args.get("mode", default_mode) or default_mode).strip().lower()
    if mode not in {"fastest", "safest", "quietest", "smart"}:
        mode = default_mode
    fastest_mode = mode == "fastest"
    adaptive_requested = str(request.args.get("adaptive", "1")).lower() not in {"0","false","off","no"}
    start_bearing = sanitize_start_bearing(request.args.get("start_bearing"))
    start_speed = sanitize_start_speed(request.args.get("start_speed"))
    reroute_request = str(request.args.get("reroute", "0")).strip().lower() in truthy
    avoid_ferries = str(request.args.get("avoid_ferries", "0")).strip().lower() in truthy
    avoid_tolls = str(request.args.get("avoid_tolls", "0")).strip().lower() in truthy
    avoid_unpaved = str(request.args.get("avoid_unpaved", "0")).strip().lower() in truthy
    try:
        variant_budget = max(2, min(8, int(request.args.get("variant_budget", "4"))))
    except ValueError:
        variant_budget = 4
    if public_benchmark:
        variant_budget = min(4, variant_budget)

    result_cache_key = _route_result_cache_key(session.get("user_id"))
    cached_result = _route_result_cache_get(result_cache_key)
    if cached_result is not None:
        return _finish_route_payload(
            cached_result, result_cache_key, prefetch_requested, trial_id,
            slat, slon, elat, elon, mode, cache_hit=True,
        )

    user_nav = navigation_profile(session.get("user_id"), local_hour, travel_profile)

    # V123.3 — distributed Route Nodes. The Central remains authoritative for
    # authentication, guest credits and history. Heavy motorized trips use hedged
    # workers; if the cluster fails, only a lightweight Central fallback is allowed
    # so one pathological route cannot overload the control plane.
    if is_motorized_profile(travel_profile):
        try:
            requested_safety_bias_remote = clamp(float(request.args.get("safety_bias", 68)), 0, 100)
            requested_traffic_bias_remote = clamp(float(request.args.get("traffic_bias", 62)), 0, 100)
        except ValueError:
            requested_safety_bias_remote, requested_traffic_bias_remote = 68, 62
        learned_remote = learned_route_biases(session.get("user_id"))
        history_strength_remote = min(.28, float(learned_remote.get("samples", 0)) / 36.0 * .28)
        safety_bias_remote = clamp(requested_safety_bias_remote * (1-history_strength_remote) + float(learned_remote["safety_bias"]) * history_strength_remote + user_nav["safety_delta"], 0, 100)
        traffic_bias_remote = clamp(requested_traffic_bias_remote * (1-history_strength_remote) + float(learned_remote["traffic_bias"]) * history_strength_remote + user_nav["traffic_delta"], 0, 100)
        node_job = _node_job_payload(
            slat, slon, elat, elon, travel_profile, mode, depart_at,
            start_bearing, start_speed, reroute_request, adaptive_requested,
            avoid_ferries, avoid_tolls, avoid_unpaved, local_hour, user_nav,
            safety_bias_remote, traffic_bias_remote,
            request_id=trial_id or secrets.token_urlsafe(10),
        )
        inline_context = _node_inline_context(slat, slon, elat, elon, mode)
        if inline_context is not None:
            node_job["context"] = inline_context
        remote_payload, remote_meta = dispatch_route_to_nodes(node_job, prefetch=prefetch_requested)
        if remote_payload is not None:
            remote_payload["central_engine"] = "rairo-central-v1233-distributed"
            remote_payload["distributed_routing_meta"] = {
                "fallback": False,
                "attempted": remote_meta.get("attempted", []),
                "strategy": remote_meta.get("strategy") or "single-node-failover",
                "policy": remote_meta.get("policy", {}),
            }
            # VANO AI Route Judge runs at the Central even when a Route Node did
            # the heavy geometry/safety work. The model only sees compact numeric
            # route metrics and can choose only one of the already-valid IDs.
            ai_remote = rerank_routes_with_ai(
                remote_payload.get("routes") or [],
                mode=mode, profile=travel_profile,
                safety_bias=safety_bias_remote, traffic_bias=traffic_bias_remote,
                local_hour=local_hour, night_active=bool(user_nav.get("night_active")),
                current_selected_id=remote_payload.get("selected_id"),
                prefetch=prefetch_requested, reroute=reroute_request,
            )
            remote_payload["ai_routing"] = ai_remote
            if ai_remote.get("applied") and ai_remote.get("proposed_id") is not None:
                proposed = next(
                    (r for r in (remote_payload.get("routes") or []) if str(r.get("id")) == str(ai_remote.get("proposed_id"))),
                    None,
                )
                if proposed is not None:
                    remote_payload["selected_id"] = proposed.get("id")
                    for route_row in remote_payload.get("routes") or []:
                        badges = [b for b in (route_row.get("badges") or []) if b != mode]
                        if str(route_row.get("id")) == str(proposed.get("id")) and mode in {"safest", "smart"}:
                            badges.append(mode)
                        route_row["badges"] = badges
            return _finish_route_payload(
                remote_payload, result_cache_key, prefetch_requested, trial_id,
                slat, slon, elat, elon, mode, cache_hit=False,
            )
        # Heavy requests must not collapse back into the full Central micro-route
        # engine after all workers fail. Use one lightweight base-provider call;
        # the service stays responsive and quality degrades gracefully.
        if direct_distance_km >= RAIRO_HEAVY_ROUTE_MIN_KM and direct_distance_km <= RAIRO_HEAVY_ROUTE_MAX_KM:
            lite_payload = _heavy_route_central_fallback(
                slat, slon, elat, elon, travel_profile, mode, depart_at,
                avoid_ferries=avoid_ferries, avoid_tolls=avoid_tolls, avoid_unpaved=avoid_unpaved,
                start_bearing=start_bearing, start_speed=start_speed, reroute_request=reroute_request,
                remote_meta=remote_meta,
            )
            if lite_payload is not None:
                return _finish_route_payload(
                    lite_payload, result_cache_key, prefetch_requested, trial_id,
                    slat, slon, elat, elon, mode, cache_hit=False,
                )
            # Do not execute the full micro-route/Safety pipeline on the Central
            # after the distributed cluster and the lightweight provider fallback
            # both failed. Return a controlled retryable error instead of risking
            # the Central process under a pathological long request.
            return jsonify({
                "error": "A rota está temporariamente indisponível. Tente novamente em alguns segundos.",
                "code": "heavy_route_temporarily_unavailable",
                "retryable": True,
                "distance_km": round(direct_distance_km, 1),
                "distributed_routing": {
                    "fallback": True,
                    "reason": remote_meta.get("reason") or "nodes_unavailable",
                    "attempted": len(remote_meta.get("attempted", [])),
                },
            }), 503
    else:
        remote_meta = {"enabled": False, "reason": "non_motorized_local"}

    # Rápida is deliberately ETA-only. Profile/safety exclusions must not change its result.
    hard_exclusions, exclusion_reasons = (([], []) if fastest_mode else (professional_exclusion_points(slat, slon, elat, elon, local_hour) if user_nav["professional_driver"] else ([], [])))

    try:
        motorcycle_excludes = ["unpaved"] if travel_profile == "motorcycle" else []
        professional_excludes = ["unpaved"] if (user_nav["professional_driver"] and not fastest_mode) else []
        user_excludes = []
        if avoid_ferries:
            user_excludes.append("ferry")
        if is_motorized_profile(travel_profile) and avoid_tolls:
            user_excludes.append("toll")
        if is_motorized_profile(travel_profile) and avoid_unpaved:
            user_excludes.append("unpaved")
        extra_excludes = list(dict.fromkeys(motorcycle_excludes + professional_excludes + user_excludes)) or None
        route_base_exclusions = hard_exclusions if (user_nav["professional_driver"] and not fastest_mode) else None
        route_extra_excludes = extra_excludes
        pool_key = _candidate_pool_cache_key(
            slat,slon,elat,elon,travel_profile,depart_at,adaptive_requested,variant_budget,
            route_base_exclusions,route_extra_excludes,start_bearing,start_speed,reroute_request,
        )
        candidate_pool_cache_hit = False
        candidate_pool_reuse = "none"
        if is_motorized_profile(travel_profile):
            def build_candidate_pool():
                routes_local, provider_local, base_count_local = motorized_candidate_routes(
                    slon, slat, elon, elat, travel_profile, depart_at=depart_at,
                    micro_budget=min(8, variant_budget + 3),
                    mapbox_exclusions=route_base_exclusions, extra_excludes=route_extra_excludes,
                    start_bearing=start_bearing, start_speed=start_speed, reroute=reroute_request,
                )
                if adaptive_requested and provider_local == "mapbox":
                    routes_local = ensure_adaptive_route_pool(routes_local, slon, slat, elon, elat, depart_at, target=3, budget=min(2,variant_budget), base_exclusions=route_base_exclusions, extra_excludes=route_extra_excludes)
                if provider_local == "mapbox":
                    routes_local.extend(build_dense_micro_route_pool(
                        routes_local, slon, slat, elon, elat, depart_at,
                        budget=min(6, variant_budget + 2),
                        base_exclusions=route_base_exclusions, extra_excludes=route_extra_excludes,
                    ))
                    if routes_local:
                        baseline_probe=min(routes_local,key=lambda r:float(r.get("duration") or 10**12))
                        probe_traffic=route_traffic_metrics(baseline_probe)
                        if float(probe_traffic.get("traffic_score") or 0)>=72 or int(probe_traffic.get("severe_segments") or 0)>=4:
                            routes_local.extend(build_fast_micro_routes(routes_local, slon, slat, elon, elat, depart_at))
                    exact = {}
                    for candidate in routes_local:
                        sig = route_signature(candidate) or f"anon-{id(candidate)}"
                        best = exact.get(sig)
                        if best is None or float(candidate.get("duration") or 10**12) < float(best.get("duration") or 10**12): exact[sig] = candidate
                    routes_local = sorted(exact.values(), key=lambda r: float(r.get("duration", 10**12)))[:18]
                return {"routes":routes_local,"primary_provider":provider_local,"mapbox_base_count":base_count_local}
            pooled,candidate_pool_reuse=_candidate_pool_get_or_build(pool_key,build_candidate_pool,wait_timeout=30)
            candidate_pool_cache_hit=candidate_pool_reuse in {"cache","shared-inflight"}
            routes=pooled["routes"];primary_provider=pooled["primary_provider"];mapbox_base_count=int(pooled.get("mapbox_base_count") or 0)
        else:
            routes = mapbox_routes(
                slon, slat, elon, elat, travel_profile, depart_at=depart_at,
                exclusions=route_base_exclusions, extra_excludes=route_extra_excludes,
            )
            primary_provider = str((routes[0] if routes else {}).get("_provider") or "mapbox")
            mapbox_base_count=len(routes)
    except Exception as exc:
        return jsonify({"error": "Não foi possível calcular a rota agora.", "detail": str(exc)}), 502
    if not routes:
        return jsonify({"error": "Nenhuma rota encontrada."}), 404

    # V81 — Admin-configured strong-avoid areas apply to every driving mode,
    # including "Rápida". They are not demographic proxies: the admin must supply
    # an operational risk reason/source. If every candidate intersects the area,
    # routing remains possible and the zone continues as a strong risk penalty.
    zone_bounds = _candidate_bounds(routes, slat, slon, elat, elon)
    route_policy_zones = get_risk_zones_for_bounds(*zone_bounds)
    block_points = admin_blocked_zone_points(route_policy_zones, slat, slon, elat, elon, local_hour)
    if block_points and is_motorized_profile(travel_profile) and primary_provider == "mapbox":
        try:
            routes.extend(build_safety_bypass_routes(
                routes, slon, slat, elon, elat, block_points, depart_at=depart_at,
                budget=min(6, variant_budget + 2),
            ))
        except Exception:
            app.logger.exception("Could not build admin-area bypass variants")
    routes, admin_zone_policy = apply_admin_route_blocks(routes, route_policy_zones, slat, slon, elat, elon, local_hour)
    if is_motorized_profile(travel_profile):
        routes, direction_guard = apply_start_direction_guard(routes, start_bearing, start_speed)
    else:
        direction_guard = {"active": False, "rejected": 0, "bearing": None, "speed_mps": None}

    if fastest_mode:
        # Keep this path lean: no reports, risk zones, Safety Engine, user preference
        # weighting or community-risk analysis. Provider ETA is the sole selector.
        quick = []
        # The winner is chosen from every exact-distinct candidate, including tiny
        # block deviations. Diversity is a presentation concern, not a selector.
        raw_ranked = sorted(routes, key=lambda r: float(r.get("duration", 10**12)))[:12]
        for raw in raw_ranked:
            quick.append(fast_route_payload(raw, len(quick), travel_profile))
        fastest = min(quick, key=lambda r: float(r.get("duration", 10**12)))
        baseline_non_micro = min([float(r.get("duration") or 10**12) for r in quick if not r.get("micro_route")] or [float(fastest.get("duration") or 0)])
        for r in quick:
            gain = max(0.0, baseline_non_micro - float(r.get("duration") or baseline_non_micro))
            r["eta_gain_s"] = round(gain, 1)
            r["eta_gain_min"] = round(gain/60.0, 1)
        # Keep the true winner plus a few useful alternatives for the UI.
        display = [fastest]
        for r in quick:
            if r is fastest:
                continue
            if len(display) >= 6:
                break
            if r.get("micro_route") or not any(route_overlap_ratio(r, x) >= .985 for x in display):
                display.append(r)
        quick = display
        for i, r in enumerate(quick):
            r["id"] = i
        fastest = min(quick, key=lambda r: float(r.get("duration", 10**12)))
        fastest["badges"].append("fastest")
        payload = {
            "routes": quick, "selected_id": fastest["id"], "mode": "fastest", "profile": travel_profile,
            "distributed_routing": {"used": False, "fallback": bool(locals().get("remote_meta", {}).get("fallback")), "reason": locals().get("remote_meta", {}).get("reason", "local")},
            "provider": fastest.get("routing_provider") or primary_provider or "mapbox", "depart_at": depart_at,
            "engine": "rairo-fast-v90-local-fallback",
            "candidate_source": primary_provider, "mapbox_base_candidates": int(mapbox_base_count or 0),
            "candidate_pool_cache_hit": bool(candidate_pool_cache_hit),
            "candidate_pool_reuse": candidate_pool_reuse,
            "direction_guard": direction_guard,
            "micro_routing": is_motorized_profile(travel_profile),
            "adaptive_routing": {"enabled": bool(adaptive_requested), "diverse_candidates": len(quick), "variant_budget": variant_budget},
            "navigation_preferences": {"avoid_ferries": avoid_ferries, "avoid_tolls": avoid_tolls, "avoid_unpaved": avoid_unpaved},
            "admin_area_policy": admin_zone_policy,
            "fast_policy": {
                "eta_only": True, "safety_engine_skipped": True, "profile_safety_skipped": True,
                "traffic_aware": is_motorized_profile(travel_profile),
                "motorcycle_policy": "motorized-traffic-graph+unpaved-avoidance" if travel_profile == "motorcycle" else None,
                "micro_candidates": sum(1 for r in quick if r.get("micro_route")),
                "parallel_block_bypass": True,
                "mapbox_base_candidates": int(mapbox_base_count or 0),
                "selector": "minimum-provider-duration",
            },
        }
        return _finish_route_payload(
            payload, result_cache_key, prefetch_requested, trial_id,
            slat, slon, elat, elon, "fastest", cache_hit=False,
        )

    all_coords = []
    for candidate in routes[:8]:
        all_coords.extend(candidate.get("geometry", {}).get("coordinates", []))
    if all_coords:
        lons = [float(c[0]) for c in all_coords]; lats = [float(c[1]) for c in all_coords]
        pad = 0.012
        min_lat, max_lat = min(lats)-pad, max(lats)+pad; min_lon, max_lon = min(lons)-pad, max(lons)+pad
    else:
        pad = 0.015
        min_lat, max_lat = min(slat, elat)-pad, max(slat, elat)+pad; min_lon, max_lon = min(slon, elon)-pad, max(slon, elon)+pad
    reports = get_active_reports_for_bounds(min_lat, min_lon, max_lat, max_lon)
    risk_zones = route_policy_zones if route_policy_zones is not None else get_risk_zones_for_bounds(min_lat, min_lon, max_lat, max_lon)

    # Safest V4: expand the candidate pool around verified objective hazards. This
    # never uses neighborhood/favela labels or demographic proxies. The resulting
    # variants are still rescored against the complete Safety Engine evidence.
    safety_avoidance = []
    if mode == "safest" and is_motorized_profile(travel_profile) and str((routes[0] if routes else {}).get("_provider") or "mapbox") == "mapbox":
        safety_avoidance = verified_safety_avoidance_points(reports, risk_zones, local_hour, travel_profile, max_points=10)
        if safety_avoidance:
            safe_variants = build_safety_bypass_routes(
                routes, slon, slat, elon, elat, safety_avoidance, depart_at=depart_at,
                budget=min(5, variant_budget + 1),
            )
            routes.extend(safe_variants)
            # Exact dedupe only. A one-block safety detour may intentionally overlap
            # almost all of the original corridor.
            exact = {}
            for candidate in routes:
                sig = route_signature(candidate) or f"anon-{id(candidate)}"
                current = exact.get(sig)
                if current is None or float(candidate.get("duration") or 10**12) < float(current.get("duration") or 10**12):
                    exact[sig] = candidate
            routes = sorted(exact.values(), key=lambda r: float(r.get("duration") or 10**12))[:12]
    try:
        requested_safety_bias = clamp(float(request.args.get("safety_bias", 68)), 0, 100)
        requested_traffic_bias = clamp(float(request.args.get("traffic_bias", 62)), 0, 100)
    except ValueError:
        requested_safety_bias, requested_traffic_bias = 68, 62
    learned = learned_route_biases(session.get("user_id"))
    # O dispositivo tem maior peso; histórico da conta atua como ajuste suave.
    history_strength = min(.28, float(learned.get("samples", 0)) / 36.0 * .28)
    safety_bias = clamp(requested_safety_bias * (1-history_strength) + float(learned["safety_bias"]) * history_strength + user_nav["safety_delta"], 0, 100)
    traffic_bias = clamp(requested_traffic_bias * (1-history_strength) + float(learned["traffic_bias"]) * history_strength + user_nav["traffic_delta"], 0, 100)

    enriched = []
    for idx, route in enumerate(routes[:14]):
        metrics = route_risk_metrics(route, reports, risk_zones, local_hour, travel_profile)
        traffic = route_traffic_metrics(route) if is_motorized_profile(travel_profile) else {"traffic_score": 0, "traffic_level": "—", "congested_distance_km": 0, "severe_segments": 0, "traffic_segments": []}
        flow = route_live_flow_metrics(route) if is_motorized_profile(travel_profile) else {"live_flow_score": 0, "live_flow_cells": 0, "live_flow_confidence": 0, "live_flow_points": []}
        if is_motorized_profile(travel_profile) and int(flow.get("live_flow_cells") or 0) > 0:
            mapbox_score = float(traffic.get("traffic_score") or 0)
            live_score = float(flow.get("live_flow_score") or 0)
            conf = float(flow.get("live_flow_confidence") or 0) / 100.0
            blend = min(.34, .10 + conf * .24)
            combined = mapbox_score * (1.0-blend) + live_score * blend if mapbox_score > 0 else live_score
            # O fluxo colaborativo só consegue elevar muito o score quando há confiança suficiente.
            traffic["traffic_score_provider"] = round(mapbox_score, 1)
            traffic["traffic_score"] = round(clamp(combined, 0, 100), 1)
            traffic["traffic_level"] = traffic_level_from_score(traffic["traffic_score"])
        road = route_road_controls(route)
        professional = professional_route_assessment(route, metrics, road) if user_nav["professional_driver"] else {"professional_ok": True, "professional_flags": [], "exclusion_violations": []}
        enriched.append({
            "id": idx,
            "distance": route.get("distance", 0), "duration": route.get("duration", 0), "duration_min": round(float(route.get("duration", 0))/60, 1),
            "geometry": route.get("geometry"), "steps": compact_steps(route), "profile": travel_profile,
            "micro_route": bool(route.get("_micro_route")), "micro_avoided_points": int(route.get("_micro_avoided_points", 0) or 0),
            "micro_strategy": route.get("_micro_strategy") or "", "micro_streets": route.get("_micro_streets") or [],
            "micro_traffic_relief": round(float(route.get("_micro_traffic_relief") or 0), 1),
            "micro_baseline_traffic": round(float(route.get("_micro_baseline_traffic") or 0), 1),
            "micro_traffic_score": round(float(route.get("_micro_traffic_score") or 0), 1),
            "adaptive_variant": bool(route.get("_adaptive_variant")), "adaptive_avoided_points": int(route.get("_adaptive_avoided_points", 0) or 0),
            "safety_variant": bool(route.get("_safety_variant")),
            "safety_avoided_points": int(route.get("_safety_avoided_points", 0) or 0),
            "safety_avoid_reasons": route.get("_safety_avoid_reasons") or [],
            "routing_profile_used": route.get("_profile_used", ""), "routing_provider": route.get("_provider", "mapbox"), "route_signature": route_signature(route),
            "motorcycle_route": travel_profile == "motorcycle",
            "motorcycle_eta_policy": "conservative motorized ETA; no lane-splitting assumption" if travel_profile == "motorcycle" else "",
            "traffic_hotspots": (traffic.get("traffic_points") or [])[:6],
            **metrics, **{k:v for k,v in traffic.items() if k != "traffic_points"}, **flow, **road, **professional,
        })

    apply_route_intelligence(enriched, travel_profile, safety_bias=safety_bias, traffic_bias=traffic_bias)
    candidate_pool = [r for r in enriched if r.get("professional_ok", True)] if user_nav["professional_driver"] else list(enriched)
    professional_fallback = False
    if not candidate_pool:
        candidate_pool = list(enriched)
        professional_fallback = bool(user_nav["professional_driver"])
    fastest = min(candidate_pool, key=lambda r: r["duration"])
    fastest_s = max(float(fastest["duration"]), 1.0)
    # In Segura, safety is the primary objective. We still cap extreme detours, but
    # allow a wider search than balanced/Vano Maps so a meaningful safety gain can win.
    if mode == "safest":
        detour_cap = 1.62 if user_nav["night_active"] else 1.52
    else:
        detour_cap = 1.42 if user_nav["night_active"] else 1.35
    safety_pool = [r for r in candidate_pool if float(r["duration"]) <= fastest_s * detour_cap or int(r.get("safety_level", 0)) >= int(fastest.get("safety_level", 0)) + 2]
    safest = max(
        safety_pool or candidate_pool,
        key=lambda r: (
            float(r.get("safety_conservative_score", r.get("safety_score", 0)) or 0),
            int(r.get("safety_level", 0)),
            -float(r.get("risk_exposure_pct", 0) or 0),
            -float(r.get("hotspot_risk", 0) or 0),
            float(r.get("decision_confidence", 0) or 0),
            -float(r.get("duration", 0) or 0),
        ),
    )
    quietest = max(candidate_pool, key=lambda r: (r["quiet_score"], r.get("safety_level", 0), -r["duration"]))

    smart_guard_pool = list(candidate_pool)
    if is_motorized_profile(travel_profile):
        min_level = int(fastest.get("safety_level", 0)) if user_nav["night_active"] else max(1, int(fastest.get("safety_level", 0)) - 1)
        eligible = [r for r in candidate_pool if float(r["duration"]) <= fastest_s * (1.34 if user_nav["night_active"] else 1.30) and int(r.get("safety_level", 0)) >= min_level]
        smart_guard_pool = list(eligible or candidate_pool)
        smart = max(smart_guard_pool, key=lambda r: (float(r.get("rairo_score", 0)), int(r.get("safety_level", 0)), -float(r.get("duration", 0))))
        smart_micro_locked = False

        # In real congestion, Vano Maps gives a controlled preference to block-scale
        # micro-routes that ease the corridor without a large ETA/safety penalty.
        fastest_traffic = float(fastest.get("traffic_score") or 0)
        if fastest_traffic >= 32:
            micro_pool = [
                r for r in (eligible or candidate_pool)
                if r.get("micro_route")
                and float(r.get("duration") or 10**12) <= fastest_s * 1.14
                and int(r.get("safety_level", 0)) >= min_level
                and (
                    float(r.get("traffic_score") or 0) <= fastest_traffic - 5
                    or float(r.get("duration") or 10**12) <= fastest_s * 1.01
                    or float(r.get("micro_traffic_relief") or 0) >= 7
                )
            ]
            if micro_pool:
                smart = max(
                    micro_pool,
                    key=lambda r: (
                        float(r.get("rairo_score", 0)) + min(18.0, max(0.0, fastest_traffic - float(r.get("traffic_score") or 0)) * .45),
                        -float(r.get("duration", 0)),
                    ),
                )
                smart_micro_locked = True

        # Vano Maps may seek a visibly different corridor when its score stays close.
        # Segura never sacrifices its best conservative safety score just to look
        # different from the fastest route; a one-block safer deviation can overlap
        # almost all of the same trip.
        if not smart_micro_locked and (route_overlap_ratio(smart, fastest) >= .93 or route_overlap_ratio(smart, safest) >= .93):
            best_spark = float(smart.get("rairo_score",0) or 0)
            diverse_smart = [r for r in (eligible or candidate_pool) if route_overlap_ratio(r, fastest) < .93 and route_overlap_ratio(r, safest) < .93 and float(r.get("rairo_score",0) or 0) >= best_spark-10]
            if diverse_smart:
                smart = max(diverse_smart, key=lambda r:(float(r.get("rairo_score",0)), -float(r.get("duration",0))))
    else:
        smart = max(candidate_pool, key=lambda r: (float(r.get("rairo_score", 0)), int(r.get("safety_level", 0)), -float(r.get("duration", 0))))

    # VANO AI Route Judge — a bounded reranker, not a geometry generator.
    # Guardrails are computed by the deterministic engine first; the LLM can only
    # choose among IDs already admitted by the current Safest/Smart policy.
    ai_base_selected = safest if mode == "safest" else smart if mode == "smart" else None
    ai_allowed_rows = (safety_pool or candidate_pool) if mode == "safest" else smart_guard_pool if mode == "smart" else []
    ai_routing = rerank_routes_with_ai(
        enriched,
        mode=mode, profile=travel_profile,
        safety_bias=safety_bias, traffic_bias=traffic_bias,
        local_hour=local_hour, night_active=bool(user_nav.get("night_active")),
        current_selected_id=(ai_base_selected or {}).get("id"),
        allowed_ids=[r.get("id") for r in ai_allowed_rows],
        prefetch=prefetch_requested, reroute=reroute_request,
    )
    if ai_routing.get("applied") and ai_routing.get("proposed_id") is not None:
        ai_selected = next((r for r in ai_allowed_rows if str(r.get("id")) == str(ai_routing.get("proposed_id"))), None)
        if ai_selected is not None:
            if mode == "safest":
                safest = ai_selected
            elif mode == "smart":
                smart = ai_selected

    fastest_cons = float(fastest.get("safety_conservative_score", fastest.get("safety_score", 0)) or 0)
    for r in enriched:
        r["eta_delta_vs_fastest_min"] = round(max(0.0, float(r.get("duration") or 0)-fastest_s)/60.0, 1)
        r["safety_gain_vs_fastest"] = round(float(r.get("safety_conservative_score", r.get("safety_score", 0)) or 0)-fastest_cons, 1)
        r["badges"] = []
        if r["id"] == fastest["id"]: r["badges"].append("fastest")
        if r["id"] == safest["id"]: r["badges"].append("safest")
        if r["id"] == quietest["id"]: r["badges"].append("quietest")
        if r["id"] == smart["id"]: r["badges"].append("smart")

    selected = {"fastest": fastest, "safest": safest, "quietest": quietest, "smart": smart}.get(mode, safest)

    payload = {
        "routes": enriched, "selected_id": selected["id"], "mode": mode, "profile": travel_profile,
        "provider": selected.get("routing_provider") or "mapbox", "depart_at": depart_at,
        "engine": "vano-intelligence-v262-local-fallback", "safety_bias": round(safety_bias, 1), "traffic_bias": round(traffic_bias, 1),
        "ai_routing": ai_routing,
        "distributed_routing": {"used": False, "fallback": bool(locals().get("remote_meta", {}).get("fallback")), "reason": locals().get("remote_meta", {}).get("reason", "local")},
        "candidate_source": primary_provider, "mapbox_base_candidates": int(mapbox_base_count or 0),
        "candidate_pool_cache_hit": bool(candidate_pool_cache_hit),
        "candidate_pool_reuse": candidate_pool_reuse,
        "direction_guard": direction_guard,
        "adaptive_routing": {"enabled": bool(adaptive_requested), "diverse_candidates": len(enriched), "variant_budget": variant_budget, "mode_badges_distinct": len({fastest["id"], safest["id"], smart["id"]})},
        "personalization": {
            "history_samples": int(learned.get("samples", 0)), "history_strength": round(history_strength, 3),
            "professional_driver": bool(user_nav["professional_driver"]),
            "night_safety_active": bool(user_nav["night_active"]),
            "route_preference": user_nav["route_preference"],
        },
        "professional_mode": {
            "strict": bool(user_nav["professional_driver"]),
            "fallback_required": bool(professional_fallback),
            "hard_exclusions_count": len(hard_exclusions),
            "reasons": exclusion_reasons,
            "policy": "objective-hazards-only",
        },
        "micro_routing": is_motorized_profile(travel_profile),
        "motorcycle_routing": {
            "enabled": travel_profile == "motorcycle",
            "provider_graph": "mapbox-driving-traffic",
            "avoid_unpaved": bool(travel_profile == "motorcycle" or avoid_unpaved),
            "navigation_preferences": {"avoid_ferries": avoid_ferries, "avoid_tolls": avoid_tolls, "avoid_unpaved": avoid_unpaved},
            "eta_policy": "conservative; no lane-splitting or speeding assumption",
        },
        "safety_routing": {
            "objective_hazard_bypass": mode == "safest" and is_motorized_profile(travel_profile),
            "verified_avoidance_points": len(safety_avoidance),
            "generated_variants": sum(1 for r in enriched if r.get("safety_variant")),
            "policy": "verified-objective-hazards-only",
        },
        "safety_engine": "vano-safety-v262-objective-corridor",
        "disclaimer": "Nível de segurança é uma estimativa conservadora baseada em exposição ao corredor, hotspots, alertas recentes, zonas verificadas, condições viárias e confiança dos dados; não garante ausência de risco. Sexo, idade e tipo de comunidade não são usados como proxy automático de perigo.",
    }
    return _finish_route_payload(
        payload, result_cache_key, prefetch_requested, trial_id,
        slat, slon, elat, elon, mode, cache_hit=False,
    )


