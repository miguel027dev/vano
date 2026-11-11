"""Deterministic, explainable safety-first ranking for existing legal route candidates.

Does not create roads, override closures, use neighborhood/demographic proxies,
or infer that missing reports imply safety.
"""
from __future__ import annotations
import math

SAFE_PRIORITY_VERSION = "safe-priority-v1"
SAFE_PRIORITY_WEIGHTS = {
    "conservative_safety": .70,
    "hotspot_avoidance": .15,
    "corridor_exposure_avoidance": .10,
    "data_confidence": .05,
}
MAX_ETA_TIE_PENALTY = .25


def _number(value, default=None):
    try:
        result = float(value)
        return result if math.isfinite(result) else default
    except (TypeError, ValueError, OverflowError):
        return default


def _clamp(value, low=0.0, high=100.0):
    return min(high, max(low, value))


def score_safe_candidate(route, fastest_duration_s):
    """Annotate a route and return its comparable Safe score or None.

    Composite: 0.70*C + 0.15*(100-H) + 0.10*(100-E) + 0.05*Q
    where C is conservative safety, H hotspot risk, E exposure percentage,
    Q data confidence (all 0..100). Time is only a max 0.25-point
    tie-break penalty. Distance has no weight.
    """
    conservative = _number(route.get("safety_conservative_score"))
    if conservative is None:
        conservative = _number(route.get("safety_score"))
    if conservative is None:
        route["safe_priority_score"] = None
        route["safe_priority_components"] = {"status": "unavailable"}
        return None
    c = _clamp(conservative)
    hotspot = _clamp(_number(route.get("hotspot_risk"), 50.0))
    exposure = _clamp(_number(route.get("risk_exposure_pct"), 50.0))
    confidence = _clamp(_number(route.get("data_confidence"), 30.0))
    observed = {
        "conservative_safety": c,
        "hotspot_avoidance": 100.0-hotspot,
        "corridor_exposure_avoidance": 100.0-exposure,
        "data_confidence": confidence,
    }
    raw = sum(observed[key] * weight for key, weight in SAFE_PRIORITY_WEIGHTS.items())
    duration = max(1.0, _number(route.get("duration"), fastest_duration_s) or fastest_duration_s)
    ratio = max(0.0, duration/max(fastest_duration_s, 1.0)-1.0)
    eta_penalty = min(MAX_ETA_TIE_PENALTY, .15 * math.log1p(ratio))
    final = _clamp(raw - eta_penalty)
    route["safe_priority_score"] = round(final, 3)
    route["safe_priority_components"] = {
        **{k: round(v, 2) for k,v in observed.items()},
        "eta_tiebreak_penalty": round(eta_penalty, 4),
        "distance_weight": 0,
        "formula": "0.70*C + 0.15*(100-H) + 0.10*(100-E) + 0.05*Q - Ptime",
        "version": SAFE_PRIORITY_VERSION,
    }
    return final


def rank_safe_routes(routes):
    """Rank prevalidated alternatives. Unknown scores rank last, never as safe.

    This function intentionally never eliminates the only legal candidate:
    insufficient evidence is reported through the confidence component.
    """
    pool = list(routes or [])
    fastest = min((max(1.0, _number(x.get("duration"), 1.0) or 1.0) for x in pool), default=1.0)
    for route in pool:
        score_safe_candidate(route, fastest)
    return sorted(pool, key=lambda r: (
        r.get("safe_priority_score") is None,
        -float(r["safe_priority_score"]) if r.get("safe_priority_score") is not None else 0,
        -(_number(r.get("safety_conservative_score"), 0.0) or 0.0),
        _number(r.get("duration"), 1e12) or 1e12,
        str(r.get("id", "")),
    ))
