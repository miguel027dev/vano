"""Gemini Live V2 preview: admin isolation and credential safety."""
from types import SimpleNamespace

import pytest
from flask import Flask, session

from vano.services.gemini_live_v2 import register_gemini_live_v2


@pytest.fixture
def app_client(monkeypatch):
    app = Flask(__name__)
    app.secret_key = "unit-test-secret"
    state = {"role": "admin", "csrf": True, "calls": 0}

    def current_user():
        return {"role": state["role"]} if state["role"] else None

    def rate_limit(*args, **kwargs):
        return True

    def validate_csrf():
        return state["csrf"]

    register_gemini_live_v2(
        app, rate_limit=rate_limit, validate_csrf=validate_csrf, current_user=current_user,
    )
    client = app.test_client()
    with client.session_transaction() as sess:
        sess["user_id"] = 7
    return client, state


def test_disabled_without_feature_flag(app_client, monkeypatch):
    client, state = app_client
    monkeypatch.delenv("VANO_GEMINI_LIVE_V2_ENABLED", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    caps = client.get("/api/admin/gemini-live/capabilities")
    assert caps.status_code == 200
    assert caps.json["enabled"] is False
    result = client.post("/api/admin/gemini-live/session", json={"model": "gemini-3.8-live"})
    assert result.status_code == 503
    assert "token" not in result.json


def test_non_admin_cannot_get_session(app_client, monkeypatch):
    client, state = app_client
    monkeypatch.setenv("VANO_GEMINI_LIVE_V2_ENABLED", "1")
    monkeypatch.setenv("GEMINI_API_KEY", "dummy-key")
    state["role"] = "user"
    assert client.get("/api/admin/gemini-live/capabilities").status_code == 403
    assert client.post("/api/admin/gemini-live/session", json={}).status_code == 403


def test_csrf_and_model_allowlist(app_client, monkeypatch):
    client, state = app_client
    monkeypatch.setenv("VANO_GEMINI_LIVE_V2_ENABLED", "1")
    monkeypatch.setenv("GEMINI_API_KEY", "dummy-key")
    state["csrf"] = False
    assert client.post("/api/admin/gemini-live/session", json={}).status_code == 403
    state["csrf"] = True
    assert client.post("/api/admin/gemini-live/session", json={"model": "other"}).status_code == 400


def test_token_issued_only_for_admin_and_key_not_returned(app_client, monkeypatch):
    client, state = app_client
    monkeypatch.setenv("VANO_GEMINI_LIVE_V2_ENABLED", "1")
    monkeypatch.setenv("GEMINI_API_KEY", "dummy-key")
    import vano.services.gemini_live_v2 as mod
    captured = {}

    def fake_post(url, **kwargs):
        captured.update({"url": url, **kwargs})
        return SimpleNamespace(
            raise_for_status=lambda: None,
            json=lambda: {"name": "temporary-token"},
        )

    monkeypatch.setattr(mod.requests, "post", fake_post)
    response = client.post("/api/admin/gemini-live/session",
                           json={"model": "gemini-3.8-live"})
    assert response.status_code == 200
    assert response.json["token"] == "temporary-token"
    assert "dummy-key" not in str(response.json)
    assert captured["headers"]["x-goog-api-key"] == "dummy-key"
    assert captured["json"]["uses"] == 1
    assert captured["json"]["liveConnectConstraints"]["config"]["responseModalities"] == ["AUDIO"]
    assert response.headers["Cache-Control"].startswith("no-store")
