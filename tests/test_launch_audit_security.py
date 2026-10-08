"""Behavioral regressions for launch findings; isolated synthetic accounts only."""
import importlib
import json
import os
import re
import sqlite3
import time
from pathlib import Path
from unittest.mock import MagicMock

import pytest

os.environ.update(VANO_SKIP_DB_INIT="1", VANO_DB_INIT_ONLY="1", VANO_KEEPALIVE_ENABLED="0", VANO_ADMIN_EMAIL="ci@example.invalid")
import app as runtime
from vano.security.route_integrity import attest_route, valid_attestation, valid_geometry, valid_metrics
from vano.security.redaction import redact_path


class TestDB:
    __test__ = False
    def __init__(self):
        self.connection = sqlite3.connect(":memory:")
        self.connection.row_factory = sqlite3.Row
    def execute(self, *args):
        return self.connection.execute(*args)
    def executemany(self, *args):
        return self.connection.executemany(*args)
    def commit(self):
        self.connection.commit()
    def rollback(self):
        self.connection.rollback()
    def close(self):
        pass  # request teardown must not destroy the synthetic test database


@pytest.fixture
def db(monkeypatch):
    db = TestDB()
    schema = (Path(__file__).parents[1]/"vano/infrastructure/database.py").read_text()
    for name in ("users", "auth_sessions", "password_reset_tokens", "shared_routes", "privacy_requests", "nearby_presence", "saved_places", "live_trips"):
        ddl = re.search(r"CREATE TABLE IF NOT EXISTS " + name + r" \(.*?\);", schema, re.S)[0]
        ddl = re.sub(r"(?:BIGSERIAL|SERIAL) PRIMARY KEY", "INTEGER PRIMARY KEY AUTOINCREMENT", ddl)
        db.connection.executescript(ddl)
    replacements = {"get_db": lambda: db, "record_user_access": lambda *a, **k: None,
                    "record_activity": lambda *a, **k: None, "audit": lambda *a, **k: None,
                    "rate_limit": lambda *a, **k: True}
    modules = [runtime] + [importlib.import_module(n) for n in (
        "vano.security.auth", "vano.routes.auth", "vano.routes.core", "vano.routes.public",
        "vano.routes.community", "vano.routes.api", "vano.infrastructure.database",
        "vano.infrastructure.observability")]
    for module in modules:
        for name, value in replacements.items():
            monkeypatch.setattr(module, name, value)
    db.execute("INSERT INTO users(name,email,password_hash,role,locale,created_at,age,sex,onboarding_completed_at) VALUES(?,?,?,?,?,?,?,?,?)",
               ("QA", "qa@example.invalid", runtime.hash_password("SyntheticPassword123!"), "user", "pt-BR", runtime.utcnow_iso(), 30, "prefer_not_say", runtime.utcnow_iso()))
    db.commit()
    yield db
    db.connection.close()


def signin(client, db, empty_name=False):
    if empty_name:
        db.execute("UPDATE users SET name='',onboarding_completed_at=NULL WHERE id=1")
        db.commit()
    with client.session_transaction() as s:
        s["csrf_token"] = "test-csrf"
    r = client.post("/login", data={"email": "qa@example.invalid", "password": "SyntheticPassword123!", "csrf_token": "test-csrf"}, base_url="https://localhost")
    assert r.status_code == 302
    return r


def test_logout_revokes_signed_cookie_without_remember_cookie(db):
    client = runtime.app.test_client()
    signin(client, db)
    original = client.get_cookie("session").value
    with client.session_transaction() as s:
        csrf = s["csrf_token"]
    assert client.post("/logout", data={"csrf_token": csrf}, base_url="https://localhost").status_code == 302
    replay = runtime.app.test_client()
    replay.set_cookie("session", original)
    r = replay.get("/api/saved-places", base_url="https://localhost")
    assert r.status_code == 401
    assert r.json["error"] == "unauthorized"


def test_server_revocation_rejects_signed_session_and_remember_cookie(db):
    client = runtime.app.test_client()
    signin(client, db)
    db.execute("UPDATE auth_sessions SET revoked_at=?", (runtime.utcnow_iso(),));db.commit()
    assert client.get("/api/saved-places", base_url="https://localhost").status_code == 401


