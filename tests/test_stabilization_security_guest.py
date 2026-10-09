"""First stabilization batch: behavior tests for API privacy, voice and trial selectors."""
import importlib
import os
import shutil
import subprocess
from pathlib import Path

import pytest
from flask import Response

os.environ.update(
    VANO_SKIP_DB_INIT="1", VANO_DB_INIT_ONLY="1",
    VANO_KEEPALIVE_ENABLED="0", VANO_ADMIN_EMAIL="ci@example.invalid",
)
import app as runtime

ROOT = Path(__file__).resolve().parents[1]


def test_guest_controls_work_during_trial_and_stop_when_exhausted():
    node = shutil.which("node")
    if not node:
        pytest.skip("Node required for map UI behavior regression")
    p = subprocess.run(
        [node, "tests/guest_route_controls.cjs"], cwd=ROOT,
        text=True, capture_output=True, timeout=15, check=False,
    )
    assert p.returncode == 0, p.stdout + "\n" + p.stderr
    assert "PASS: guest route/profile" in p.stdout


def test_geocode_does_not_expose_provider_exceptions(monkeypatch):
    api = importlib.import_module("vano.routes.api")
    marker = "SENSITIVE_UPSTREAM_DETAILS_DO_NOT_EXPOSE"

    def broken(*args, **kwargs):
        raise RuntimeError(marker)

    logs = []
    monkeypatch.setattr(api, "rate_limit", lambda *args, **kwargs: True)
    monkeypatch.setattr(api, "smart_location_search", broken)
    monkeypatch.setattr(api.app.logger, "exception", lambda *a, **kw: logs.append(a[0]))
    with runtime.app.test_request_context("/api/geocode?q=Rua+Exemplo", base_url="https://localhost"):
        response, status = api.api_geocode()
        assert status == 502
        payload = response.get_json()
    assert payload == {
        "error": "Busca de endereço temporariamente indisponível.",
        "code": "geocode_unavailable",
    }
    assert marker not in str(payload)
    assert logs == ["Geocoding provider request failed"]


def test_reverse_geocode_uses_safe_warning(monkeypatch):
    api = importlib.import_module("vano.routes.api")
    marker = "UPSTREAM_API_TOKEN_SHOULD_BE_PRIVATE"

    def broken(*args, **kwargs):
        raise RuntimeError(marker)

    monkeypatch.setattr(api, "rate_limit", lambda *args, **kwargs: True)
    monkeypatch.setattr(api, "mapbox_reverse_geocode", broken)
    monkeypatch.setattr(api.app.logger, "exception", lambda *a, **kw: None)
    with runtime.app.test_request_context("/api/reverse?lat=-23.55&lon=-46.63", base_url="https://localhost"):
        response = api.api_reverse()
        payload = response.get_json()
    assert payload["code"] == "reverse_unavailable"
    assert payload["label"] == "-23.55000, -46.63000"
    assert marker not in str(payload)
    assert "warning" in payload


def test_provider_failure_bodies_do_not_expose_tracebacks():
    for path in ("vano/routes/api.py", "vano/routes/routing.py"):
        source = (ROOT / path).read_text(encoding="utf-8")
        assert '"detail": str(exc)' not in source
        assert '"warning": str(exc)' not in source
    route = (ROOT / "vano/routes/routing.py").read_text(encoding="utf-8")
    assert '"code": "routing_unavailable"' in route


def test_map_alone_can_request_microphone_in_default_policy(monkeypatch):
    headers = importlib.import_module("vano.security.headers")
    monkeypatch.delenv("VANO_PERMISSIONS_POLICY", raising=False)
    with runtime.app.test_request_context("/", base_url="https://localhost"):
        response = headers.security_headers(Response("<html>VANO</html>", mimetype="text/html"))
        assert "microphone=(self)" in response.headers["Permissions-Policy"]
        assert "camera=()" in response.headers["Permissions-Policy"]
    with runtime.app.test_request_context("/login", base_url="https://localhost"):
        response = headers.security_headers(Response("<html>Login</html>", mimetype="text/html"))
        assert "microphone=()" in response.headers["Permissions-Policy"]
    monkeypatch.setenv("VANO_PERMISSIONS_POLICY", "custom-explicit-policy")
    with runtime.app.test_request_context("/", base_url="https://localhost"):
        response = headers.security_headers(Response("<html>VANO</html>", mimetype="text/html"))
        assert "microphone=()" in response.headers["Permissions-Policy"], "Explicit admin policy remains authoritative"
