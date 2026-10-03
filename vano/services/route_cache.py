"""VANO guest trials, route transport and cache helpers.

Extracted from the historical monolithic app.py without changing route bodies or
business rules. Runtime dependencies are injected once during application startup.
"""
from vano.bootstrap import inject as _vano_inject
_vano_inject(globals())
del _vano_inject

def guest_trial_ids():
    if session.get("user_id"):
        return []
    raw = session.get("guest_trial_ids", [])
    if not isinstance(raw, list):
        return []
    return [str(x)[:64] for x in raw if str(x).strip()][:GUEST_ROUTE_LIMIT]

def guest_routes_used():
    return len(guest_trial_ids()) if not session.get("user_id") else 0

def guest_routes_remaining():
    if session.get("user_id"):
        return GUEST_ROUTE_LIMIT
    return max(0, GUEST_ROUTE_LIMIT - guest_routes_used())

def consume_guest_route(payload, trial_id=None):
    """Consume one successful anonymous trip, not every internal reroute.

    The browser sends a stable trial_id for one destination/trip. Recalculations,
    mode switches and GPS reroutes with the same id do not burn extra credits.
    """
    if session.get("user_id"):
        payload["guest_trial"] = {"active": False, "limit": GUEST_ROUTE_LIMIT, "remaining": GUEST_ROUTE_LIMIT}
        return jsonify(payload)
    ids = guest_trial_ids()
    token = str(trial_id or "").strip()[:64]
    if not token:
        token = secrets.token_urlsafe(12)
    if token not in ids and len(ids) < GUEST_ROUTE_LIMIT:
        ids.append(token)
        session["guest_trial_ids"] = ids
        session.modified = True
    used = len(ids)
    payload["guest_trial"] = {"active": True, "limit": GUEST_ROUTE_LIMIT, "used": used, "remaining": max(0, GUEST_ROUTE_LIMIT-used), "trial_id": token}
    return jsonify(payload)

def is_admin_email(email):
    return str(email or "").strip().lower() in ADMIN_EMAILS

def role_for_email(email):
    return "admin" if is_admin_email(email) else "user"

def is_motorized_profile(profile):
    return str(profile or "").strip().lower() in MOTORIZED_PROFILES

MAX_REPORT_AGE_DAYS = 30
REMEMBER_COOKIE_NAME = "vano_remember"
REMEMBER_EMBED_COOKIE_NAME = "vano_remember_embed"
REMEMBER_LOGIN_DAYS = max(14, min(365, int(os.environ.get("VANO_REMEMBER_DAYS", "90"))))

# X10 — short-lived provider cache: repeated mode switches reuse the same fresh
# Mapbox candidate set instead of repeating an identical network request.
_ROUTE_PROVIDER_CACHE = {}
_ROUTE_PROVIDER_CACHE_LOCK = threading.Lock()
_ROUTE_PROVIDER_CACHE_TTL = max(10, min(90, int(os.environ.get("VANO_ROUTE_CACHE_TTL", "35"))))
# X18: live driving traffic gets only a tiny dedupe window so switching UI modes
# does not repeat identical requests, while a fresh navigation calculation never
# relies on meaningfully stale traffic. Non-live profiles can safely cache longer.
_ROUTE_PROVIDER_CACHE_TTL_LIVE = max(0, min(15, int(os.environ.get("VANO_ROUTE_CACHE_TTL_LIVE", "8"))))
_ROUTE_PROVIDER_CACHE_TTL_STATIC = max(20, min(180, int(os.environ.get("VANO_ROUTE_CACHE_TTL_STATIC", "55"))))

# V84 — single-flight for identical Directions requests. Safe and Fast route
# prefetches intentionally start together; when both need the exact same base
# Mapbox graph, only one outbound request is allowed to run and the other
# thread reuses its result. A tiny completed-job window also closes the race
# between the provider response and the provider-cache write.
_ROUTE_FETCH_INFLIGHT = {}
_ROUTE_FETCH_INFLIGHT_LOCK = threading.Lock()
_ROUTE_FETCH_INFLIGHT_KEEP_S = 2.5

