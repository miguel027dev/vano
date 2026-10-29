"""Private, persistent coordination journal for VANO administrator and authorized agents.

A claim is an advisory lease: cooperating chats MUST claim an area before editing.
This cannot block changes made by tools that never consult the journal.
"""
import hashlib
import secrets
import re
from datetime import datetime, timezone, timedelta

from vano.bootstrap import inject as _vano_inject
_vano_inject(globals())
del _vano_inject

DEVSYNC_AREAS = ("gps", "routing", "map-ui", "mavi", "backend", "android", "infrastructure", "admin", "marketing", "other")
DEVSYNC_STATUSES = ("planned", "in_progress", "blocked", "review", "done", "cancelled")
DEVSYNC_KINDS = ("message", "progress", "decision", "blocker", "handoff", "system")
DEVSYNC_LEASE_MINUTES = 15


def _sync_text(value, max_chars=200, required=False):
    if not isinstance(value, str):
        raise ValueError("Campo inválido.")
    value = re.sub(r"[\x00-\x08\x0b-\x1f\x7f]", "", value).strip()
    if len(value) > max_chars:
        raise ValueError("Campo muito longo.")
    if required and not value:
        raise ValueError("Preencha os campos obrigatórios.")
    return value


def _sync_payload():
    value = request.get_json(silent=True)
    if not isinstance(value, dict):
        raise ValueError("Envie um objeto JSON válido.")
    return value


def _sync_error(message, status=400):
    return jsonify({"ok": False, "error": message}), status


def _sync_audit(db, task_id, actor, kind, message):
    db.execute(
        "INSERT INTO devsync_events(task_id,actor,kind,body,created_at) VALUES(?,?,?,?,?)",
        (task_id, actor, kind, message, utcnow_iso()),
    )


def _sync_lease_ok(task, token):
    if not isinstance(token, str) or not token or len(token) > 200:
        return False
    stored = str(task["lease_hash"] or "")
    if not stored or not secrets.compare_digest(hashlib.sha256(token.encode("utf-8")).hexdigest(), stored):
        return False
    return bool(task["lease_expires_at"] and task["lease_expires_at"] > utcnow_iso())


def _sync_lock_area(db, area):
    # Transaction-scoped PostgreSQL advisory lock serializes competing claims.
    db.execute("SELECT pg_advisory_xact_lock(hashtext(?))", ("vano-devsync:" + area,))


@app.route("/admin/dev-sync")
@admin_required
def admin_dev_sync():
    return render_template("admin_devsync.html", areas=DEVSYNC_AREAS)


@app.route("/api/admin/dev-sync/snapshot")
@admin_required
def api_admin_dev_sync_snapshot():
    db = get_db()
    tasks = [dict(row) for row in db.execute(
        """SELECT id,title,area,scope,branch,model,actor,status,summary,lease_expires_at,
                  created_at,updated_at,version FROM devsync_tasks ORDER BY updated_at DESC,id DESC LIMIT 120"""
    ).fetchall()]
    events = [dict(row) for row in db.execute(
        """SELECT id,task_id,actor,kind,body,created_at FROM devsync_events
           ORDER BY id DESC LIMIT 140"""
    ).fetchall()]
    logs = [dict(row) for row in db.execute(
        """SELECT a.id,a.action,a.created_at,COALESCE(u.name,'Sistema') AS actor
           FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 20"""
    ).fetchall()]
    now = utcnow_iso()
    claimed = {t["area"]: t for t in tasks if t["status"] == "in_progress" and t["lease_expires_at"] and t["lease_expires_at"] > now}
    pending = [{ "task_id": t["id"], "area": t["area"], "blocked_by": claimed[t["area"]]["id"] }
               for t in tasks if t["status"] == "planned" and t["area"] in claimed]
    return jsonify({
        "ok": True, "protocol": "vano-devsync/1", "generated_at": now,
        "areas": list(DEVSYNC_AREAS), "tasks": tasks, "events": events,
        "audit": logs, "conflicts": pending,
        "stats": {"active": len(claimed), "pending": sum(t["status"] == "planned" for t in tasks),
                  "blocked": sum(t["status"] == "blocked" for t in tasks)},
        "rules": {
            "before_edit": "GET snapshot; POST claim for the work area, then record progress.",
            "after_edit": "Post progress, branch, commit/PR references and finish or handoff.",
            "lease_minutes": DEVSYNC_LEASE_MINUTES,
            "auth": "admin session + CSRF for writes",
            "scope": "advisory locks for agents using this protocol, not a GitHub lock",
        },
    })


