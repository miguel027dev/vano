"""Scoped bearer credentials for external DevSync agents.

These credentials never authenticate general /admin routes. An administrator
creates a short-lived token and can revoke it from the DevSync dashboard.
"""
from functools import wraps
import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from vano.bootstrap import inject as _vano_inject
_vano_inject(globals())
del _vano_inject


def _agent_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        header = str(request.headers.get("Authorization", ""))
        if not header.startswith("Bearer "):
            return jsonify({"ok": False, "error": "Token de agente obrigatório."}), 401
        token = header[7:].strip()
        if len(token) < 40 or len(token) > 150 or not token.isascii():
            return jsonify({"ok": False, "error": "Credencial inválida."}), 401
        digest = hashlib.sha256(token.encode("ascii")).hexdigest()
        db = get_db()
        row = db.execute(
            """SELECT id,name FROM devsync_agent_keys WHERE token_hash=?
               AND revoked_at IS NULL AND expires_at>?""",
            (digest, utcnow_iso()),
        ).fetchone()
        if row is None:
            return jsonify({"ok": False, "error": "Credencial inválida ou expirada."}), 401
        g.devsync_agent_auth = True
        g.devsync_agent_name = row["name"]
        g.devsync_agent_key_id = row["id"]
        return view(*args, **kwargs)
    return wrapped


@app.route("/api/admin/dev-sync/keys", methods=["GET", "POST"])
@admin_required
def admin_dev_sync_keys():
    db = get_db()
    if request.method == "GET":
        rows = db.execute(
            """SELECT id,name,created_at,expires_at,revoked_at FROM devsync_agent_keys
               ORDER BY id DESC LIMIT 40"""
        ).fetchall()
        return jsonify({"ok": True, "keys": [dict(row) for row in rows]})
    if not validate_csrf():
        return jsonify({"ok": False, "error": "Sessão expirada."}), 403
    try:
        payload = request.get_json(silent=True) or {}
        name = _sync_text(payload.get("name", ""), 70, required=True)
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    active = db.execute(
        "SELECT COUNT(*) AS n FROM devsync_agent_keys WHERE revoked_at IS NULL AND expires_at>?",
        (utcnow_iso(),),
    ).fetchone()["n"]
    if active >= 12:
        return jsonify({"ok": False, "error": "Limite de credenciais ativas. Revogue uma antiga."}), 409
    token = "vano_ds_" + secrets.token_urlsafe(36)
    expires_at = (datetime.now(timezone.utc) + timedelta(days=30)).replace(microsecond=0).isoformat()
    row = db.execute(
        """INSERT INTO devsync_agent_keys(name,token_hash,created_at,expires_at)
           VALUES(?,?,?,?) RETURNING id""",
        (name, hashlib.sha256(token.encode()).hexdigest(), utcnow_iso(), expires_at),
    ).fetchone()
    db.commit()
    response = jsonify({"ok": True, "id": row["id"], "name": name, "token": token, "expires_at": expires_at})
    response.headers["Cache-Control"] = "no-store"
    return response, 201


@app.route("/api/admin/dev-sync/keys/<int:key_id>/revoke", methods=["POST"])
@admin_required
def admin_dev_sync_revoke_key(key_id):
    if not validate_csrf():
        return jsonify({"ok": False, "error": "Sessão expirada."}), 403
    db = get_db()
    cursor = db.execute(
        "UPDATE devsync_agent_keys SET revoked_at=? WHERE id=? AND revoked_at IS NULL",
        (utcnow_iso(), key_id),
    )
    if not cursor.rowcount:
        db.rollback()
        return jsonify({"ok": False, "error": "Credencial inexistente ou revogada."}), 404
    db.commit()
    return jsonify({"ok": True})


@app.route("/api/agent/dev-sync/handoff")
@_agent_required
def agent_dev_sync_handoff():
    snapshot = api_admin_dev_sync_snapshot.__wrapped__().get_json()
    snapshot.pop("audit", None)
    snapshot["events"] = snapshot["events"][:80]
    snapshot["tasks"] = snapshot["tasks"][:80]
    return jsonify(snapshot)


@app.route("/api/agent/dev-sync/tasks", methods=["POST"])
@_agent_required
def agent_dev_sync_create_task():
    return api_admin_dev_sync_create_task.__wrapped__()


@app.route("/api/agent/dev-sync/tasks/<int:task_id>/claim", methods=["POST"])
@_agent_required
def agent_dev_sync_claim(task_id):
    return api_admin_dev_sync_claim.__wrapped__(task_id)


@app.route("/api/agent/dev-sync/tasks/<int:task_id>/pulse", methods=["POST"])
@_agent_required
def agent_dev_sync_pulse(task_id):
    return api_admin_dev_sync_pulse.__wrapped__(task_id)


@app.route("/api/agent/dev-sync/tasks/<int:task_id>/transition", methods=["POST"])
@_agent_required
def agent_dev_sync_transition(task_id):
    return api_admin_dev_sync_transition.__wrapped__(task_id)


@app.route("/api/agent/dev-sync/events", methods=["POST"])
@_agent_required
def agent_dev_sync_event():
    return api_admin_dev_sync_event.__wrapped__()