def _route_mapbox_get(url, params, timeout=12):
    key = (str(url), tuple(sorted((str(k), str(v)) for k, v in (params or {}).items())))
    now = time.time()
    leader = False
    with _ROUTE_FETCH_INFLIGHT_LOCK:
        # Opportunistic cleanup keeps this bounded without another worker/thread.
        if len(_ROUTE_FETCH_INFLIGHT) > 72:
            stale = [k for k, j in _ROUTE_FETCH_INFLIGHT.items()
                     if j["event"].is_set() and now - float(j.get("done_at") or now) > _ROUTE_FETCH_INFLIGHT_KEEP_S]
            for stale_key in stale[:36]:
                _ROUTE_FETCH_INFLIGHT.pop(stale_key, None)
        job = _ROUTE_FETCH_INFLIGHT.get(key)
        if job and job["event"].is_set() and now - float(job.get("done_at") or now) > _ROUTE_FETCH_INFLIGHT_KEEP_S:
            _ROUTE_FETCH_INFLIGHT.pop(key, None)
            job = None
        if job is None:
            job = {"event": threading.Event(), "result": None, "error": None, "done_at": 0.0}
            _ROUTE_FETCH_INFLIGHT[key] = job
            leader = True

    if leader:
        try:
            job["result"] = copy.deepcopy(mapbox_get(url, params, timeout=timeout))
        except Exception as exc:
            job["error"] = exc
        finally:
            job["done_at"] = time.time()
            job["event"].set()
    else:
        # The leader has the same HTTP timeout. Give it a small scheduling margin.
        job["event"].wait(timeout=max(2.0, float(timeout) + 3.0))

    if not job["event"].is_set():
        # Extremely rare stalled-worker fallback: do not hold the user hostage.
        return mapbox_get(url, params, timeout=timeout)
    if job.get("error") is not None:
        raise job["error"]
    return copy.deepcopy(job.get("result") or {})

# V83 — full route-result cache. Provider caching avoids duplicate Mapbox calls,
# but the safety/traffic enrichment after those calls is also substantial. A
# destination click can now precompute the complete response and the confirmation
# reuses it for a short window. Prefetches never consume guest credits or write
# route history; those side effects happen only on the confirmed request.
_ROUTE_RESULT_CACHE = {}
_ROUTE_RESULT_CACHE_LOCK = threading.Lock()
_ROUTE_RESULT_CACHE_TTL = max(8, min(45, int(os.environ.get("VANO_ROUTE_RESULT_CACHE_TTL", "22"))))

def _route_result_cache_get(key):
    now = time.time()
    with _ROUTE_RESULT_CACHE_LOCK:
        item = _ROUTE_RESULT_CACHE.get(key)
        if not item:
            return None
        created, payload = item
        if now - created > _ROUTE_RESULT_CACHE_TTL:
            _ROUTE_RESULT_CACHE.pop(key, None)
            return None
        return copy.deepcopy(payload)

def _route_result_cache_put(key, payload):
    now = time.time()
    with _ROUTE_RESULT_CACHE_LOCK:
        if len(_ROUTE_RESULT_CACHE) > 140:
            for k, _ in sorted(_ROUTE_RESULT_CACHE.items(), key=lambda kv: kv[1][0])[:45]:
                _ROUTE_RESULT_CACHE.pop(k, None)
        _ROUTE_RESULT_CACHE[key] = (now, copy.deepcopy(payload))

def _route_result_cache_key(user_id=None):
    # Labels, the trial token and the speculative flag do not affect geometry or
    # scoring. Everything else is kept in the key so preferences, heading and
    # navigation exclusions cannot accidentally share an incompatible result.
    ignored = {"trial_id", "prefetch", "origin_label", "destination_label", "include_geometry"}
    args = tuple(sorted((str(k), str(v)) for k, v in request.args.items() if k not in ignored))
    return (str(user_id or "guest"),) + args

def _record_route_history_from_payload(payload, slat, slon, elat, elon, mode):
    try:
        selected_id = payload.get("selected_id")
        rows = payload.get("routes") or []
        selected = next((r for r in rows if str(r.get("id")) == str(selected_id)), rows[0] if rows else None)
        if not selected:
            return
        origin_label = request.args.get("origin_label", "")[:180]
        dest_label = request.args.get("destination_label", "")[:180]
        db = get_db()
        db.execute("""
            INSERT INTO route_history(user_id,origin_label,destination_label,origin_lat,origin_lon,destination_lat,destination_lon,mode,distance_m,duration_s,safety_score,created_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
        """, (session.get("user_id"), origin_label, dest_label, slat, slon, elat, elon, mode,
              float(selected.get("distance") or 0), float(selected.get("duration") or 0),
              float(selected.get("safety_score") or 0), utcnow_iso()))
        db.commit()
    except Exception:
        pass