def test_empty_name_returns_to_onboarding(db):
    client = runtime.app.test_client()
    r = signin(client, db, empty_name=True)
    assert "/onboarding" in r.location
    assert client.get("/terms", base_url="https://localhost").status_code == 200
    assert client.get("/privacy", base_url="https://localhost").status_code == 200


def test_unauthenticated_api_contract(db):
    for path in ("/api/saved-places", "/api/weekly-routine", "/api/notifications/unread"):
        r = runtime.app.test_client().get(path, base_url="https://localhost")
        assert r.status_code == 401 and r.is_json


def test_google_does_not_auto_link_unverified_local_account(db, monkeypatch):
    auth = importlib.import_module("vano.routes.auth")
    monkeypatch.setattr(auth, "google_ready", lambda: True)
    monkeypatch.setattr(auth, "consume_google_oauth_state", lambda s: {"redirect_uri": "https://localhost/login/google/callback", "next_url": "/map", "fingerprint": ""})
    monkeypatch.setattr(auth, "google_user_from_token", lambda s: {"sub": "synthetic-sub", "email": "qa@example.invalid", "email_verified": True, "name": "QA"})
    response = MagicMock();response.json.return_value = {"access_token": "synthetic"}
    monkeypatch.setattr(auth.requests, "post", lambda *a, **k: response)
    client = runtime.app.test_client()
    with client.session_transaction() as s:s["google_oauth_state"] = "synthetic-state"
    r = client.get("/login/google/callback?state=synthetic-state&code=synthetic-code", base_url="https://localhost")
    assert r.status_code == 302 and r.location.endswith("/login")
    assert db.execute("SELECT google_sub FROM users WHERE id=1").fetchone()[0] is None


def test_explicit_recent_google_link_succeeds(db, monkeypatch):
    auth = importlib.import_module("vano.routes.auth")
    monkeypatch.setattr(auth, "google_ready", lambda: True)
    monkeypatch.setattr(auth, "consume_google_oauth_state", lambda s: {"redirect_uri": "https://localhost/login/google/callback", "next_url": "/profile", "fingerprint": ""})
    monkeypatch.setattr(auth, "google_user_from_token", lambda s: {"sub": "synthetic-sub", "email": "qa@example.invalid", "email_verified": True, "name": "QA"})
    response = MagicMock();response.json.return_value = {"access_token": "synthetic"}
    monkeypatch.setattr(auth.requests, "post", lambda *a, **k: response)
    client = runtime.app.test_client();signin(client, db)
    with client.session_transaction() as s:
        s["google_oauth_state"] = "synthetic-state";s["google_link_user_id"] = 1
    r = client.get("/login/google/callback?state=synthetic-state&code=synthetic-code", base_url="https://localhost")
    assert r.status_code == 302
    assert db.execute("SELECT google_sub FROM users WHERE id=1").fetchone()[0] == "synthetic-sub"


def test_google_delete_requires_recent_authentication(db):
    client = runtime.app.test_client();signin(client, db)
    db.execute("UPDATE users SET auth_provider='google'");db.commit()
    with client.session_transaction() as s:
        s["reauthenticated_at"] = time.time()-3600;csrf = s["csrf_token"]
    r = client.post("/account/delete", data={"confirmation": "EXCLUIR", "csrf_token": csrf}, base_url="https://localhost")
    assert r.status_code == 302 and "google" in r.location
    assert db.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 1


def route_fixture():
    return {"geometry": {"type": "LineString", "coordinates": [[-46.63, -23.55], [-46.62, -23.54]]},
            "distance": 1400, "duration": 300, "duration_min": 5, "safety_score": 72,
            "safety_level": 2, "traffic_score": 10, "profile": "driving", "shared_mode": "safest"}


def test_route_attestation_rejects_tampering_and_expiry():
    route = route_fixture();route["attestation"] = attest_route(route, "test-secret", now=1000)
    assert valid_attestation(route, "test-secret", now=1010)
    route["safety_score"] = 99
    assert not valid_attestation(route, "test-secret", now=1010)
    route["safety_score"] = 72
    assert not valid_attestation(route, "test-secret", now=1000+7*3600)
    assert not valid_attestation(route, "wrong-secret", now=1010)


