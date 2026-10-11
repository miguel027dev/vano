"""Offline-first assistant contract: isolation, consent and provider-error privacy."""
import importlib
import os
from pathlib import Path

import pytest
import requests
from flask import Flask

from vano.services import voice_assistant as voice

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def client(monkeypatch):
    for key in (
        "VANO_VOICE_CLOUD_ENABLED", "VANO_NVIDIA_PRODUCTION_AUTHORIZED",
        "VANO_NVIDIA_API_KEY", "VANO_NVIDIA_MODEL",
        "VANO_ELEVENLABS_LICENSED", "VANO_ELEVENLABS_API_KEY",
        "VANO_ELEVENLABS_VOICE_ID",
    ):
        monkeypatch.delenv(key, raising=False)
    app = Flask("voice-test")
    app.secret_key = "synthetic-test-secret"
    voice.register_voice_assistant(app, rate_limit=lambda *a, **k: True, validate_csrf=lambda: True)
    return app.test_client()


def _login(client):
    with client.session_transaction() as session:
        session["user_id"] = 7


def test_cloud_disabled_by_default(client):
    capability = client.get("/api/voice/capabilities")
    assert capability.status_code == 200
    assert capability.json["cloud_available"] is False
    assert capability.json["speech_available"] is False
    assert capability.headers["Cache-Control"] == "no-store"

    anonymous = client.post("/api/voice/message", json={"text": "Olá"})
    assert anonymous.status_code == 401 and anonymous.json["code"] == "login_required"
    _login(client)
    disabled = client.post("/api/voice/message", json={"text": "Olá"})
    assert disabled.status_code == 503 and disabled.json["code"] == "cloud_disabled"
    assert "nvidia" not in str(disabled.json).lower()
    tts = client.post("/api/voice/speech", json={"text": "Olá"})
    assert tts.status_code == 503 and tts.json["code"] == "speech_disabled"


def test_provider_requires_production_rights_and_secret(client, monkeypatch):
    monkeypatch.setenv("VANO_VOICE_CLOUD_ENABLED", "1")
    monkeypatch.setenv("VANO_NVIDIA_API_KEY", "dummy_test_key")
    monkeypatch.setenv("VANO_NVIDIA_MODEL", "nvidia/placeholder")
    assert client.get("/api/voice/capabilities").json["cloud_available"] is False
    monkeypatch.setenv("VANO_NVIDIA_PRODUCTION_AUTHORIZED", "1")
    assert client.get("/api/voice/capabilities").json["cloud_available"] is True
    monkeypatch.setenv("VANO_ELEVENLABS_API_KEY", "dummy_test_key")
    monkeypatch.setenv("VANO_ELEVENLABS_VOICE_ID", "fake_eligible_voice")
    assert client.get("/api/voice/capabilities").json["speech_available"] is False
    monkeypatch.setenv("VANO_ELEVENLABS_LICENSED", "1")
    assert client.get("/api/voice/capabilities").json["speech_available"] is True


def test_nvidia_response_and_translation_invoke_only_fixed_endpoint(client, monkeypatch):
    monkeypatch.setenv("VANO_VOICE_CLOUD_ENABLED", "1")
    monkeypatch.setenv("VANO_NVIDIA_PRODUCTION_AUTHORIZED", "1")
    monkeypatch.setenv("VANO_NVIDIA_API_KEY", "dummy_test_key")
    monkeypatch.setenv("VANO_NVIDIA_MODEL", "nvidia/test_model")
    _login(client)
    calls = []
    class FakeResponse:
        def raise_for_status(self): pass
        def json(self): return {"choices": [{"message": {"content": "Siga em frente."}}]}
    def post(url, **kwargs):
        calls.append((url, kwargs))
        return FakeResponse()
    monkeypatch.setattr(voice.requests, "post", post)
    response = client.post("/api/voice/message", json={"text": "Go ahead", "mode": "translate", "locale": "pt-BR"})
    assert response.status_code == 200 and response.json["text"] == "Siga em frente."
    assert response.json["mode"] == "translate"
    assert response.headers["Cache-Control"] == "no-store"
    assert calls[0][0] == voice.NVIDIA_URL
    assert calls[0][1]["json"]["messages"][0]["role"] == "system"
    assert calls[0][1]["json"]["messages"][1]["role"] == "user"
    assert "dummy_test_key" not in str(response.json)
    assert client.post("/api/voice/message",json={"text": "a"*701}).status_code == 400