_MOBILE_ROUTE_KEEP_FIELDS = {
    "id", "distance", "duration", "duration_min", "geometry", "steps", "profile", "badges",
    "routing_provider", "routing_profile_used", "route_signature",
    "micro_route", "micro_strategy", "micro_streets", "micro_traffic_relief",
    "eta_gain_s", "eta_gain_min", "adaptive_variant", "safety_variant",
    "safety_score", "safety_conservative_score", "safety_level", "safety_level_label",
    "data_confidence", "decision_confidence", "risk_exposure_pct", "hotspot_risk",
    "traffic_score", "traffic_level", "congested_distance_km", "severe_segments",
    "live_flow_score", "live_flow_confidence",
    "road_controls", "road_controls_count", "known_speed_limits", "speed_limit_points",
    "incidents_count", "closures_count", "eta_delta_vs_fastest_min", "safety_gain_vs_fastest",
}

def _mobile_compact_route_payload(payload):
    """Trim route delivery for the native client without changing route selection.

    The full payload remains cached/server-side. Android receives the selected
    route plus at most two useful alternatives and only fields needed for local
    navigation. This reduces JSON serialization, transfer and WebView/native
    parsing while preserving the current web response by default.
    """
    result = copy.deepcopy(payload)
    routes = list(result.get("routes") or [])
    selected_id = result.get("selected_id")
    selected = next((r for r in routes if str(r.get("id")) == str(selected_id)), routes[0] if routes else None)
    ranked = []
    if selected is not None:
        ranked.append(selected)
    # Prefer semantically useful alternatives (fastest/safest/smart) before ETA order.
    for badge in ("fastest", "safest", "smart"):
        for route in routes:
            if route in ranked:
                continue
            if badge in (route.get("badges") or []):
                ranked.append(route)
                break
    for route in sorted(routes, key=lambda r: float(r.get("duration") or 10**12)):
        if route not in ranked:
            ranked.append(route)
        if len(ranked) >= 3:
            break
    ranked = ranked[:3]
    compact = []
    for route in ranked:
        compact.append({k: copy.deepcopy(v) for k, v in route.items() if k in _MOBILE_ROUTE_KEEP_FIELDS})
    result["routes"] = compact
    result["mobile_delivery"] = {
        "compact": True,
        "contract_version": 1,
        "route_count": len(compact),
        "full_payload_cached_server_side": True,
        "processing_hint": "device-navigation-v1",
    }
    return result

