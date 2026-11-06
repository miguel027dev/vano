"""Bounded API metering using the existing VANO activity queue.

The measurement happens after the upstream HTTP attempt, not when a route is
served from cache. Never record query strings, tokens, addresses or bodies.
"""
import time
from flask import has_request_context
from vano.bootstrap import inject


def record_api_sample(kind, identity, operation, status_code, duration_ms, request_bytes=0, response_bytes=0):
    """Keep the hot path fail-open; no user request may fail due to analytics."""
    if not has_request_context():
        return
    try:
        namespace = {}
        inject(namespace)
        recorder = namespace.get("record_activity")
        if not callable(recorder):
            return
        event_type = "upstream-api" if kind == "provider" else "partner-api"
        identity = str(identity or "")[:64]
        operation = str(operation or "")[:100]
        if not identity:
            return
        metadata = {
            ("provider" if kind == "provider" else "partner_id"): identity,
            "operation": operation,
            "request_bytes": max(0, int(request_bytes or 0)),
            "response_bytes": max(0, int(response_bytes or 0)),
        }
        recorder(
            event_type,
            metadata,
            status_code=max(0, min(599, int(status_code or 0))) or 599,
            duration_ms=max(0, int(duration_ms or 0)),
        )
    except Exception:
        # Telemetry must not change routing, search or third-party responses.
        pass


def metered_request(provider, operation, sender, *args, **kwargs):
    """Measure a real outbound HTTP attempt, including rate limits and errors."""
    started = time.monotonic()
    status = 599  # Sentinel for an HTTP attempt that had no response.
    try:
        response = sender(*args, **kwargs)
        status = getattr(response, "status_code", 599) or 599
        return response
    finally:
        record_api_sample(
            "provider", provider, operation, status,
            int((time.monotonic() - started) * 1000),
        )