def test_provider_exception_never_discloses_secret(client, monkeypatch):
    monkeypatch.setenv("VANO_VOICE_CLOUD_ENABLED", "1")
    monkeypatch.setenv("VANO_NVIDIA_PRODUCTION_AUTHORIZED", "1")
    monkeypatch.setenv("VANO_NVIDIA_API_KEY", "SENSITIVE_TEST_TOKEN")
    monkeypatch.setenv("VANO_NVIDIA_MODEL", "nvidia/test_model")
    _login(client)
    def broken(*a, **kw):
        raise requests.Timeout("SENSITIVE_TEST_TOKEN: upstream failure")
    monkeypatch.setattr(voice.requests, "post", broken)
    r = client.post("/api/voice/message", json={"text": "Olá", "mode": "answer"})
    assert r.status_code == 502
    assert "SENSITIVE_TEST_TOKEN" not in r.get_data(as_text=True)
    assert r.json["code"] == "ai_unavailable"


def test_tts_requires_entitlement_and_returns_private_audio(client, monkeypatch):
    for key,val in {
        "VANO_VOICE_CLOUD_ENABLED":"1",
        "VANO_NVIDIA_PRODUCTION_AUTHORIZED":"1",
        "VANO_NVIDIA_API_KEY":"dummy_test_key",
        "VANO_NVIDIA_MODEL":"nvidia/test_model",
        "VANO_ELEVENLABS_LICENSED":"1",
        "VANO_ELEVENLABS_API_KEY":"dummy_test_key",
        "VANO_ELEVENLABS_VOICE_ID":"fake_eligible_voice",
    }.items():monkeypatch.setenv(key,val)
    _login(client)
    class FakeResponse:
        content=b"MP3_TEST_DATA"
        headers={"Content-Type":"audio/mpeg"}
        def raise_for_status(self): pass
    def post(url,**kwargs):
        assert url.startswith(voice.ELEVEN_URL)
        assert kwargs["headers"]["xi-api-key"]=="dummy_test_key"
        return FakeResponse()
    monkeypatch.setattr(voice.requests,"post",post)
    r=client.post("/api/voice/speech",json={"text":"Bom dia"})
    assert r.status_code==200 and r.data==b"MP3_TEST_DATA"
    assert r.mimetype=="audio/mpeg" and r.headers["Cache-Control"]=="no-store"


def test_page_removes_voice_ui_and_keeps_backend_apis_available():
    base = (ROOT / "templates/base.html").read_text()
    page = (ROOT / "templates/index.html").read_text()
    headers = (ROOT / "vano/security/headers.py").read_text()
    assert "vano-voice-companion.js" not in base
    assert "vano-voice-companion.js" not in (ROOT / "static/vano-sw.js").read_text()
    assert not (ROOT / "static/vano-voice-companion.js").exists()
    for token in ["voiceSearchBtn", "soundBtn", "navVoicePopover", "voicePreviewBtn"]:
        assert 'id="' + token + '"' not in page
    assert '"/api/voice/"' in headers
    node = shutil.which("node")
    if not node:
        pytest.skip("Node.js is required")
    outcome = subprocess.run([node, test_script], cwd=ROOT, capture_output=True, text=True, check=False, timeout=20)
    assert outcome.returncode == 0, outcome.stdout + "\n" + outcome.stderr
