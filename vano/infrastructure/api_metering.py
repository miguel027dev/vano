"""Bounded API metering using VANO's existing asynchronous activity queue.

Only categorization, result status and elapsed milliseconds are retained.
No query strings, tokens, addresses or request/response bodies are stored.
"""
import time
from flask import has_request_context
from vano.bootstrap import inject


def record_api_sample(kind, identity, operation, status_code, duration_ms, request_bytes=0, response_bytes=0):
    """Keep telemetry fail-open even for background worker HTTP calls."""
    try:
        identity = str(identity or "")[:64]
        if not identity:
            return
        operation = str(operation or "")[:100]
        event_type = "upstream-api" if kind == "provider" else "partner-api"
        metadata = {
            ("provider" if kind == "provider" else "partner_id"): identity,
            "operation": operation,
            "request_bytes": max(0, int(request_bytes or 0)),
            "response_bytes": max(0, int(response_bytes or 0)),
        }
        status = max(0, min(599, int(status_code or 0))) or 599
        elapsed = max(0, int(duration_ms or 0))
        namespace = {}
        inject(namespace)
        if has_request_context():
            recorder = namespace.get("record_activity")
            if callable(recorder):
                recorder(event_type, metadata, status_code=status, duration_ms=elapsed)
            return

        # Concurrent ViaCEP/BrasilAPI workers and scheduled provider jobs do
        # not inherit a Flask request context. Queue an anonymous event through
        # the same audited, bounded worker instead of silently losing the call.
        queue = namespace.get("ACTIVITY_LOG_QUEUE")
        start_worker = namespace.get("_ensure_activity_log_worker")
        clock = namespace.get("utcnow_iso")
        if queue is None or not callable(start_worker) or not callable(clock):
            return
        start_worker()
        queue.put_nowait({
            "user_id": None, "event_type": event_type, "method": "OUT",
            "path": "", "endpoint": "", "status_code": status,
            "ip_address": "unknown", "user_agent": "", "referrer": "",
            "metadata": metadata, "duration_ms": elapsed,
            "created_at": clock(),
        })
    except Exception:
        # Never make map routing fail because telemetry is full or unavailable.
        pass


def metered_request(provider, operation, sender, *args, **kwargs):
    """Measure every real outbound HTTP attempt, including HTTP/network errors."""
    started = time.monotonic()
    status = 599  # Local sentinel for a request with no HTTP response.
    try:
        response = sender(*args, **kwargs)
        status = getattr(response, "status_code", 599) or 599
        return response
    finally:
        record_api_sample(
            "provider", provider, operation, status,
            int((time.monotonic() - started) * 1000),
        )