def _public_benchmark_payload(payload, cache_hit=False):
    """Stable, compact and intentionally whitelisted response for public QA/AI agents."""
    include_geometry = str(request.args.get("include_geometry", "0")).strip().lower() in {"1", "true", "yes", "on"}
    raw_rows = list(payload.get("routes") or [])
    selected_id = payload.get("selected_id")
    raw_selected = next((r for r in raw_rows if str(r.get("id")) == str(selected_id)), raw_rows[0] if raw_rows else None)

    # Do not expose internal node/configuration/debug metadata through the public
    # benchmark. Agents get only metrics needed to reproduce and compare tests.
    safe_route_fields = {
        "id", "distance", "duration", "duration_min", "profile", "badges",
        "routing_provider", "routing_profile_used", "route_signature",
        "micro_route", "micro_strategy", "adaptive_variant", "safety_variant",
        "eta_gain_s", "eta_gain_min", "safety_score", "safety_conservative_score",
        "safety_level", "safety_level_label", "data_confidence", "decision_confidence",
        "risk_exposure_pct", "hotspot_risk", "traffic_score", "traffic_level",
        "congested_distance_km", "severe_segments", "live_flow_score",
        "live_flow_confidence", "incidents_count", "closures_count",
        "eta_delta_vs_fastest_min", "safety_gain_vs_fastest", "vano_score", "vano_score",
    }
    routes = []
    for raw in raw_rows:
        route = {k: copy.deepcopy(v) for k, v in raw.items() if k in safe_route_fields}
        if include_geometry and raw.get("geometry") is not None:
            route["geometry"] = copy.deepcopy(raw.get("geometry"))
        routes.append(route)

    selected = next((r for r in routes if str(r.get("id")) == str(selected_id)), routes[0] if routes else None)
    request_id = re.sub(r"[^A-Za-z0-9_.:-]", "", str(request.args.get("benchmark_nonce") or ""))[:96] or secrets.token_urlsafe(9)
    distributed_raw = payload.get("distributed_routing") or {}
    result = {
        "ok": True,
        "selected_id": selected_id if selected_id is not None else (selected.get("id") if selected else None),
        "mode": payload.get("mode") or str(request.args.get("mode") or "smart"),
        "profile": payload.get("profile") or str(request.args.get("profile") or "driving"),
        "provider": (selected or {}).get("routing_provider") or payload.get("provider") or payload.get("candidate_source"),
        "routes": routes,
        "candidate_pool_cache_hit": bool(payload.get("candidate_pool_cache_hit")),
        "candidate_pool_reuse": str(payload.get("candidate_pool_reuse") or "")[:80],
        "adaptive_routing": {
            "enabled": bool((payload.get("adaptive_routing") or {}).get("enabled")),
            "diverse_candidates": (payload.get("adaptive_routing") or {}).get("diverse_candidates"),
            "variant_budget": (payload.get("adaptive_routing") or {}).get("variant_budget"),
        },
        "distributed_routing": {
            "used": bool(distributed_raw.get("used")),
            "fallback": bool(distributed_raw.get("fallback")),
        },
        "benchmark": {
            "protocol": "vano-route-benchmark",
            "version": "1.0",
            "request_id": request_id,
            "build": VANO_BUILD_ID,
            "generated_at": utcnow_iso(),
            "read_only": True,
            "history_written": False,
            "guest_credit_consumed": False,
            "geometry_included": include_geometry,
            "full_result_cache_hit": bool(cache_hit),
            "limits": {
                "requests_per_minute_per_ip": VANO_PUBLIC_BENCHMARK_RATE_PER_MIN,
                "max_direct_distance_km": VANO_PUBLIC_BENCHMARK_MAX_KM,
                "max_variant_budget": 4,
            },
        },
    }
    if selected:
        safety = selected.get("safety_conservative_score")
        if safety is None:
            safety = selected.get("safety_score")
        vano_score = selected.get("vano_score")
        if vano_score is None:
            vano_score = selected.get("vano_score")
        result["benchmark_result"] = {
            "selected_route_id": selected.get("id"),
            "eta_s": round(float(selected.get("duration") or 0), 3),
            "eta_min": round(float(selected.get("duration") or 0) / 60.0, 3),
            "distance_m": round(float(selected.get("distance") or 0), 3),
            "distance_km": round(float(selected.get("distance") or 0) / 1000.0, 4),
            "traffic_score": selected.get("traffic_score"),
            "safety_score": safety,
            "vano_score": vano_score,
            "candidate_count": len(routes),
            "provider": selected.get("routing_provider") or result.get("provider"),
            "distributed": bool(result["distributed_routing"]["used"]),
            "route_signature": selected.get("route_signature"),
        }
    else:
        result["benchmark_result"] = None
    return result


def _finish_route_payload(payload, cache_key, prefetch_requested, trial_id, slat, slon, elat, elon, mode, cache_hit=False):
    _route_result_cache_put(cache_key, payload)
    result = copy.deepcopy(payload)
    mobile_compact = (
        str(request.args.get("mobile_compact", "0")).strip().lower() in {"1", "true", "yes", "on"}
        or str(request.headers.get("X-VANO-Mobile-Compact", "0")).strip().lower() in {"1", "true", "yes", "on"}
    )
    if mobile_compact:
        result = _mobile_compact_route_payload(result)
    if getattr(g, "vano_public_benchmark", False):
        # Public benchmark never writes history or consumes guest credits.
        return jsonify(_public_benchmark_payload(result, cache_hit=cache_hit))
    if prefetch_requested:
        # Explicit marker lets the browser know this response is safe to display
        # only after confirmation. No guest credit/history is touched here.
        result["prefetch"] = {"ready": True, "cache_hit": bool(cache_hit), "ttl_s": _ROUTE_RESULT_CACHE_TTL}
        return jsonify(result)
    _record_route_history_from_payload(result, slat, slon, elat, elon, mode)
    return consume_guest_route(result, trial_id=trial_id)

# V88 — shared candidate-pool cache across route modes. Segura/Smart/Rápida
# often use the same Mapbox base + micro-routes; keeping this raw pool for a
# few seconds prevents the second prefetch from rebuilding the expensive part.
_ROUTE_CANDIDATE_POOL_CACHE = {}
_ROUTE_CANDIDATE_POOL_LOCK = threading.Lock()
_ROUTE_CANDIDATE_POOL_INFLIGHT = {}
_ROUTE_CANDIDATE_POOL_INFLIGHT_LOCK = threading.Lock()
_ROUTE_CANDIDATE_POOL_TTL = max(6, min(30, int(os.environ.get("VANO_CANDIDATE_POOL_TTL", "16"))))