@app.route("/api/admin/dev-sync/handoff")
@admin_required
def api_admin_dev_sync_handoff():
    """Machine-readable shared context; contains no lease token or secret logs."""
    response = api_admin_dev_sync_snapshot().get_json()
    response["events"] = response["events"][:80]
    response["tasks"] = response["tasks"][:80]
    response.pop("audit", None)
    return jsonify(response)


@app.route("/api/admin/dev-sync/tasks", methods=["POST"])
@admin_required
def api_admin_dev_sync_create_task():
    if not validate_csrf():
        return _sync_error("Sessão expirada.", 403)
    try:
        payload = _sync_payload()
        title = _sync_text(payload.get("title", ""), 160, required=True)
        area = payload.get("area")
        if area not in DEVSYNC_AREAS:
            raise ValueError("Área inválida.")
        scope = _sync_text(payload.get("scope", ""), 160)
        actor = _sync_text(payload.get("actor", ""), 70, required=True)
        model = _sync_text(payload.get("model", ""), 70)
        branch = _sync_text(payload.get("branch", ""), 180)
        summary = _sync_text(payload.get("summary", ""), 1000)
    except ValueError as exc:
        return _sync_error(str(exc))
    db = get_db()
    now = utcnow_iso()
    row = db.execute(
        """INSERT INTO devsync_tasks(title,area,scope,branch,model,actor,status,summary,created_at,updated_at)
           VALUES(?,?,?,?,?,?,'planned',?,?,?) RETURNING id""",
        (title, area, scope, branch, model, actor, summary, now, now),
    ).fetchone()
    task_id = row["id"]
    _sync_audit(db, task_id, actor, "system", "Tarefa registrada: " + title)
    db.commit()
    return jsonify({"ok": True, "task_id": task_id}), 201


@app.route("/api/admin/dev-sync/tasks/<int:task_id>/claim", methods=["POST"])
@admin_required
def api_admin_dev_sync_claim(task_id):
    if not validate_csrf():
        return _sync_error("Sessão expirada.", 403)
    try:
        payload = _sync_payload()
        actor = _sync_text(payload.get("actor", ""), 70, required=True)
        model = _sync_text(payload.get("model", ""), 70)
        old_token = payload.get("lease_token")
    except ValueError as exc:
        return _sync_error(str(exc))
    db = get_db()
    try:
        current = db.execute("SELECT * FROM devsync_tasks WHERE id=?", (task_id,)).fetchone()
        if current is None:
            return _sync_error("Tarefa não encontrada.", 404)
        _sync_lock_area(db, current["area"])
        current = db.execute("SELECT * FROM devsync_tasks WHERE id=? FOR UPDATE", (task_id,)).fetchone()
        if current["status"] in ("done", "cancelled"):
            db.rollback()
            return _sync_error("Tarefa encerrada.", 409)
        if current["status"] == "in_progress" and current["lease_expires_at"] and current["lease_expires_at"] > utcnow_iso() and not _sync_lease_ok(current, old_token):
            db.rollback()
            return _sync_error("Esta tarefa já está reservada. Aguarde ou solicite handoff.", 409)
        conflict = db.execute(
            """SELECT id,actor,lease_expires_at FROM devsync_tasks
               WHERE id<>? AND area=? AND status='in_progress' AND lease_expires_at>?
               ORDER BY id LIMIT 1""", (task_id, current["area"], utcnow_iso()),
        ).fetchone()
        if conflict:
            db.rollback()
            return jsonify({"ok": False, "error": "Área ocupada por outro trabalho.", "conflict": {
                "task_id": conflict["id"], "actor": conflict["actor"], "until": conflict["lease_expires_at"],
            }}), 409
        token = old_token if _sync_lease_ok(current, old_token) else secrets.token_urlsafe(32)
        until = (datetime.now(timezone.utc) + timedelta(minutes=DEVSYNC_LEASE_MINUTES)).replace(microsecond=0).isoformat()
        db.execute(
            """UPDATE devsync_tasks SET status='in_progress',actor=?,model=?,lease_hash=?,
               lease_expires_at=?,updated_at=?,version=version+1 WHERE id=?""",
            (actor, model, hashlib.sha256(token.encode()).hexdigest(), until, utcnow_iso(), task_id),
        )
        _sync_audit(db, task_id, actor, "system", "Assumiu a área " + current["area"] + " até " + until)
        db.commit()
        return jsonify({"ok": True, "task_id": task_id, "lease_token": token, "lease_expires_at": until})
    except Exception:
        db.rollback()
        app.logger.exception("DevSync claim failed")
        return _sync_error("Não foi possível reservar a área.", 500)


