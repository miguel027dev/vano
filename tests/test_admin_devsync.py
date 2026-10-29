"""DevSync privacy, CSRF, persistence and cooperating-agent conflict tests."""
import importlib
import os
import sqlite3
from pathlib import Path

import pytest

os.environ.update(VANO_SKIP_DB_INIT="1", VANO_DB_INIT_ONLY="1", VANO_KEEPALIVE_ENABLED="0")
import app as runtime

sync = importlib.import_module("vano.routes.devsync")
agent = importlib.import_module("vano.routes.devsync_agent")
auth = importlib.import_module("vano.security.auth")
ROOT = Path(__file__).resolve().parents[1]


class JournalDB:
    def __init__(self):
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""
            CREATE TABLE devsync_tasks(
              id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT,area TEXT,scope TEXT,branch TEXT,
              model TEXT,actor TEXT,status TEXT,summary TEXT,lease_hash TEXT,lease_expires_at TEXT,
              version INTEGER DEFAULT 1,created_at TEXT,updated_at TEXT
            );
            CREATE TABLE devsync_events(
              id INTEGER PRIMARY KEY AUTOINCREMENT,task_id INTEGER,actor TEXT,kind TEXT,body TEXT,created_at TEXT
            );
            CREATE TABLE devsync_agent_keys(
              id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT,token_hash TEXT,
              created_at TEXT,expires_at TEXT,revoked_at TEXT
            );
            CREATE TABLE users(id INTEGER PRIMARY KEY,name TEXT);
            CREATE TABLE audit_logs(id INTEGER PRIMARY KEY,action TEXT,created_at TEXT,user_id INTEGER);
        """)

    def execute(self, query, values=()):
        if "pg_advisory_xact_lock" in query:
            return self.db.execute("SELECT 1")
        return self.db.execute(query.replace(" FOR UPDATE", ""), values)

    def commit(self):
        self.db.commit()

    def rollback(self):
        self.db.rollback()


@pytest.fixture
def env(monkeypatch):
    store = JournalDB()
    monkeypatch.setattr(sync, "get_db", lambda: store)
    monkeypatch.setattr(agent, "get_db", lambda: store)
    monkeypatch.setattr(auth, "current_user", lambda: {"role": "admin", "email": "qa@example.invalid"})
    monkeypatch.setattr(auth, "is_admin_email", lambda email: True)
    client = runtime.app.test_client()
    with client.session_transaction() as session:
        session["csrf_token"] = "csrf-for-qa"
    yield client, store
    store.db.close()


def send(client, path, data, csrf=True):
    headers = {"X-CSRF-Token": "csrf-for-qa"} if csrf else {}
    return client.post(path, json=data, headers=headers, base_url="https://localhost")


def test_private_admin_boundary(env, monkeypatch):
    client, _ = env
    monkeypatch.setattr(auth, "current_user", lambda: None)
    for route in ["/admin/dev-sync", "/api/admin/dev-sync/snapshot",
                  "/api/admin/dev-sync/handoff"]:
        assert client.get(route, base_url="https://localhost").status_code == 403
    assert send(client, "/api/admin/dev-sync/tasks",
                {"title": "private", "area": "gps", "actor": "qa"}).status_code == 403


def test_csrf_and_reject_unbounded_text(env):
    client, db = env
    task = {"title": "GPS", "area": "gps", "actor": "Agent A"}
    assert send(client, "/api/admin/dev-sync/tasks", task, csrf=False).status_code == 403
    assert send(client, "/api/admin/dev-sync/tasks", {**task, "title": "x" * 161}).status_code == 400
    assert send(client, "/api/admin/dev-sync/tasks", {**task, "area": "random"}).status_code == 400
    assert db.execute("SELECT COUNT(*) FROM devsync_tasks").fetchone()[0] == 0


def test_claim_conflict_events_and_handoff(env):
    client, db = env
    a = send(client, "/api/admin/dev-sync/tasks",
             {"title": "Consertar o GPS", "area": "gps", "actor": "Agent A", "branch": "fix/a"})
    b = send(client, "/api/admin/dev-sync/tasks",
             {"title": "Outro ajuste no GPS", "area": "gps", "actor": "Agent B"})
    assert a.status_code == b.status_code == 201
    first, second = a.json["task_id"], b.json["task_id"]
    claim = send(client, f"/api/admin/dev-sync/tasks/{first}/claim",
                 {"actor": "Agent A", "model": "GPT-6"})
    assert claim.status_code == 200
    lease = claim.json["lease_token"]
    denied = send(client, f"/api/admin/dev-sync/tasks/{second}/claim", {"actor": "Agent B"})
    assert denied.status_code == 409
    assert denied.json["conflict"]["task_id"] == first
    assert send(client, f"/api/admin/dev-sync/tasks/{first}/claim",
                {"actor": "Agent B"}).status_code == 409
    assert send(client, f"/api/admin/dev-sync/tasks/{first}/transition",
                {"status": "done", "summary": "Não possuo a reserva", "lease_token": "wrong"}).status_code == 409
    event = send(client, "/api/admin/dev-sync/events",
                 {"actor": "Agent A", "kind": "progress", "task_id": first,
                  "body": "Corri testes e registrei PR #200."})
    assert event.status_code == 201
    snapshot = client.get("/api/admin/dev-sync/snapshot", base_url="https://localhost").json
    assert snapshot["protocol"] == "vano-devsync/1"
    assert len(snapshot["conflicts"]) == 1
    assert "lease_token" not in repr(snapshot)
    assert snapshot["events"][0]["body"] == "Corri testes e registrei PR #200."
    handoff = client.get("/api/admin/dev-sync/handoff", base_url="https://localhost").json
    assert handoff["ok"] and "audit" not in handoff and "lease_token" not in repr(handoff)
    done = send(client, f"/api/admin/dev-sync/tasks/{first}/transition",
                {"status": "done", "summary": "Ajuste concluído; testes pendentes no aparelho.",
                 "lease_token": lease})
    assert done.status_code == 200
    assert send(client, f"/api/admin/dev-sync/tasks/{second}/claim", {"actor": "Agent B"}).status_code == 200
    assert db.execute("SELECT COUNT(*) FROM devsync_events").fetchone()[0] >= 5


def test_frontend_escapes_untrusted_agent_messages():
    html = (ROOT / "templates/admin_devsync.html").read_text(encoding="utf-8")
    js = (ROOT / "static/vano-devsync.js").read_text(encoding="utf-8")
    app = (ROOT / "app.py").read_text(encoding="utf-8")
    schema = (ROOT / "vano/infrastructure/database.py").read_text(encoding="utf-8")
    assert "nonce=\"{{ g.csp_nonce }}\"" in html
    assert ".textContent=String(text)" in js
    assert "innerHTML=" not in js
    assert '"vano.routes.devsync"' in app
    assert "CREATE TABLE IF NOT EXISTS devsync_tasks" in schema
    assert "CREATE TABLE IF NOT EXISTS devsync_events" in schema

def test_scoped_agent_credential_workflow_and_revocation(env):
    client, db = env
    endpoint = "/api/agent/dev-sync"
    assert client.get(endpoint + "/handoff", base_url="https://localhost").status_code == 401
    create = send(client, "/api/admin/dev-sync/keys", {"name": "Argon · GPS"})
    assert create.status_code == 201
    token = create.json["token"]
    assert token.startswith("vano_ds_")
    assert token not in repr(client.get("/api/admin/dev-sync/keys", base_url="https://localhost").json)
    assert token not in repr(db.execute("SELECT * FROM devsync_agent_keys").fetchone())
    headers = {"Authorization": "Bearer " + token}
    handoff = client.get(endpoint + "/handoff", headers=headers, base_url="https://localhost")
    assert handoff.status_code == 200 and handoff.json["ok"]
    assert "audit" not in handoff.json
    task = client.post(endpoint + "/tasks", json={
        "title": "Investigar GPS", "area": "gps", "actor": "Falsificado"},
        headers=headers, base_url="https://localhost")
    assert task.status_code == 201
    task_id = task.json["task_id"]
    assert db.execute("SELECT actor FROM devsync_tasks WHERE id=?", (task_id,)).fetchone()["actor"] == "Argon · GPS"
    claim = client.post(endpoint + f"/tasks/{task_id}/claim",
                        json={"actor": "Outro"}, headers=headers, base_url="https://localhost")
    assert claim.status_code == 200
    assert claim.json["lease_token"]
    event = client.post(endpoint + "/events", json={"actor": "Outro", "task_id": task_id,
                       "kind": "progress", "body": "Revisei a orientação."}, headers=headers,
                       base_url="https://localhost")
    assert event.status_code == 201
    assert db.execute("SELECT actor FROM devsync_events ORDER BY id DESC LIMIT 1").fetchone()["actor"] == "Argon · GPS"
    assert client.get("/admin/dev-sync", headers=headers, base_url="https://localhost").status_code == 200
    assert send(client, "/api/admin/dev-sync/keys/" + str(create.json["id"]) + "/revoke", {}).status_code == 200
    assert client.get(endpoint + "/handoff", headers=headers, base_url="https://localhost").status_code == 401


def test_agent_token_cannot_open_other_admin_routes_without_admin_session(env, monkeypatch):
    client, db = env
    create = send(client, "/api/admin/dev-sync/keys", {"name": "Outro agente"})
    token = create.json["token"]
    monkeypatch.setattr(auth, "current_user", lambda: None)
    headers = {"Authorization": "Bearer " + token}
    assert client.get("/api/admin/dev-sync/snapshot", headers=headers,
                      base_url="https://localhost").status_code == 403
    assert client.get("/admin", headers=headers, base_url="https://localhost").status_code == 403
    assert client.post("/api/admin/dev-sync/tasks", headers=headers,
                       json={"title": "Invasão", "area": "gps", "actor": "none"},
                       base_url="https://localhost").status_code == 403
    assert client.get("/api/agent/dev-sync/handoff", headers=headers,
                      base_url="https://localhost").status_code == 200