def _candidate_pool_cache_get(key):
    now=time.time()
    with _ROUTE_CANDIDATE_POOL_LOCK:
        item=_ROUTE_CANDIDATE_POOL_CACHE.get(key)
        if not item:return None
        ts,payload=item
        if now-ts>_ROUTE_CANDIDATE_POOL_TTL:
            _ROUTE_CANDIDATE_POOL_CACHE.pop(key,None);return None
        return copy.deepcopy(payload)

def _candidate_pool_cache_put(key,payload):
    with _ROUTE_CANDIDATE_POOL_LOCK:
        if len(_ROUTE_CANDIDATE_POOL_CACHE)>120:
            for k,_ in sorted(_ROUTE_CANDIDATE_POOL_CACHE.items(),key=lambda kv:kv[1][0])[:36]:_ROUTE_CANDIDATE_POOL_CACHE.pop(k,None)
        _ROUTE_CANDIDATE_POOL_CACHE[key]=(time.time(),copy.deepcopy(payload))

def _candidate_pool_get_or_build(key,builder,wait_timeout=32):
    cached=_candidate_pool_cache_get(key)
    if cached is not None:return cached,"cache"
    leader=False
    with _ROUTE_CANDIDATE_POOL_INFLIGHT_LOCK:
        job=_ROUTE_CANDIDATE_POOL_INFLIGHT.get(key)
        if job is None:
            job={"event":threading.Event(),"result":None,"error":None}
            _ROUTE_CANDIDATE_POOL_INFLIGHT[key]=job
            leader=True
    if leader:
        try:
            result=builder()
            job["result"]=copy.deepcopy(result)
            _candidate_pool_cache_put(key,result)
        except Exception as exc:
            job["error"]=exc
        finally:
            job["event"].set()
            with _ROUTE_CANDIDATE_POOL_INFLIGHT_LOCK:_ROUTE_CANDIDATE_POOL_INFLIGHT.pop(key,None)
    else:
        job["event"].wait(timeout=max(2,float(wait_timeout)))
    if job.get("error") is not None:raise job["error"]
    if job.get("result") is None:
        # A stalled leader must not block routing indefinitely. Build once as a
        # fallback; provider-level in-flight dedup still protects Mapbox calls.
        result=builder();_candidate_pool_cache_put(key,result);return result,"fallback"
    return copy.deepcopy(job["result"]),"built" if leader else "shared-inflight"

def _candidate_pool_cache_key(slat,slon,elat,elon,profile,depart_at,adaptive,variant_budget,base_exclusions,extra_excludes,start_bearing,start_speed,reroute):
    return (
        round(float(slat),5),round(float(slon),5),round(float(elat),5),round(float(elon),5),str(profile),str(depart_at),bool(adaptive),int(variant_budget),
        None if start_bearing is None else round(float(start_bearing),-1),None if start_speed is None else round(float(start_speed),0),bool(reroute),
        tuple(sorted(str(x) for x in (extra_excludes or []))),
        tuple((round(float(x[0]),5),round(float(x[1]),5)) for x in (base_exclusions or [])[:18]),
    )

def _route_cache_get(key, ttl_seconds=None):
    now = time.time()
    ttl = _ROUTE_PROVIDER_CACHE_TTL if ttl_seconds is None else max(0, float(ttl_seconds))
    with _ROUTE_PROVIDER_CACHE_LOCK:
        item = _ROUTE_PROVIDER_CACHE.get(key)
        if not item:
            return None
        created, value = item
        if now - created > ttl:
            _ROUTE_PROVIDER_CACHE.pop(key, None)
            return None
        return copy.deepcopy(value)

def _route_cache_put(key, value):
    now = time.time()
    with _ROUTE_PROVIDER_CACHE_LOCK:
        if len(_ROUTE_PROVIDER_CACHE) > 220:
            for k, _ in sorted(_ROUTE_PROVIDER_CACHE.items(), key=lambda kv: kv[1][0])[:70]:
                _ROUTE_PROVIDER_CACHE.pop(k, None)
        _ROUTE_PROVIDER_CACHE[key] = (now, copy.deepcopy(value))

# Embedded mode is intentionally hard-enabled for the Vértice integration.
# This no longer depends on an environment variable, so an old Render value
# cannot silently re-enable X-Frame-Options: DENY.
EMBED_MODE = True
