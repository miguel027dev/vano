"""VANO AI Route Judge.

Optional Ollama Cloud reranker for already-computed routes.

The LLM never creates geometry, never receives route coordinates/steps, and never
turns an invalid route into a valid one. It only chooses among candidate IDs that
have already passed the deterministic VANO routing/safety pipeline.
"""

from __future__ import annotations

import copy
import hashlib
import json
import os
import re
import threading
import time
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set

import requests


_CACHE: Dict[str, tuple[float, Dict[str, Any]]] = {}
_CACHE_LOCK = threading.Lock()
_HTTP = requests.Session()


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return bool(default)
    return str(raw).strip().lower() not in {"0", "false", "off", "no", "disabled"}


def _env_float(name: str, default: float, minimum: float, maximum: float) -> float:
    try:
        value = float(os.environ.get(name, str(default)) or default)
    except (TypeError, ValueError):
        value = float(default)
    return max(minimum, min(maximum, value))


def _env_int(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(float(os.environ.get(name, str(default)) or default))
    except (TypeError, ValueError):
        value = int(default)
    return max(minimum, min(maximum, value))


def _clamp(value: Any, minimum: float = 0.0, maximum: float = 100.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = minimum
    return max(minimum, min(maximum, number))


def _route_id(route: Dict[str, Any]) -> str:
    return str(route.get("id"))


def _route_by_id(routes: Sequence[Dict[str, Any]], selected_id: Any) -> Optional[Dict[str, Any]]:
    target = str(selected_id)
    return next((route for route in routes if _route_id(route) == target), None)


def _configured_modes() -> Set[str]:
    raw = os.environ.get("VANO_AI_ROUTE_MODES", "safest,smart")
    return {item.strip().lower() for item in str(raw).split(",") if item.strip()}


def _config_snapshot() -> Dict[str, Any]:
    return {
        "enabled": _env_bool("VANO_AI_ROUTING_ENABLED", True),
        "shadow": _env_bool("VANO_AI_ROUTE_SHADOW", False),
        "model": (os.environ.get("VANO_AI_ROUTE_MODEL", "deepseek-v4.1-flash:cloud").strip() or "deepseek-v4.1-flash:cloud"),
        "base_url": (os.environ.get("VANO_OLLAMA_BASE_URL", "https://ollama.com/api").strip().rstrip("/") or "https://ollama.com/api"),
        "timeout_s": _env_float("VANO_AI_ROUTE_TIMEOUT", 2.8, 0.7, 12.0),
        "prefetch_timeout_s": _env_float("VANO_AI_ROUTE_PREFETCH_TIMEOUT", 4.8, 1.0, 15.0),
        "cache_ttl_s": _env_int("VANO_AI_ROUTE_CACHE_TTL", 120, 10, 900),
        "max_candidates": _env_int("VANO_AI_ROUTE_MAX_CANDIDATES", 9, 2, 14),
        "safest_floor_delta": _env_float("VANO_AI_SAFEST_SCORE_DELTA", 4.0, 0.0, 15.0),
        "smart_max_detour": _env_float("VANO_AI_SMART_MAX_DETOUR", 1.32, 1.02, 1.70),
        "min_confidence": _env_float("VANO_AI_ROUTE_MIN_CONFIDENCE", 0.55, 0.0, 1.0),
        "modes": _configured_modes(),
    }


def _api_key() -> str:
    # User-requested canonical key name first; uppercase remains a convenient fallback.
    return (os.environ.get("ollama_key", "").strip() or os.environ.get("OLLAMA_API_KEY", "").strip())


def _candidate_summary(route: Dict[str, Any]) -> Dict[str, Any]:
    """Compact, coordinate-free representation sent to the model."""
    return {
        "id": route.get("id"),
        "eta_s": round(float(route.get("duration") or 0), 1),
        "distance_m": round(float(route.get("distance") or 0), 1),
        "safety": round(_clamp(route.get("safety_score")), 1),
        "safety_conservative": round(_clamp(route.get("safety_conservative_score", route.get("safety_score"))), 1),
        "safety_level": int(route.get("safety_level") or 0),
        "risk_exposure_pct": round(_clamp(route.get("risk_exposure_pct")), 1),
        "hotspot_risk": round(_clamp(route.get("hotspot_risk")), 1),
        "traffic_score": round(_clamp(route.get("traffic_score")), 1),
        "live_flow_score": round(_clamp(route.get("live_flow_score")), 1),
        "incidents": int(route.get("incidents_count") or 0),
        "closures": int(route.get("closures_count") or 0),
        "data_confidence": round(_clamp(route.get("data_confidence")), 1),
        "decision_confidence": round(_clamp(route.get("decision_confidence")), 1),
        "vano_score": round(_clamp(route.get("rairo_score")), 1),
        "quiet_score": round(_clamp(route.get("quiet_score")), 1),
        "micro_route": bool(route.get("micro_route")),
        "safety_variant": bool(route.get("safety_variant")),
        "professional_ok": bool(route.get("professional_ok", True)),
    }


def _base_candidate_pool(
    routes: Sequence[Dict[str, Any]],
    mode: str,
    allowed_ids: Optional[Iterable[Any]],
    night_active: bool,
    config: Dict[str, Any],
) -> List[Dict[str, Any]]:
    valid = [route for route in routes if isinstance(route, dict) and route.get("id") is not None and route.get("professional_ok", True)]
    if allowed_ids is not None:
        allowed = {str(item) for item in allowed_ids}
        valid = [route for route in valid if _route_id(route) in allowed]
    if not valid:
        return []

    fastest = min(valid, key=lambda route: float(route.get("duration") or 10**15))
    fastest_s = max(1.0, float(fastest.get("duration") or 1.0))

    if mode == "safest":
        detour_cap = 1.62 if night_active else 1.52
        safe_window = [
            route for route in valid
            if float(route.get("duration") or 10**15) <= fastest_s * detour_cap
            or int(route.get("safety_level") or 0) >= int(fastest.get("safety_level") or 0) + 2
        ] or valid
        best_safety = max(_clamp(route.get("safety_conservative_score", route.get("safety_score"))) for route in safe_window)
        floor = best_safety - float(config["safest_floor_delta"])
        valid = [
            route for route in safe_window
            if _clamp(route.get("safety_conservative_score", route.get("safety_score"))) >= floor
        ] or safe_window

    elif mode == "smart":
        max_detour = max(float(config["smart_max_detour"]), 1.34 if night_active else 1.30)
        min_level = int(fastest.get("safety_level") or 0) if night_active else max(1, int(fastest.get("safety_level") or 0) - 1)
        guarded = [
            route for route in valid
            if float(route.get("duration") or 10**15) <= fastest_s * max_detour
            and int(route.get("safety_level") or 0) >= min_level
        ]
        valid = guarded or valid

    # Keep the strongest routes while guaranteeing the deterministic current winner can
    # still be added by the caller after this ranking if needed.
    if mode == "safest":
        valid.sort(key=lambda route: (
            -_clamp(route.get("safety_conservative_score", route.get("safety_score"))),
            float(route.get("duration") or 10**15),
        ))
    else:
        valid.sort(key=lambda route: (
            -_clamp(route.get("rairo_score")),
            float(route.get("duration") or 10**15),
        ))
    return valid[: int(config["max_candidates"])]


def _cache_key(payload: Dict[str, Any], model: str, *, shadow: bool, min_confidence: float) -> str:
    raw = json.dumps(
        {"model": model, "shadow": bool(shadow), "min_confidence": round(float(min_confidence), 3), "payload": payload},
        sort_keys=True, separators=(",", ":"), ensure_ascii=False,
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _cache_get(key: str, ttl_s: int) -> Optional[Dict[str, Any]]:
    now = time.time()
    with _CACHE_LOCK:
        item = _CACHE.get(key)
        if not item:
            return None
        created, value = item
        if now - created > ttl_s:
            _CACHE.pop(key, None)
            return None
        return copy.deepcopy(value)


def _cache_put(key: str, value: Dict[str, Any]) -> None:
    now = time.time()
    with _CACHE_LOCK:
        if len(_CACHE) > 400:
            for old_key, _ in sorted(_CACHE.items(), key=lambda item: item[1][0])[:100]:
                _CACHE.pop(old_key, None)
        _CACHE[key] = (now, copy.deepcopy(value))


def _extract_json(text: str) -> Optional[Dict[str, Any]]:
    if not text:
        return None
    cleaned = str(text).strip()
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", cleaned, flags=re.IGNORECASE | re.DOTALL)
    if fenced:
        cleaned = fenced.group(1)
    else:
        start, end = cleaned.find("{"), cleaned.rfind("}")
        if start >= 0 and end > start:
            cleaned = cleaned[start:end + 1]
    try:
        parsed = json.loads(cleaned)
        return parsed if isinstance(parsed, dict) else None
    except (TypeError, ValueError, json.JSONDecodeError):
        return None


def _normalize_reason_codes(value: Any) -> List[str]:
    if not isinstance(value, list):
        return []
    output: List[str] = []
    for item in value[:5]:
        token = re.sub(r"[^A-Z0-9_-]", "_", str(item).upper()).strip("_")[:48]
        if token and token not in output:
            output.append(token)
    return output


def _decision_from_content(content: str, candidates: Sequence[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    parsed = _extract_json(content)
    if not parsed:
        return None
    selected = parsed.get("selected_route_id")
    selected_route = _route_by_id(candidates, selected)
    if selected_route is None:
        return None
    confidence = _clamp(parsed.get("confidence", 0), 0, 100)
    if confidence > 1.0:
        confidence /= 100.0
    return {
        "proposed_id": selected_route.get("id"),
        "confidence": round(max(0.0, min(1.0, confidence)), 3),
        "reason_codes": _normalize_reason_codes(parsed.get("reason_codes")),
    }


def _prompt_payload(
    candidates: Sequence[Dict[str, Any]],
    mode: str,
    profile: str,
    safety_bias: float,
    traffic_bias: float,
    local_hour: Optional[int],
    current_selected_id: Any,
) -> Dict[str, Any]:
    return {
        "task": "choose_best_existing_route",
        "mode": mode,
        "profile": profile,
        "local_hour": local_hour if isinstance(local_hour, int) and 0 <= local_hour <= 23 else None,
        "preferences": {
            "safety_bias": round(_clamp(safety_bias), 1),
            "traffic_bias": round(_clamp(traffic_bias), 1),
        },
        "current_deterministic_selection": current_selected_id,
        "routes": [_candidate_summary(route) for route in candidates],
    }


def _system_prompt(mode: str) -> str:
    if mode == "safest":
        priority = (
            "Safety is the primary objective. Prefer higher conservative safety, lower risk exposure/hotspot risk, "
            "fewer incidents/closures, and stronger data confidence. A small ETA penalty is acceptable; do not choose "
            "a materially less safe route just because it is faster."
        )
    else:
        priority = (
            "Balance ETA, conservative safety, traffic, live flow, confidence and detour. Prefer meaningful safety or "
            "traffic gains when the ETA penalty is small. Do not chase tiny score differences with a large detour."
        )
    return (
        "You are VANO AI Route Judge. You DO NOT create roads or geometry. You may select ONLY one route id from the "
        "provided candidates. All candidates were generated and validated by VANO; your job is reranking only. "
        "Use only the numeric/objective evidence supplied. Never infer danger from neighborhood names, demographics, "
        "income, ethnicity, community type, or any other protected/socioeconomic proxy. "
        f"{priority} "
        "Return ONLY minified JSON with exactly this shape: "
        '{"selected_route_id":<id>,"confidence":<0_to_1>,"reason_codes":["CODE",...]}. '
        "Use 1 to 4 short reason codes. No markdown and no explanation outside JSON."
    )


def rerank_routes_with_ai(
    routes: Sequence[Dict[str, Any]],
    *,
    mode: str,
    profile: str = "driving",
    safety_bias: float = 68,
    traffic_bias: float = 62,
    local_hour: Optional[int] = None,
    night_active: bool = False,
    current_selected_id: Any = None,
    allowed_ids: Optional[Iterable[Any]] = None,
    prefetch: bool = False,
    reroute: bool = False,
) -> Dict[str, Any]:
    """Ask Ollama Cloud to rerank already-valid candidates.

    Returns metadata only. The caller remains authoritative and decides whether to
    replace selected_id. No exception escapes this function.
    """
    started = time.perf_counter()
    config = _config_snapshot()
    mode = str(mode or "").strip().lower()
    profile = str(profile or "driving").strip().lower()
    metadata: Dict[str, Any] = {
        "enabled": bool(config["enabled"]),
        "applied": False,
        "shadow": bool(config["shadow"]),
        "model": config["model"],
        "mode": mode,
        "source": "ollama-cloud",
        "proposed_id": None,
        "confidence": 0.0,
        "reason_codes": [],
        "cache_hit": False,
        "fallback": True,
    }

    try:
        if not config["enabled"]:
            metadata["reason"] = "disabled"
            return metadata
        if mode not in config["modes"]:
            metadata["reason"] = "mode_not_enabled"
            return metadata
        if mode in {"fastest", "quietest"}:
            metadata["reason"] = "deterministic_mode"
            return metadata
        if reroute and not prefetch and not _env_bool("VANO_AI_ROUTE_ON_REROUTE", False):
            metadata["reason"] = "urgent_reroute_fast_path"
            return metadata
        key = _api_key()
        if not key:
            metadata["reason"] = "ollama_key_missing"
            return metadata
        if not isinstance(routes, (list, tuple)) or len(routes) < 2:
            metadata["reason"] = "not_enough_candidates"
            return metadata

        candidates = _base_candidate_pool(routes, mode, allowed_ids, bool(night_active), config)
        if len(candidates) < 2:
            metadata["reason"] = "not_enough_guarded_candidates"
            return metadata

        # Keep the current deterministic winner available when it passed caller guardrails.
        current = _route_by_id(routes, current_selected_id)
        candidate_ids = {_route_id(route) for route in candidates}
        allowed_set = {str(item) for item in allowed_ids} if allowed_ids is not None else None
        if current is not None and _route_id(current) not in candidate_ids and allowed_set is not None and _route_id(current) in allowed_set:
            candidates = list(candidates[:-1]) + [current]

        prompt_payload = _prompt_payload(
            candidates, mode, profile, safety_bias, traffic_bias, local_hour, current_selected_id
        )
        cache_key = _cache_key(
            prompt_payload, config["model"],
            shadow=bool(config["shadow"]), min_confidence=float(config["min_confidence"]),
        )
        cached = _cache_get(cache_key, int(config["cache_ttl_s"]))
        if cached:
            metadata.update(cached)
            metadata["cache_hit"] = True
            metadata["fallback"] = not bool(metadata.get("applied"))
            metadata["latency_ms"] = int((time.perf_counter() - started) * 1000)
            return metadata

        timeout = float(config["prefetch_timeout_s"] if prefetch else config["timeout_s"])
        response = _HTTP.post(
            f"{config['base_url']}/chat",
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "VANO-MAPS-AI-Route-Judge/1.0",
            },
            json={
                "model": config["model"],
                "stream": False,
                "messages": [
                    {"role": "system", "content": _system_prompt(mode)},
                    {"role": "user", "content": json.dumps(prompt_payload, ensure_ascii=False, separators=(",", ":"))},
                ],
                "options": {"temperature": 0.05, "num_predict": 120},
            },
            timeout=(min(2.0, timeout), timeout),
        )
        metadata["http_status"] = int(response.status_code)
        if response.status_code != 200:
            metadata["reason"] = f"ollama_http_{response.status_code}"
            return metadata
        try:
            body = response.json()
        except ValueError:
            metadata["reason"] = "ollama_invalid_response"
            return metadata
        content = ((body.get("message") or {}).get("content") or "") if isinstance(body, dict) else ""
        decision = _decision_from_content(content, candidates)
        if not decision:
            metadata["reason"] = "invalid_model_decision"
            return metadata

        metadata.update(decision)
        if float(metadata.get("confidence") or 0) < float(config["min_confidence"]):
            metadata["reason"] = "low_model_confidence"
            return metadata
        metadata["reason"] = "shadow" if config["shadow"] else "ai_rerank"
        metadata["applied"] = not bool(config["shadow"])
        metadata["fallback"] = False
        metadata["changed_selection"] = str(metadata.get("proposed_id")) != str(current_selected_id)
        cache_value = {
            "applied": metadata["applied"],
            "shadow": metadata["shadow"],
            "proposed_id": metadata["proposed_id"],
            "confidence": metadata["confidence"],
            "reason_codes": metadata["reason_codes"],
            "fallback": False,
            "reason": metadata["reason"],
            "http_status": metadata.get("http_status", 200),
            "changed_selection": metadata.get("changed_selection", False),
        }
        _cache_put(cache_key, cache_value)
        return metadata
    except requests.Timeout:
        metadata["reason"] = "ollama_timeout"
        return metadata
    except requests.RequestException as exc:
        metadata["reason"] = f"ollama_network_{type(exc).__name__}"
        return metadata
    except Exception as exc:
        metadata["reason"] = f"ai_internal_{type(exc).__name__}"
        return metadata
    finally:
        metadata["latency_ms"] = int((time.perf_counter() - started) * 1000)
