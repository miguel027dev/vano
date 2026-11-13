"""Administrative map occurrence cleanup keeps radar reports and moderation history."""
import importlib
import os
import sqlite3

import pytest
from werkzeug.exceptions import BadRequest

os.environ.update(VANO_SKIP_DB_INIT="1", VANO_DB_INIT_ONLY="1", VANO_KEEPALIVE_ENABLED="0")
import app as runtime

admin = importlib.import_module("vano.routes.admin")


@pytest.fixture
def cleanup(monkeypatch):
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute("CREATE TABLE reports (id INTEGER PRIMARY KEY, category TEXT NOT NULL, status TEXT NOT NULL)")
    conn.executemany(
        "INSERT INTO reports(id, category, status) VALUES(?, ?, ?)",
        [
            (1, "accident", "active"),
            (2, "traffic", "active"),
            (3, "speed_camera", "active"),
            (4, "accident", "resolved"),
            (5, "blitz", "active"),
        ],
    )
    conn.commit()
    events = []
    invalidations = []
    monkeypatch.setattr(admin, "get_db", lambda: conn)
    monkeypatch.setattr(admin, "validate_csrf", lambda: True)
    monkeypatch.setattr(admin, "audit", lambda *args, **kwargs: events.append((args, kwargs)))
    monkeypatch.setattr(admin, "invalidate_route_context", invalidations.append)
    yield conn, events, invalidations
    conn.close()


def submit(confirmation):
    with runtime.app.test_request_context(
        "/admin/reports/clear-map",
        method="POST",
        data={"confirmation": confirmation, "csrf_token": "synthetic"},
    ):
        # Authorization is tested via the actual route below; this exercises
        # the business logic with an isolated in-memory database.
        return admin.admin_clear_map_occurrences.__wrapped__()


def test_map_cleanup_preserves_speed_cameras_and_history(cleanup):
    db, events, invalidations = cleanup
    response = submit("LIMPAR")
    assert response.status_code == 302
    assert response.location.endswith("/admin/reports")
    rows = dict(db.execute("SELECT id, status FROM reports").fetchall())
    assert rows == {1: "resolved", 2: "resolved", 3: "active", 4: "resolved", 5: "resolved"}
    assert db.execute("SELECT COUNT(*) FROM reports").fetchone()[0] == 5
    assert invalidations == ["reports"]
    assert events[0][0][0] == "admin_clear_map_occurrences"
    assert events[0][0][1]["resolved_reports"] == 3


@pytest.mark.parametrize("confirmation", ["", "APAGAR", "cancelado"])
def test_map_cleanup_requires_explicit_confirmation(cleanup, confirmation):
    db, events, invalidations = cleanup
    assert submit(confirmation).status_code == 302
    assert db.execute("SELECT COUNT(*) FROM reports WHERE status='active'").fetchone()[0] == 4
    assert events == []
    assert invalidations == []


def test_map_cleanup_rejects_missing_csrf(cleanup, monkeypatch):
    db, events, invalidations = cleanup
    monkeypatch.setattr(admin, "validate_csrf", lambda: False)
    with pytest.raises(BadRequest):
        submit("LIMPAR")
    assert db.execute("SELECT COUNT(*) FROM reports WHERE status='active'").fetchone()[0] == 4


def test_map_cleanup_is_admin_only():
    response = runtime.app.test_client().post(
        "/admin/reports/clear-map",
        data={"confirmation": "LIMPAR"},
        base_url="https://localhost",
    )
    assert response.status_code in (401, 403)