@app.route("/api/admin/dev-sync/tasks/<int:task_id>/pulse", methods=["POST"])
@admin_required
def api_admin_dev_sync_pulse(task_id):
    if not validate_csrf():
        return _sync_error("Sessão expirada.", 403)
    try:
        token = _sync_payload().get("lease_token")
    except ValueError as exc:
        return _sync_error(str(exc))
    db = get_db()
    row = db.execute("SELECT * FROM devsync_tasks WHERE id=? FOR UPDATE", (task_id,)).fetchone()
    if not row or row["status"] != "in_progress" or not _sync_lease_ok(row, token):
        db.rollback()
        return _sync_error("Reserva expirada ou inválida.", 409)
    until = (datetime.now(timezone.utc) + timedelta(minutes=DEVSYNC_LEASE_MINUTES)).replace(microsecond=0).isoformat()
    db.execute("UPDATE devsync_tasks SET lease_expires_at=? WHERE id=?", (until, task_id))
    db.commit()
    return jsonify({"ok": True, "lease_expires_at": until})


@app.route("/api/admin/dev-sync/tasks/<int:task_id>/transition", methods=["POST"])
@admin_required
def api_admin_dev_sync_transition(task_id):
    if not validate_csrf():
        return _sync_error("Sessão expirada.", 403)
    try:
        payload = _sync_payload()
        status = payload.get("status")
        if status not in ("blocked", "review", "done", "cancelled"):
            raise ValueError("Status inválido.")
        body = _sync_text(payload.get("summary", ""), 1000, required=True)
        token = payload.get("lease_token")
    except ValueError as exc:
        return _sync_error(str(exc))
    db = get_db()
    row = db.execute("SELECT * FROM devsync_tasks WHERE id=? FOR UPDATE", (task_id,)).fetchone()
    if not row or row["status"] != "in_progress" or not _sync_lease_ok(row, token):
        db.rollback()
        return _sync_error("Somente quem possui a reserva ativa pode encerrar ou transferir esta tarefa.", 409)
    db.execute(
        """UPDATE devsync_tasks SET status=?,summary=?,lease_hash=NULL,
           lease_expires_at=NULL,updated_at=?,version=version+1 WHERE id=?""",
        (status, body, utcnow_iso(), task_id),
    )
    _sync_audit(db, task_id, row["actor"], "handoff" if status == "review" else "system", status + ": " + body)
    db.commit()
    return jsonify({"ok": True, "status": status})


@app.route("/api/admin/dev-sync/events", methods=["POST"])
@admin_required
def api_admin_dev_sync_event():
    if not validate_csrf():
        return _sync_error("Sessão expirada.", 403)
    try:
        payload = _sync_payload()
        actor = _sync_text(payload.get("actor", ""), 70, required=True)
        kind = payload.get("kind", "message")
        if kind not in DEVSYNC_KINDS or kind == "system":
            raise ValueError("Tipo de registro inválido.")
        body = _sync_text(payload.get("body", ""), 1600, required=True)
        task_id = payload.get("task_id")
        if task_id in (None, "", 0, "0"):
            task_id = None
        else:
            if isinstance(task_id, bool) or not str(task_id).isdigit() or not 0 < int(task_id) < 2**31:
                raise ValueError("Tarefa inválida.")
            task_id = int(task_id)
    except ValueError as exc:
        return _sync_error(str(exc))
    db = get_db()
    if task_id is not None and not db.execute("SELECT id FROM devsync_tasks WHERE id=?", (task_id,)).fetchone():
        return _sync_error("Tarefa não encontrada.", 404)
    _sync_audit(db, task_id, actor, kind, body)
    db.commit()
    return jsonify({"ok": True}), 201