@pytest.mark.parametrize("point", [[181, 0], [0, 91], [float('nan'), 0], [True, 0], [0], "x"])
def test_invalid_geometry_is_rejected(point):
    assert not valid_geometry({"type": "LineString", "coordinates": [[0, 0], point]})


def test_share_route_validation_and_revocation(db):
    client = runtime.app.test_client();signin(client, db)
    with client.session_transaction() as s:csrf = s["csrf_token"]
    route = route_fixture();route["attestation"] = attest_route(route, runtime.SECRET_KEY)
    body = {"origin": {"lat": -23.55, "lon": -46.63}, "destination": {"lat": -23.54, "lon": -46.62}, "profile": "driving", "mode": "safest", "route": route}
    r = client.post("/api/share-route", json=body, headers={"X-CSRF-Token": csrf}, base_url="https://localhost")
    assert r.status_code == 200
    token = r.json["token"]
    assert client.get("/api/shared-route/"+token, base_url="https://localhost").status_code == 200
    route["safety_score"] = 99
    assert client.post("/api/share-route", json=body, headers={"X-CSRF-Token": csrf}, base_url="https://localhost").status_code == 400
    assert client.post("/api/shared-route/"+token+"/revoke", headers={"X-CSRF-Token": csrf}, base_url="https://localhost").status_code == 200
    assert client.get("/api/shared-route/"+token, base_url="https://localhost").status_code == 404


def test_private_apis_are_not_cached(db):
    client = runtime.app.test_client();signin(client, db)
    for path in ("/privacy", "/api/saved-places", "/api/shared-routes"):
        r = client.get(path, base_url="https://localhost")
        assert r.status_code == 200 and "no-store" in r.headers["Cache-Control"]


def test_sensitive_paths_redact_tokens_and_queries():
    for path in ("/live/", "/api/live-trip/", "/route/share/", "/reset-password/", "/family/invite/"):
        assert "synthetic-token" not in redact_path(path+"synthetic-token?secret=value")
        assert "value" not in redact_path(path+"synthetic-token?secret=value")


def test_normal_registration_cannot_claim_admin_email(db):
    client = runtime.app.test_client()
    with client.session_transaction() as s:s["csrf_token"] = "test-csrf"
    r = client.post("/register", data={"email": runtime.PRIMARY_ADMIN_EMAIL, "password": "SyntheticPassword123!", "csrf_token": "test-csrf"}, base_url="https://localhost")
    assert r.status_code == 400
    assert db.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 1


def test_public_privacy_intake_does_not_disclose_or_delete_account(db):
    client = runtime.app.test_client()
    with client.session_transaction() as s:s["csrf_token"] = "test-csrf"
    r = client.post("/privacy/request", data={"email": "qa@example.invalid", "request_type": "deletion", "csrf_token": "test-csrf"}, base_url="https://localhost")
    assert r.status_code == 302
    row = db.execute("SELECT user_id,request_type,status FROM privacy_requests").fetchone()
    assert row["user_id"] is None and row["request_type"] == "deletion" and row["status"] == "pending"
    assert db.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 1


def test_live_stop_removes_position_and_stale_positions_are_hidden(db):
    from datetime import datetime, timedelta, timezone
    client = runtime.app.test_client(); signin(client, db)
    with client.session_transaction() as s: csrf = s['csrf_token']
    headers = {'X-CSRF-Token': csrf}
    created = client.post('/api/live-trip', json={}, headers=headers, base_url='https://localhost')
    assert created.status_code == 200
    token = created.json['token']
    update = client.post(f'/api/live-trip/{token}/update', json={'lat':-23.5,'lon':-46.6}, headers=headers, base_url='https://localhost')
    assert update.status_code == 200
    assert client.get(f'/api/live-trip/{token}').json['position_fresh'] is True
    db.execute('UPDATE live_trips SET updated_at=?', ((datetime.now(timezone.utc)-timedelta(minutes=3)).isoformat(),)); db.commit()
    stale = client.get(f'/api/live-trip/{token}').json
    assert stale['position_fresh'] is False and stale['lat'] is None and stale['lon'] is None
    assert client.post(f'/api/live-trip/{token}/stop',headers=headers,base_url='https://localhost').status_code == 200
    assert client.get(f'/api/live-trip/{token}').json['active'] is False
    assert db.execute('SELECT last_lat,last_lon FROM live_trips').fetchone()['last_lat'] is None
