"""VANO administration and finance routes.

Extracted from the historical monolithic app.py without changing route bodies or
business rules. Runtime dependencies are injected once during application startup.
"""
from vano.bootstrap import inject as _vano_inject
_vano_inject(globals())
del _vano_inject

@admin_required
def api_admin_simulation_authorize():
    if not validate_csrf():
        abort(400)
    user = current_user()
    audit("admin_navigation_simulation", {"source": "map"}, user["id"] if user else None)
    return jsonify({"ok": True, "authorized": True, "mode": "local-route-simulation"})



FINANCE_CATEGORIES = [
    "Infraestrutura", "Servidores / Nodes", "Mapas / APIs", "Marketing", "Domínios e hospedagem",
    "Ferramentas / SaaS", "Impostos e taxas", "Prestadores", "Equipe", "Receita operacional", "Outros",
]
FINANCE_COST_CENTERS = ["Operação", "Infraestrutura", "Produto", "Marketing", "Administrativo", "Financeiro"]


def _finance_money_to_cents(value):
    raw = str(value or "").strip().replace("R$", "").replace(" ", "")
    if not raw:
        raise ValueError("Informe um valor.")
    if "," in raw and "." in raw:
        if raw.rfind(",") > raw.rfind("."):
            raw = raw.replace(".", "").replace(",", ".")
        else:
            raw = raw.replace(",", "")
    elif "," in raw:
        raw = raw.replace(".", "").replace(",", ".")
    try:
        amount = Decimal(raw).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError):
        raise ValueError("Valor financeiro inválido.")
    if amount <= 0 or amount > Decimal("999999999.99"):
        raise ValueError("O valor precisa ser maior que zero e dentro do limite permitido.")
    return int((amount * 100).to_integral_value(rounding=ROUND_HALF_UP))


def _finance_brl(cents):
    try:
        value = Decimal(int(cents or 0)) / Decimal(100)
    except Exception:
        value = Decimal(0)
    txt = f"{value:,.2f}"
    return "R$ " + txt.replace(",", "X").replace(".", ",").replace("X", ".")


app.jinja_env.filters["brl"] = _finance_brl


def _finance_audit(db, action, object_type, object_id=None, snapshot=None, actor_id=None):
    actor = actor_id or session.get("user_id")
    created_at = utcnow_iso()
    payload = json.dumps(snapshot or {}, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)
    envelope = json.dumps({
        "actor_user_id": actor, "action": str(action)[:80], "object_type": str(object_type)[:40],
        "object_id": object_id, "snapshot": snapshot or {}, "created_at": created_at,
    }, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)
    digest = hashlib.sha256(envelope.encode("utf-8")).hexdigest()
    db.execute(
        """INSERT INTO finance_audit_logs(actor_user_id,action,object_type,object_id,snapshot_json,snapshot_sha256,created_at)
           VALUES(?,?,?,?,?,?,?)""",
        (actor, str(action)[:80], str(object_type)[:40], object_id, payload, digest, created_at),
    )


def _finance_default_account(db):
    row = db.execute("SELECT * FROM finance_accounts ORDER BY active DESC,id ASC LIMIT 1").fetchone()
    if row:
        return row
    now = utcnow_iso()
    created = db.execute(
        """INSERT INTO finance_accounts(name,institution,account_type,currency,opening_balance_cents,active,created_by,created_at,updated_at)
           VALUES(?,?,?,?,?,?,?,?,?) RETURNING id""",
        ("Caixa VANO MAPS", "", "cash", "BRL", 0, 1, session.get("user_id"), now, now),
    ).fetchone()
    account_id = int(created["id"])
    row = db.execute("SELECT * FROM finance_accounts WHERE id=?", (account_id,)).fetchone()
    _finance_audit(db, "account_created", "account", account_id, dict(row))
    db.commit()
    return row


def _finance_accounts_with_balance(db):
    return db.execute(
        """SELECT a.*,
                  (a.opening_balance_cents + COALESCE(x.delta_cents,0)) AS balance_cents
           FROM finance_accounts a
           LEFT JOIN (
             SELECT account_id,
                    SUM(CASE WHEN status='posted' AND kind='income' THEN amount_cents
                             WHEN status='posted' AND kind='expense' THEN -amount_cents ELSE 0 END) AS delta_cents
             FROM finance_entries GROUP BY account_id
           ) x ON x.account_id=a.id
           ORDER BY a.active DESC,a.id ASC"""
    ).fetchall()


def _finance_monthly_equivalent(commitment):
    amount = int(commitment.get("amount_cents") or 0)
    cadence = str(commitment.get("cadence") or "monthly")
    if cadence == "weekly":
        return round(amount * 52 / 12)
    if cadence == "annual":
        return round(amount / 12)
    if cadence == "one_off":
        due = str(commitment.get("next_due_on") or "")[:7]
        return amount if due == datetime.now(timezone.utc).strftime("%Y-%m") else 0
    return amount


@app.route("/admin/finance")
@admin_required
def admin_finance():
    db = get_db()
    _finance_default_account(db)
    accounts = [dict(r) for r in _finance_accounts_with_balance(db)]
    now = datetime.now(timezone.utc)
    month_prefix = now.strftime("%Y-%m")
    totals = db.execute(
        """SELECT
             COALESCE(SUM(CASE WHEN status='posted' AND kind='income' THEN amount_cents ELSE 0 END),0) income_total,
             COALESCE(SUM(CASE WHEN status='posted' AND kind='expense' THEN amount_cents ELSE 0 END),0) expense_total,
             COALESCE(SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END),0) pending_count
           FROM finance_entries WHERE occurred_on LIKE ?""",
        (month_prefix + "%",),
    ).fetchone()
    cash_balance = sum(int(a.get("balance_cents") or 0) for a in accounts if int(a.get("active") or 0) == 1)
    commitments = [dict(r) for r in db.execute(
        """SELECT c.*,u.name created_by_name FROM finance_commitments c
           LEFT JOIN users u ON u.id=c.created_by ORDER BY c.active DESC,c.next_due_on ASC NULLS LAST,c.id DESC LIMIT 120"""
    ).fetchall()]
    declared_monthly = sum(_finance_monthly_equivalent(c) for c in commitments if int(c.get("active") or 0) == 1)
    entries = db.execute(
        """SELECT e.*,a.name account_name,u.name created_by_name,pu.name posted_by_name,vu.name voided_by_name
           FROM finance_entries e JOIN finance_accounts a ON a.id=e.account_id
           LEFT JOIN users u ON u.id=e.created_by
           LEFT JOIN users pu ON pu.id=e.posted_by
           LEFT JOIN users vu ON vu.id=e.voided_by
           ORDER BY e.occurred_on DESC,e.id DESC LIMIT 160"""
    ).fetchall()
    category_rows = db.execute(
        """SELECT category,COALESCE(SUM(amount_cents),0) total_cents
           FROM finance_entries WHERE status='posted' AND kind='expense' AND occurred_on LIKE ?
           GROUP BY category ORDER BY total_cents DESC LIMIT 8""",
        (month_prefix + "%",),
    ).fetchall()
    audit_rows = db.execute(
        """SELECT f.*,u.name actor_name FROM finance_audit_logs f
           LEFT JOIN users u ON u.id=f.actor_user_id ORDER BY f.id DESC LIMIT 80"""
    ).fetchall()
    return render_template(
        "admin_finance.html", accounts=accounts, entries=entries, commitments=commitments,
        finance_totals={
            "cash_balance_cents": cash_balance,
            "income_month_cents": int(totals["income_total"] or 0),
            "expense_month_cents": int(totals["expense_total"] or 0),
            "net_month_cents": int(totals["income_total"] or 0) - int(totals["expense_total"] or 0),
            "pending_count": int(totals["pending_count"] or 0),
            "declared_monthly_cents": int(declared_monthly),
        },
        category_rows=category_rows, audit_rows=audit_rows, finance_categories=FINANCE_CATEGORIES,
        finance_cost_centers=FINANCE_COST_CENTERS, month_label=now.strftime("%m/%Y"),
    )


@app.route("/admin/finance/accounts", methods=["POST"])
@admin_required
def admin_finance_account_create():
    if not validate_csrf():
        abort(400)
    name = (request.form.get("name") or "").strip()[:80]
    institution = (request.form.get("institution") or "").strip()[:80]
    account_type = (request.form.get("account_type") or "cash").strip()
    if account_type not in {"cash","checking","savings","wallet","reserve"}:
        account_type = "cash"
    if len(name) < 2:
        flash("Informe o nome da conta/caixa.", "danger")
        return redirect(url_for("admin_finance"))
    try:
        opening = _finance_money_to_cents(request.form.get("opening_balance") or "0.01") if str(request.form.get("opening_balance") or "").strip() not in {"", "0", "0,00", "0.00"} else 0
    except ValueError as exc:
        flash(str(exc), "danger"); return redirect(url_for("admin_finance"))
    db = get_db(); now = utcnow_iso()
    row = db.execute(
        """INSERT INTO finance_accounts(name,institution,account_type,currency,opening_balance_cents,active,created_by,created_at,updated_at)
           VALUES(?,?,?,?,?,?,?,?,?) RETURNING id""",
        (name,institution,account_type,"BRL",opening,1,session.get("user_id"),now,now),
    ).fetchone()
    account_id = int(row["id"])
    snapshot = dict(db.execute("SELECT * FROM finance_accounts WHERE id=?", (account_id,)).fetchone())
    _finance_audit(db,"account_created","account",account_id,snapshot); db.commit()
    audit("finance_account_created", {"account_id": account_id, "name": name})
    flash("Conta financeira criada.", "success")
    return redirect(url_for("admin_finance"))


@app.route("/admin/finance/entries", methods=["POST"])
@admin_required
def admin_finance_entry_create():
    if not validate_csrf(): abort(400)
    kind = (request.form.get("kind") or "expense").strip()
    status = (request.form.get("status") or "posted").strip()
    if kind not in {"income","expense"}: kind = "expense"
    if status not in {"pending","posted"}: status = "posted"
    try:
        account_id = int(request.form.get("account_id") or 0)
        amount_cents = _finance_money_to_cents(request.form.get("amount"))
    except (ValueError, TypeError) as exc:
        flash(str(exc) if isinstance(exc, ValueError) else "Dados financeiros inválidos.", "danger")
        return redirect(url_for("admin_finance"))
    description = (request.form.get("description") or "").strip()[:180]
    if len(description) < 3:
        flash("Descreva o lançamento.", "danger"); return redirect(url_for("admin_finance"))
    occurred_on = (request.form.get("occurred_on") or datetime.now(timezone.utc).strftime("%Y-%m-%d"))[:10]
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", occurred_on):
        occurred_on = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    db=get_db()
    account = db.execute("SELECT id FROM finance_accounts WHERE id=? AND active=1", (account_id,)).fetchone()
    if not account:
        flash("Conta financeira inválida ou inativa.", "danger"); return redirect(url_for("admin_finance"))
    now=utcnow_iso(); actor=session.get("user_id")
    row=db.execute(
        """INSERT INTO finance_entries(account_id,kind,status,amount_cents,category,description,counterparty,cost_center,payment_method,document_ref,notes,occurred_on,created_by,created_at,posted_at,posted_by)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id""",
        (account_id,kind,status,amount_cents,(request.form.get("category") or "Geral").strip()[:80],description,
         (request.form.get("counterparty") or "").strip()[:120],(request.form.get("cost_center") or "Operação").strip()[:80],
         (request.form.get("payment_method") or "").strip()[:60],(request.form.get("document_ref") or "").strip()[:100],
         (request.form.get("notes") or "").strip()[:600],occurred_on,actor,now,now if status=="posted" else None,actor if status=="posted" else None),
    ).fetchone()
    entry_id=int(row["id"]); snapshot=dict(db.execute("SELECT * FROM finance_entries WHERE id=?",(entry_id,)).fetchone())
    _finance_audit(db,"entry_created","entry",entry_id,snapshot); db.commit()
    audit("finance_entry_created", {"entry_id":entry_id,"kind":kind,"status":status,"amount_cents":amount_cents})
    flash("Lançamento financeiro registrado.", "success")
    return redirect(url_for("admin_finance"))


@app.route("/admin/finance/entries/<int:entry_id>/post", methods=["POST"])
@admin_required
def admin_finance_entry_post(entry_id):
    if not validate_csrf(): abort(400)
    db=get_db(); row=db.execute("SELECT * FROM finance_entries WHERE id=?",(entry_id,)).fetchone()
    if not row: abort(404)
    if row["status"] != "pending":
        flash("Esse lançamento não está pendente.", "warning"); return redirect(url_for("admin_finance"))
    now=utcnow_iso(); db.execute("UPDATE finance_entries SET status='posted',posted_at=?,posted_by=? WHERE id=?",(now,session.get("user_id"),entry_id))
    snapshot=dict(db.execute("SELECT * FROM finance_entries WHERE id=?",(entry_id,)).fetchone()); _finance_audit(db,"entry_posted","entry",entry_id,snapshot); db.commit()
    audit("finance_entry_posted", {"entry_id":entry_id}); flash("Lançamento confirmado no caixa.", "success")
    return redirect(url_for("admin_finance"))


@app.route("/admin/finance/entries/<int:entry_id>/void", methods=["POST"])
@admin_required
def admin_finance_entry_void(entry_id):
    if not validate_csrf(): abort(400)
    reason=(request.form.get("reason") or "Correção administrativa").strip()[:240]
    db=get_db(); row=db.execute("SELECT * FROM finance_entries WHERE id=?",(entry_id,)).fetchone()
    if not row: abort(404)
    if row["status"] == "voided":
        flash("Lançamento já estornado.", "warning"); return redirect(url_for("admin_finance"))
    before=dict(row); now=utcnow_iso()
    db.execute("UPDATE finance_entries SET status='voided',voided_at=?,voided_by=?,void_reason=? WHERE id=?",(now,session.get("user_id"),reason,entry_id))
    after=dict(db.execute("SELECT * FROM finance_entries WHERE id=?",(entry_id,)).fetchone())
    _finance_audit(db,"entry_voided","entry",entry_id,{"before":before,"after":after}); db.commit()
    audit("finance_entry_voided", {"entry_id":entry_id,"reason":reason}); flash("Lançamento estornado sem apagar o histórico.", "success")
    return redirect(url_for("admin_finance"))


@app.route("/admin/finance/commitments", methods=["POST"])
@admin_required
def admin_finance_commitment_create():
    if not validate_csrf(): abort(400)
    name=(request.form.get("name") or "").strip()[:120]
    if len(name)<2:
        flash("Informe o nome do custo.","danger"); return redirect(url_for("admin_finance"))
    try: amount=_finance_money_to_cents(request.form.get("amount"))
    except ValueError as exc: flash(str(exc),"danger"); return redirect(url_for("admin_finance"))
    cadence=(request.form.get("cadence") or "monthly").strip()
    if cadence not in {"weekly","monthly","annual","one_off"}: cadence="monthly"
    due=(request.form.get("next_due_on") or "").strip()[:10] or None
    if due and not re.fullmatch(r"\d{4}-\d{2}-\d{2}",due): due=None
    db=get_db(); now=utcnow_iso(); actor=session.get("user_id")
    row=db.execute(
        """INSERT INTO finance_commitments(name,category,supplier,amount_cents,cadence,next_due_on,active,notes,created_by,created_at,updated_at)
           VALUES(?,?,?,?,?,?,?,?,?,?,?) RETURNING id""",
        (name,(request.form.get("category") or "Infraestrutura").strip()[:80],(request.form.get("supplier") or "").strip()[:120],amount,cadence,due,1,(request.form.get("notes") or "").strip()[:500],actor,now,now),
    ).fetchone()
    cid=int(row["id"]); snap=dict(db.execute("SELECT * FROM finance_commitments WHERE id=?",(cid,)).fetchone()); _finance_audit(db,"commitment_created","commitment",cid,snap); db.commit()
    audit("finance_commitment_created", {"commitment_id":cid,"amount_cents":amount,"cadence":cadence}); flash("Custo declarado e auditável.","success")
    return redirect(url_for("admin_finance"))


@app.route("/admin/finance/commitments/<int:commitment_id>/toggle", methods=["POST"])
@admin_required
def admin_finance_commitment_toggle(commitment_id):
    if not validate_csrf(): abort(400)
    db=get_db(); row=db.execute("SELECT * FROM finance_commitments WHERE id=?",(commitment_id,)).fetchone()
    if not row: abort(404)
    active=0 if int(row["active"] or 0) else 1; now=utcnow_iso()
    db.execute("UPDATE finance_commitments SET active=?,updated_at=? WHERE id=?",(active,now,commitment_id))
    snap=dict(db.execute("SELECT * FROM finance_commitments WHERE id=?",(commitment_id,)).fetchone()); _finance_audit(db,"commitment_toggled","commitment",commitment_id,snap); db.commit()
    audit("finance_commitment_toggled", {"commitment_id":commitment_id,"active":bool(active)}); return redirect(url_for("admin_finance"))


@app.route("/admin/finance/export.csv")
@admin_required
def admin_finance_export_csv():
    rows=get_db().execute(
        """SELECT e.id,e.occurred_on,e.kind,e.status,e.amount_cents,e.category,e.description,e.counterparty,e.cost_center,e.payment_method,e.document_ref,a.name account_name,e.created_at,e.posted_at,e.voided_at,e.void_reason
           FROM finance_entries e JOIN finance_accounts a ON a.id=e.account_id ORDER BY e.occurred_on DESC,e.id DESC"""
    ).fetchall()
    out=io.StringIO(); writer=csv.writer(out); writer.writerow(["id","data","tipo","status","valor_brl","categoria","descricao","contraparte","centro_custo","pagamento","documento","conta","criado_em","postado_em","estornado_em","motivo_estorno"])
    for r in rows:
        writer.writerow([r["id"],r["occurred_on"],r["kind"],r["status"],f"{int(r['amount_cents'] or 0)/100:.2f}",r["category"],r["description"],r["counterparty"],r["cost_center"],r["payment_method"],r["document_ref"],r["account_name"],r["created_at"],r["posted_at"],r["voided_at"],r["void_reason"]])
    response=app.response_class(out.getvalue(),mimetype="text/csv; charset=utf-8"); response.headers["Content-Disposition"]="attachment; filename=vano-financeiro.csv"; return response


@app.route("/admin/finance/audit.csv")
@admin_required
def admin_finance_audit_export_csv():
    rows=get_db().execute(
        """SELECT f.id,f.created_at,f.actor_user_id,u.name actor_name,f.action,f.object_type,f.object_id,f.snapshot_sha256,f.snapshot_json
           FROM finance_audit_logs f LEFT JOIN users u ON u.id=f.actor_user_id ORDER BY f.id DESC"""
    ).fetchall()
    out=io.StringIO(); writer=csv.writer(out); writer.writerow(["id","criado_em","ator_id","ator","acao","objeto_tipo","objeto_id","sha256_evento","snapshot_json"])
    for r in rows:
        writer.writerow([r["id"],r["created_at"],r["actor_user_id"],r["actor_name"] or "Sistema",r["action"],r["object_type"],r["object_id"],r["snapshot_sha256"],r["snapshot_json"]])
    response=app.response_class(out.getvalue(),mimetype="text/csv; charset=utf-8"); response.headers["Content-Disposition"]="attachment; filename=vano-financeiro-auditoria.csv"; return response


def _admin_dispatch_overview(hours=24):
    _ensure_node_dispatch_log_table()
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=max(1, int(hours)))).isoformat()
    db = get_db()
    row = db.execute(
        """SELECT
             COUNT(*) FILTER (WHERE node_index > 0) AS node_attempts,
             COUNT(*) FILTER (WHERE node_index > 0 AND success=1) AS node_successes,
             COUNT(*) FILTER (WHERE node_index > 0 AND success=0) AS node_failures,
             COUNT(DISTINCT user_id) FILTER (WHERE node_index > 0 AND user_id IS NOT NULL) AS unique_users,
             COUNT(*) FILTER (WHERE node_index=0) AS local_fallbacks,
             COALESCE(AVG(latency_ms) FILTER (WHERE node_index > 0 AND success=1),0) AS avg_latency_ms
           FROM vano_node_dispatch_logs WHERE created_at>=?""",
        (cutoff,),
    ).fetchone()
    attempts = int(row["node_attempts"] or 0) if row else 0
    successes = int(row["node_successes"] or 0) if row else 0
    return {
        "attempts": attempts,
        "successes": successes,
        "failures": int(row["node_failures"] or 0) if row else 0,
        "unique_users": int(row["unique_users"] or 0) if row else 0,
        "local_fallbacks": int(row["local_fallbacks"] or 0) if row else 0,
        "avg_latency_ms": round(float(row["avg_latency_ms"] or 0), 1) if row else 0,
        "success_pct": round(100 * successes / max(1, attempts), 1) if attempts else 0,
    }


def _admin_node_logs(node_index, limit=200):
    _ensure_node_dispatch_log_table()
    limit = max(1, min(500, int(limit or 200)))
    return get_db().execute(
        """SELECT l.id,l.node_index,l.node_name,l.user_id,l.request_id,l.mode,l.profile,l.prefetch,
                  l.http_status,l.success,l.latency_ms,l.error,l.created_at,
                  COALESCE(u.name,'Visitante') AS user_name,COALESCE(u.email,'') AS user_email
           FROM vano_node_dispatch_logs l
           LEFT JOIN users u ON u.id=l.user_id
           WHERE l.node_index=?
           ORDER BY l.id DESC LIMIT ?""",
        (int(node_index), limit),
    ).fetchall()


def _admin_node_log_stats(node_index, hours=24):
    _ensure_node_dispatch_log_table()
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=max(1, int(hours)))).isoformat()
    db = get_db()
    row = db.execute(
        """SELECT COUNT(*) AS total,
                  COUNT(*) FILTER (WHERE success=1) AS successes,
                  COUNT(*) FILTER (WHERE success=0) AS failures,
                  COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS unique_users,
                  COUNT(*) FILTER (WHERE prefetch=1) AS prefetches,
                  COALESCE(AVG(latency_ms) FILTER (WHERE success=1),0) AS avg_latency_ms,
                  COALESCE(MAX(latency_ms),0) AS max_latency_ms
           FROM vano_node_dispatch_logs WHERE node_index=? AND created_at>=?""",
        (int(node_index), cutoff),
    ).fetchone()
    total = int(row["total"] or 0) if row else 0
    successes = int(row["successes"] or 0) if row else 0
    latencies = [int(r["latency_ms"] or 0) for r in db.execute(
        "SELECT latency_ms FROM vano_node_dispatch_logs WHERE node_index=? AND success=1 AND created_at>=? ORDER BY latency_ms",
        (int(node_index), cutoff),
    ).fetchall()]
    p95 = latencies[min(len(latencies)-1, max(0, math.ceil(len(latencies)*0.95)-1))] if latencies else 0
    return {
        "total": total,
        "successes": successes,
        "failures": int(row["failures"] or 0) if row else 0,
        "unique_users": int(row["unique_users"] or 0) if row else 0,
        "prefetches": int(row["prefetches"] or 0) if row else 0,
        "avg_latency_ms": round(float(row["avg_latency_ms"] or 0), 1) if row else 0,
        "max_latency_ms": int(row["max_latency_ms"] or 0) if row else 0,
        "p95_latency_ms": int(p95),
        "success_pct": round(100 * successes / max(1,total), 1) if total else 0,
    }


def _admin_single_node_snapshot(node_index, refresh=False):
    cfg = vano_node_config(node_index)
    if not cfg.get("configured"):
        return _test_node_metrics(cfg, 0)
    cached = None
    with VANO_NODE_STATUS_LOCK:
        cached = VANO_NODE_STATUS_CACHE.get(cfg["id"])
    if not refresh and cached and time.time() - float(cached.get("ts",0)) < VANO_NODE_STATUS_TTL:
        return dict(cached["payload"])
    payload = _probe_configured_node(cfg, 0)
    with VANO_NODE_STATUS_LOCK:
        VANO_NODE_STATUS_CACHE[cfg["id"]] = {"ts": time.time(), "payload": dict(payload)}
    return payload


@app.route("/admin/benchmark")
@admin_required
def admin_benchmark():
    """Internal route lab. Browser calls /api/route with prefetch=1 so tests do not pollute route history."""
    return render_template(
        "admin_benchmark.html",
        mapbox_token=MAPBOX_ACCESS_TOKEN if mapbox_ready() else "",
        mapbox_style=MAPBOX_STYLE_NIGHT or MAPBOX_STYLE_DAY,
    )


@app.route("/admin/reset-accounts", methods=["POST"])
@admin_required
def admin_reset_accounts():
    if not validate_csrf():
        abort(400)
    if str(request.form.get("confirmation", "")).strip().upper() != "RESETAR":
        flash("Confirmação inválida. Digite RESETAR para executar a limpeza.", "danger")
        return redirect(url_for("admin_dashboard") + "#database-tools")

    db = get_db()
    try:
        owner = db.execute("SELECT id FROM users WHERE LOWER(email)=?", (PRIMARY_ADMIN_EMAIL,)).fetchone()
        if not owner:
            flash("A conta administradora principal não existe no banco. Reset cancelado.", "danger")
            return redirect(url_for("admin_dashboard") + "#database-tools")
        owner_id = int(owner["id"])
        count_row = db.execute("SELECT COUNT(*) AS total FROM users WHERE id <> ?", (owner_id,)).fetchone()
        removed = int(count_row["total"] or 0) if count_row else 0
        db.execute("DELETE FROM users WHERE id <> ?", (owner_id,))
        db.execute("UPDATE users SET role='admin', is_active=1 WHERE id=?", (owner_id,))
        db.commit()
        audit("admin_reset_accounts", {"removed_accounts": removed, "preserved_email": PRIMARY_ADMIN_EMAIL}, owner_id)
        flash(f"Banco de contas resetado. {removed} conta(s) removida(s); o admin principal foi preservado.", "success")
    except Exception:
        db.rollback()
        app.logger.exception("Falha ao resetar contas pelo painel admin")
        flash("Não foi possível resetar as contas do banco agora.", "danger")
    return redirect(url_for("admin_dashboard") + "#database-tools")


@app.route("/admin")
@admin_required
def admin_dashboard():
    db = get_db()
    now = datetime.now(timezone.utc)
    cutoff_7d = (now - timedelta(days=7)).isoformat()
    cutoff_24h = (now - timedelta(hours=24)).isoformat()
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    stats = db.execute(
        """
        SELECT
          (SELECT COUNT(*) FROM users) users,
          (SELECT COUNT(*) FROM users WHERE created_at >= ?) users_7d,
          (SELECT COUNT(*) FROM reports WHERE status='active') active_reports,
          (SELECT COUNT(*) FROM reports WHERE created_at >= ?) reports_7d,
          (SELECT COUNT(*) FROM route_history) routes,
          (SELECT COUNT(*) FROM route_history WHERE created_at >= ?) routes_today,
          (SELECT COUNT(*) FROM route_history WHERE created_at >= ?) routes_24h,
          (SELECT COALESCE(SUM(distance_m),0) FROM route_history) distance_total_m,
          (SELECT COALESCE(AVG(distance_m),0) FROM route_history WHERE created_at >= ?) avg_distance_24h_m,
          (SELECT COALESCE(AVG(duration_s),0) FROM route_history WHERE created_at >= ?) avg_duration_24h_s,
          (SELECT COUNT(*) FROM route_feedback WHERE rating='good' AND created_at >= ?) feedback_good_7d,
          (SELECT COUNT(*) FROM route_feedback WHERE rating='improve' AND created_at >= ?) feedback_improve_7d
        """,
        (cutoff_7d, cutoff_7d, day_start, cutoff_24h, cutoff_24h, cutoff_24h, cutoff_7d, cutoff_7d),
    ).fetchone()
    reports = db.execute(
        "SELECT r.*,u.name reporter_name,u.email reporter_email FROM reports r JOIN users u ON u.id=r.user_id ORDER BY r.created_at DESC LIMIT 10"
    ).fetchall()
    product_rows = db.execute(
        """SELECT user_id,event_type,status_code,duration_ms,metadata,created_at,ip_address,user_agent,path FROM request_activity_logs
           WHERE created_at>=? ORDER BY id DESC LIMIT 16000""",
        (cutoff_24h,),
    ).fetchall()
    product_metrics = {
        "searches_24h": 0, "search_no_results_24h": 0, "navigation_starts_24h": 0, "navigation_complete_24h": 0,
        "reroutes_24h": 0, "event_detours_24h": 0, "alternative_prompts_24h": 0, "alternative_accepts_24h": 0, "alternative_auto_24h": 0,
        "traffic_worsening_24h": 0, "alerts_24h": 0, "alert_confirmations_24h": 0, "radar_warnings_24h": 0,
        "gps_weak_24h": 0, "gps_poor_24h": 0, "offline_events_24h": 0, "errors_24h": 0,
        "request_p50_ms": 0, "request_p95_ms": 0, "request_p99_ms": 0, "search_p95_ms": 0, "route_p95_ms": 0,
        "route_request_failures_24h": 0, "route_request_success_24h": 0, "privacy_pending": 0,
        "sessions_24h": 0, "reroutes_per_trip": 0.0, "false_reroutes_24h": 0, "suggested_saving_avg_min": 0.0,
        "eta_shift_avg_s": 0, "client_errors_24h": 0, "ios_errors_24h": 0, "android_errors_24h": 0, "desktop_errors_24h": 0,
        "retention_d1_pct": 0, "retention_d7_pct": 0, "retention_d30_pct": 0, "alert_not_there_24h": 0,
        "road_snaps_24h": 0, "alert_syncs_24h": 0, "nearby_notice_24h": 0,
        "search_p50_ms": 0, "search_p99_ms": 0, "route_p50_ms": 0, "route_p99_ms": 0,
    }
    request_durations, search_durations, route_durations, eta_shifts, suggested_savings = [], [], [], [], []
    session_keys = set()
    def _label_ms(value, prefix):
        try:
            raw = str(value or "")
            if not raw.startswith(prefix): return None
            return max(0, int(raw[len(prefix):].split("ms", 1)[0]))
        except Exception:
            return None
    for row in product_rows:
        et = str(row["event_type"] or "")
        try: meta = json.loads(row["metadata"] or "{}")
        except Exception: meta = {}
        label = str(meta.get("label") or "")
        try:
            dt = parse_iso(row["created_at"]); bucket = int(dt.timestamp()//1800) if dt else 0
        except Exception:
            bucket = 0
        ident = f"u:{row['user_id']}" if row["user_id"] else f"ip:{str(row['ip_address'] or 'unknown')[:64]}"
        if bucket: session_keys.add((ident,bucket))
        if et == "search" and label.startswith("results:"): product_metrics["searches_24h"] += 1
        if et == "search" and label.startswith("no-results:"): product_metrics["search_no_results_24h"] += 1
        if et == "route" and label == "navigation-start": product_metrics["navigation_starts_24h"] += 1
        if et == "route" and label.startswith("navigation-complete:"): product_metrics["navigation_complete_24h"] += 1
        if et == "route" and label in {"reroute-manual","reroute-auto"}:
            product_metrics["reroutes_24h"] += 1
        if et == "route" and label == "reroute-same-corridor":
            product_metrics["false_reroutes_24h"] += 1
        if et == "route" and label == "event-detour-applied": product_metrics["event_detours_24h"] += 1
        if et == "route" and label.startswith("alternative-prompt:"):
            product_metrics["alternative_prompts_24h"] += 1
            try: suggested_savings.append(float(label.split(":",1)[1].rstrip("m")))
            except Exception: pass
        if et == "route" and (label == "alternative-accepted" or label.startswith("alternative-manual:")): product_metrics["alternative_accepts_24h"] += 1
        if et == "route" and label.startswith("alternative-auto:"): product_metrics["alternative_auto_24h"] += 1
        if et == "traffic" and label.startswith("worsening:"): product_metrics["traffic_worsening_24h"] += 1
        if et == "alert" and label.startswith("quick-alert:"): product_metrics["alerts_24h"] += 1
        if et == "alert" and label.startswith("not-there:"): product_metrics["alert_not_there_24h"] += 1
        if et == "alert" and label.startswith("road-snap:"): product_metrics["road_snaps_24h"] += 1
        if et == "alert" and label.startswith("map-sync:"): product_metrics["alert_syncs_24h"] += 1
        if et == "ui" and label.startswith("nearby-users-notice:"): product_metrics["nearby_notice_24h"] += 1
        if et == "safety" and label.startswith("speed-camera-"): product_metrics["radar_warnings_24h"] += 1
        if et == "gps" and label == "quality:weak": product_metrics["gps_weak_24h"] += 1
        if et == "gps" and label == "quality:poor": product_metrics["gps_poor_24h"] += 1
        if et == "connectivity" and label == "offline": product_metrics["offline_events_24h"] += 1
        if et == "performance":
            if label.startswith("client-error:"):
                product_metrics["client_errors_24h"] += 1
                ua = str(row["user_agent"] or "").lower()
                if any(x in ua for x in ("iphone","ipad","ipod")): product_metrics["ios_errors_24h"] += 1
                elif "android" in ua: product_metrics["android_errors_24h"] += 1
                else: product_metrics["desktop_errors_24h"] += 1
            if label.startswith("eta-shift:"):
                try: eta_shifts.append(max(0,int(label.split(":",1)[1].split("s",1)[0])))
                except Exception: pass
            ms = _label_ms(label, "search-latency:")
            if ms is not None: search_durations.append(ms)
            ms = _label_ms(label, "route-latency:")
            if ms is not None: route_durations.append(ms)
        if et == "request":
            code = int(row["status_code"] or 0)
            if code >= 400: product_metrics["errors_24h"] += 1
            dur = int(row["duration_ms"] or 0)
            if dur >= 0: request_durations.append(dur)
    # Request rows expose path outside metadata in the table query below only in newer logs;
    # derive route success/failure with a compact dedicated SQL count for accuracy.
    try:
        route_req = db.execute("""SELECT
              SUM(CASE WHEN status_code BETWEEN 200 AND 399 THEN 1 ELSE 0 END) ok,
              SUM(CASE WHEN status_code>=400 THEN 1 ELSE 0 END) fail
            FROM request_activity_logs WHERE created_at>=? AND event_type='request' AND (path LIKE '/api/route%' OR path LIKE '/v1/route%')""", (cutoff_24h,)).fetchone()
        product_metrics["route_request_success_24h"] = int((route_req["ok"] if route_req else 0) or 0)
        product_metrics["route_request_failures_24h"] = int((route_req["fail"] if route_req else 0) or 0)
    except Exception:
        pass
    def _pct(values, q):
        if not values: return 0
        values = sorted(values); idx = min(len(values)-1, max(0, int(round((len(values)-1)*q))))
        return int(values[idx])
    product_metrics["request_p50_ms"] = _pct(request_durations, .50)
    product_metrics["request_p95_ms"] = _pct(request_durations, .95)
    product_metrics["request_p99_ms"] = _pct(request_durations, .99)
    product_metrics["search_p50_ms"] = _pct(search_durations, .50)
    product_metrics["search_p95_ms"] = _pct(search_durations, .95)
    product_metrics["search_p99_ms"] = _pct(search_durations, .99)
    product_metrics["route_p50_ms"] = _pct(route_durations, .50)
    product_metrics["route_p95_ms"] = _pct(route_durations, .95)
    product_metrics["route_p99_ms"] = _pct(route_durations, .99)
    product_metrics["sessions_24h"] = len(session_keys)
    product_metrics["reroutes_per_trip"] = round(product_metrics["reroutes_24h"] / max(1, product_metrics["navigation_starts_24h"]), 2)
    product_metrics["suggested_saving_avg_min"] = round(sum(suggested_savings)/len(suggested_savings), 1) if suggested_savings else 0.0
    product_metrics["eta_shift_avg_s"] = int(round(sum(eta_shifts)/len(eta_shifts))) if eta_shifts else 0
    try:
        product_metrics["alert_confirmations_24h"] = int(db.execute("SELECT COUNT(*) c FROM report_confirmations WHERE created_at>=?", (cutoff_24h,)).fetchone()["c"] or 0)
    except Exception:
        product_metrics["alert_confirmations_24h"] = 0
    try:
        product_metrics["privacy_pending"] = int(db.execute("SELECT COUNT(*) c FROM privacy_requests WHERE status IN ('pending','in_progress')").fetchone()["c"] or 0)
    except Exception:
        product_metrics["privacy_pending"] = 0
    # Cohort retention uses only account id + timestamps; no destination text or coordinates.
    try:
        cutoff_45 = (datetime.now(timezone.utc)-timedelta(days=45)).replace(microsecond=0).isoformat()
        cohort_users = db.execute("SELECT id,created_at FROM users WHERE created_at>=?", (cutoff_45,)).fetchall()
        act_rows = db.execute("SELECT user_id,created_at FROM request_activity_logs WHERE user_id IS NOT NULL AND created_at>=?", (cutoff_45,)).fetchall()
        act_by_user = {}
        for a in act_rows:
            try: act_by_user.setdefault(int(a["user_id"]), []).append(parse_iso(a["created_at"]))
            except Exception: pass
        now_dt = datetime.now(timezone.utc)
        for days, key in ((1,"retention_d1_pct"),(7,"retention_d7_pct"),(30,"retention_d30_pct")):
            eligible=returned=0
            for u in cohort_users:
                created=parse_iso(u["created_at"]);
                if not created or now_dt-created < timedelta(days=days+1): continue
                eligible += 1; lo=created+timedelta(days=days); hi=lo+timedelta(days=1)
                if any(t and lo<=t<hi for t in act_by_user.get(int(u["id"]), [])): returned += 1
            product_metrics[key] = int(round(returned*100/eligible)) if eligible else 0
    except Exception:
        pass
    recent_routes = db.execute(
        """SELECT rh.id,rh.origin_label,rh.destination_label,rh.mode,rh.distance_m,rh.duration_s,rh.safety_score,rh.created_at,
                  COALESCE(u.name,'Visitante') user_name
           FROM route_history rh LEFT JOIN users u ON u.id=rh.user_id
           ORDER BY rh.created_at DESC LIMIT 8"""
    ).fetchall()
    dispatch_ops = _admin_dispatch_overview(24)
    recent_dispatch_failures = db.execute(
        """SELECT l.*,COALESCE(u.name,'Visitante') AS user_name
           FROM vano_node_dispatch_logs l LEFT JOIN users u ON u.id=l.user_id
           WHERE l.node_index>0 AND l.success=0 ORDER BY l.id DESC LIMIT 8"""
    ).fetchall()
    recent_audit = db.execute(
        """SELECT a.id,a.action,a.metadata,a.created_at,COALESCE(u.name,'Sistema') AS user_name
           FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 8"""
    ).fetchall()
    infra = admin_node_snapshot(refresh=False)
    windows = _active_user_windows()
    try:
        presence_cutoff = (now - timedelta(minutes=3)).isoformat()
        presence_3m = int(db.execute("SELECT COUNT(*) c FROM nearby_presence WHERE updated_at>=?", (presence_cutoff,)).fetchone()["c"] or 0)
    except Exception:
        presence_3m = 0
    extra = {
        **windows,
        "active_users_15m": windows["active_15m"],
        "simultaneous_now": windows["active_now_5m"],
        "simultaneous_capacity": infra["summary"]["capacity"],
        "simultaneous_used": min(windows["active_now_5m"], infra["summary"]["capacity"]),
        "simultaneous_available": max(0, infra["summary"]["capacity"] - min(windows["active_now_5m"], infra["summary"]["capacity"])),
        "simultaneous_occupancy_pct": round((100 * min(windows["active_now_5m"], infra["summary"]["capacity"]) / max(1, infra["summary"]["capacity"])), 1) if infra["summary"]["capacity"] else 0,
        "simultaneous_overflow": max(0, windows["active_now_5m"] - infra["summary"]["capacity"]),
        "total_distance_km": round(float(stats["distance_total_m"] or 0) / 1000, 1),
        "avg_distance_24h_km": round(float(stats["avg_distance_24h_m"] or 0) / 1000, 1),
        "avg_duration_24h_min": round(float(stats["avg_duration_24h_s"] or 0) / 60, 1),
        "feedback_good_pct": round(100 * int(stats["feedback_good_7d"] or 0) / max(1, int(stats["feedback_good_7d"] or 0) + int(stats["feedback_improve_7d"] or 0))),
        "distributed_enabled": bool(VANO_DISTRIBUTED_ROUTING_ENABLED),
        "central_secret_configured": bool(CENTRAL_API_SECRET),
        "configured_nodes": int(infra["summary"]["configured_nodes"]),
        "healthy_nodes": int(infra["summary"]["healthy_nodes"]),
        "presence_3m": presence_3m,
    }
    return render_template(
        "admin.html", stats=stats, extra=extra, reports=reports, recent_routes=recent_routes,
        infra=infra, categories=CATEGORY_META, dispatch_ops=dispatch_ops, product_metrics=product_metrics,
        recent_dispatch_failures=recent_dispatch_failures, recent_audit=recent_audit,
    )


@app.route("/api/admin/servers/status")
@admin_required
def api_admin_servers_status():
    refresh = str(request.args.get("refresh", "0")).lower() in {"1", "true", "yes", "on"}
    return jsonify(admin_node_snapshot(refresh=refresh))


@app.route("/api/admin/servers/<int:node_index>/config", methods=["GET", "POST"])
@admin_required
def api_admin_server_config(node_index):
    if node_index < 1 or node_index > VANO_NODE_COUNT:
        return jsonify({"ok": False, "error": "Node fora do intervalo configurado."}), 404
    if request.method == "GET":
        cfg = vano_node_config(node_index)
        return jsonify({"ok": True, "config": cfg, "central_secret_configured": bool(CENTRAL_API_SECRET)})
    if not validate_csrf():
        return jsonify({"ok": False, "error": "Sessão expirada. Atualize a página e tente novamente."}), 400
    payload = request.get_json(silent=True) or {}
    try:
        cfg = save_vano_node_config(node_index, payload)
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    except Exception as exc:
        app.logger.exception("Could not save node configuration")
        return jsonify({"ok": False, "error": "Não foi possível salvar a configuração do node.", "detail": type(exc).__name__}), 500
    audit("admin_node_config_update", {"node": node_index, "url_configured": bool(cfg.get("url")), "enabled": bool(cfg.get("enabled")), "capacity": cfg.get("capacity")}, session.get("user_id"))
    return jsonify({"ok": True, "config": cfg})


@app.route("/api/admin/servers/<int:node_index>/test", methods=["POST"])
@admin_required
def api_admin_server_test(node_index):
    if node_index < 1 or node_index > VANO_NODE_COUNT:
        return jsonify({"ok": False, "error": "Node fora do intervalo configurado."}), 404
    if not validate_csrf():
        return jsonify({"ok": False, "error": "Sessão expirada."}), 400
    cfg = vano_node_config(node_index)
    if not cfg.get("configured"):
        return jsonify({"ok": False, "error": "Configure a URL do node antes de testar.", "node": _test_node_metrics(cfg, 0)}), 400
    payload = _probe_configured_node(cfg, 0)
    with VANO_NODE_STATUS_LOCK:
        VANO_NODE_STATUS_CACHE[cfg["id"]] = {"ts": time.time(), "payload": dict(payload)}
    return jsonify({"ok": bool(payload.get("healthy")), "node": payload}), 200 if payload.get("healthy") else 502


@app.route("/admin/servers/<int:node_index>")
@admin_required
def admin_server_detail(node_index):
    if node_index < 1 or node_index > VANO_NODE_COUNT:
        abort(404)
    cfg = vano_node_config(node_index)
    status = _admin_single_node_snapshot(node_index, refresh=False)
    logs = _admin_node_logs(node_index, 250)
    stats = _admin_node_log_stats(node_index, 24)
    return render_template("admin_server_detail.html", node=cfg, status=status, logs=logs, node_stats=stats)


@app.route("/api/admin/servers/<int:node_index>/details")
@admin_required
def api_admin_server_details(node_index):
    if node_index < 1 or node_index > VANO_NODE_COUNT:
        return jsonify({"ok": False, "error": "Node inválido."}), 404
    refresh = str(request.args.get("refresh", "0")).lower() in {"1", "true", "yes", "on"}
    limit = max(1, min(500, int(request.args.get("limit", 120) or 120)))
    cfg = vano_node_config(node_index)
    status = _admin_single_node_snapshot(node_index, refresh=refresh)
    logs = [dict(r) for r in _admin_node_logs(node_index, limit)]
    stats = _admin_node_log_stats(node_index, 24)
    return jsonify({"ok": True, "config": cfg, "status": status, "logs": logs, "stats": stats})


@app.route("/api/admin/servers/<int:node_index>/logs/clear", methods=["POST"])
@admin_required
def api_admin_server_logs_clear(node_index):
    if node_index < 1 or node_index > VANO_NODE_COUNT:
        return jsonify({"ok": False, "error": "Node inválido."}), 404
    if not validate_csrf():
        return jsonify({"ok": False, "error": "Sessão expirada."}), 400
    _ensure_node_dispatch_log_table()
    db = get_db()
    row = db.execute("SELECT COUNT(*) AS n FROM vano_node_dispatch_logs WHERE node_index=?", (node_index,)).fetchone()
    count = int(row["n"] or 0) if row else 0
    db.execute("DELETE FROM vano_node_dispatch_logs WHERE node_index=?", (node_index,))
    db.commit()
    audit("admin_node_logs_clear", {"node": node_index, "deleted": count}, session.get("user_id"))
    return jsonify({"ok": True, "deleted": count})


@app.route("/admin/servers/<int:node_index>/logs.csv")
@admin_required
def admin_server_logs_csv(node_index):
    if node_index < 1 or node_index > VANO_NODE_COUNT:
        abort(404)
    _ensure_node_dispatch_log_table()
    rows = get_db().execute(
        """SELECT l.id,l.node_index,l.node_name,l.user_id,l.request_id,l.mode,l.profile,l.prefetch,l.http_status,l.success,l.latency_ms,l.error,l.created_at,
                  COALESCE(u.name,'Visitante') AS user_name,COALESCE(u.email,'') AS user_email
           FROM vano_node_dispatch_logs l LEFT JOIN users u ON u.id=l.user_id
           WHERE l.node_index=? ORDER BY l.id DESC LIMIT 10000""", (node_index,)
    ).fetchall()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "data", "usuario", "email", "request_id", "modo", "perfil", "prefetch", "http", "sucesso", "latencia_ms", "erro"])
    for row in rows:
        writer.writerow([
            row["id"], row["created_at"], row["user_name"], row["user_email"], row["request_id"], row["mode"], row["profile"],
            "sim" if row["prefetch"] else "nao", row["http_status"] or "", "sim" if row["success"] else "nao", row["latency_ms"], row["error"],
        ])
    response = app.response_class(output.getvalue(), mimetype="text/csv; charset=utf-8")
    response.headers["Content-Disposition"] = f'attachment; filename="vano-node-{node_index:02d}-logs.csv"'
    return response


@app.route("/admin/audit")
@admin_required
def admin_audit_logs():
    db = get_db()
    rows = db.execute(
        """SELECT a.id,a.action,a.metadata,a.created_at,COALESCE(u.name,'Sistema') AS user_name,COALESCE(u.email,'') AS user_email
           FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 400"""
    ).fetchall()
    activity_rows = db.execute(
        """SELECT l.id,l.event_type,l.method,l.path,l.endpoint,l.status_code,l.ip_address,l.user_agent,l.referrer,l.metadata,l.duration_ms,l.created_at,
                  COALESCE(u.name,'Visitante') AS user_name,COALESCE(u.email,'') AS user_email
           FROM request_activity_logs l LEFT JOIN users u ON u.id=l.user_id
           ORDER BY l.id DESC LIMIT 1200"""
    ).fetchall()
    normalized_activity = []
    for row in activity_rows:
        item = dict(row)
        browser, os_name, device_type = _user_agent_summary(item.get("user_agent"))
        try:
            meta_obj = json.loads(item.get("metadata") or "{}")
            if not isinstance(meta_obj, dict):
                meta_obj = {}
        except Exception:
            meta_obj = {}
        label = str(meta_obj.get("label") or meta_obj.get("element_id") or meta_obj.get("target") or "").strip()
        if item.get("event_type") == "request":
            detail = str(item.get("endpoint") or item.get("path") or "Requisição")
        else:
            detail = label or str(item.get("endpoint") or item.get("path") or "Evento")
        item.update({
            "browser": browser, "os_name": os_name, "device_type": device_type,
            "metadata_obj": meta_obj, "detail": detail[:180],
        })
        normalized_activity.append(item)
    activity_stats = {
        "total": len(normalized_activity),
        "clicks": sum(1 for x in normalized_activity if x.get("event_type") == "click"),
        "unique_ips": len({x.get("ip_address") for x in normalized_activity if x.get("ip_address") and x.get("ip_address") != "unknown"}),
        "errors": sum(1 for x in normalized_activity if int(x.get("status_code") or 0) >= 400),
    }
    return render_template("admin_audit.html", audit_rows=rows, activity_rows=normalized_activity, activity_stats=activity_stats)


@app.route("/admin/users")
@admin_required
def admin_users():
    users = get_db().execute(
        "SELECT id,name,email,role,locale,is_active,created_at,last_login_at FROM users ORDER BY created_at DESC LIMIT 300"
    ).fetchall()
    return render_template("admin_users.html", users=users)


@app.route("/api/admin/users/<int:user_id>")
@admin_required
def api_admin_user_detail(user_id):
    """Admin-only compact user detail payload used by the 'Saber mais' modal."""
    db = get_db()
    user = db.execute(
        """SELECT id,name,email,role,locale,is_active,created_at,last_login_at,auth_provider,
                  age,sex,is_app_driver,route_preference,distance_unit,presence_visible,
                  map_style,map_accent,avoid_ferries,avoid_tolls,avoid_unpaved
           FROM users WHERE id=?""",
        (user_id,),
    ).fetchone()
    if not user:
        return jsonify({"error": "Usuário não encontrado."}), 404
    routes = db.execute(
        """SELECT id,origin_label,destination_label,mode,distance_m,duration_s,safety_score,created_at
           FROM route_history WHERE user_id=? ORDER BY created_at DESC LIMIT 10""",
        (user_id,),
    ).fetchall()
    alerts = db.execute(
        """SELECT id,category,title,address,latitude,longitude,status,confirmations,created_at
           FROM reports WHERE user_id=? ORDER BY created_at DESC LIMIT 10""",
        (user_id,),
    ).fetchall()
    accesses = db.execute(
        """SELECT id,ip_address,user_agent,first_seen_at,last_seen_at,request_count
           FROM user_access_log WHERE user_id=? ORDER BY last_seen_at DESC LIMIT 12""",
        (user_id,),
    ).fetchall()
    counts = db.execute(
        """SELECT
             (SELECT COUNT(*) FROM route_history WHERE user_id=?) AS route_count,
             (SELECT COUNT(*) FROM reports WHERE user_id=?) AS alert_count""",
        (user_id, user_id),
    ).fetchone()
    return jsonify({
        "user": dict(user),
        "routes": [dict(x) for x in routes],
        "alerts": [{**dict(x), "category_label": CATEGORY_META.get(x["category"], CATEGORY_META["other"])["label"]} for x in alerts],
        "accesses": [{
            "id": int(x["id"]),
            "browser": _user_agent_summary(x["user_agent"])[0],
            "os_name": _user_agent_summary(x["user_agent"])[1],
            "device_type": _user_agent_summary(x["user_agent"])[2],
            "ip_address": x["ip_address"],
            "created_at": x["first_seen_at"],
            "last_used_at": x["last_seen_at"],
            "request_count": int(x["request_count"] or 0),
        } for x in accesses],
        "last_ip": accesses[0]["ip_address"] if accesses else None,
        "counts": dict(counts) if counts else {"route_count": 0, "alert_count": 0},
    })


@app.route("/admin/reports")
@admin_required
def admin_reports():
    reports = get_db().execute(
        "SELECT r.*,u.name reporter_name,u.email reporter_email FROM reports r JOIN users u ON u.id=r.user_id ORDER BY r.created_at DESC LIMIT 300"
    ).fetchall()
    return render_template("admin_reports.html", reports=reports, categories=CATEGORY_META)


@app.route("/admin/reports/<int:report_id>/status", methods=["POST"])
@admin_required
def admin_report_status(report_id):
    if not validate_csrf():
        abort(400)
    status = request.form.get("status")
    if status not in {"active", "resolved", "rejected"}:
        abort(400)
    db = get_db()
    db.execute("UPDATE reports SET status=? WHERE id=?", (status, report_id))
    db.commit()
    audit("admin_report_status", {"report_id": report_id, "status": status})
    flash("Status do alerta atualizado.", "success")
    return redirect(url_for("admin_reports"))


@app.route("/admin/users/<int:user_id>/toggle", methods=["POST"])
@admin_required
def admin_user_toggle(user_id):
    if not validate_csrf():
        abort(400)
    if user_id == session.get("user_id"):
        flash("Você não pode desativar sua própria conta por aqui.", "warning")
        return redirect(url_for("admin_users"))
    db = get_db()
    row = db.execute("SELECT is_active FROM users WHERE id=?", (user_id,)).fetchone()
    if not row:
        abort(404)
    db.execute("UPDATE users SET is_active=? WHERE id=?", (0 if row["is_active"] else 1, user_id))
    db.commit()
    audit("admin_user_toggle", {"target_user_id": user_id})
    flash("Usuário atualizado.", "success")
    return redirect(url_for("admin_users"))

@app.route("/admin/risk-zones", methods=["GET", "POST"])
@admin_required
def admin_risk_zones():
    db = get_db()
    if request.method == "POST":
        if not validate_csrf():
            abort(400)
        neighborhood = request.form.get("neighborhood", "").strip()[:100]
        city = request.form.get("city", "São Paulo").strip()[:100]
        state = request.form.get("state", "SP").strip()[:40]
        reason = request.form.get("reason", "").strip()[:160]
        source_url = request.form.get("source_url", "").strip()[:500]
        block_routes = 1 if request.form.get("block_routes") in {"1","true","on","yes"} else 0
        try:
            danger_level = int(clamp(int(request.form.get("danger_level", 3)), 1, 5))
            radius = float(clamp(float(request.form.get("radius_m", 900)), 150, 5000))
        except (TypeError, ValueError):
            danger_level, radius = 3, 900
        if not neighborhood or not city or not reason:
            flash("Informe bairro, cidade e o motivo/fonte do risco.", "danger")
            return redirect(url_for("admin_risk_zones"))
        if not mapbox_ready():
            flash("Configure a infraestrutura de mapas para localizar o bairro automaticamente.", "danger")
            return redirect(url_for("admin_risk_zones"))
        try:
            query = ", ".join(x for x in [neighborhood, city, state, "Brasil"] if x)
            found = mapbox_forward_geocode(query, language="pt-BR")
        except Exception as exc:
            app.logger.warning("Admin neighborhood geocode failed: %s", exc)
            found = []
        if not found:
            flash("Não consegui localizar esse bairro. Revise bairro/cidade/estado.", "danger")
            return redirect(url_for("admin_risk_zones"))
        best = found[0]
        lat, lon = float(best["lat"]), float(best["lon"])
        # Existing Safety Engine uses a maximum safety level. Danger 5 => cap 0.
        level_cap = int(clamp(5-danger_level, 0, 4))
        confidence = .92 if block_routes else .84
        now = utcnow_iso()
        db.execute(
            """INSERT INTO risk_zones(name,risk_type,latitude,longitude,radius_m,level_cap,confidence,
                                      source,source_url,start_hour,end_hour,neighborhood,city,state,danger_level,
                                      block_routes,active,created_at,updated_at)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (f"{neighborhood} · {city}", "admin_neighborhood_risk", lat, lon, radius, level_cap, confidence,
             reason, source_url, None, None, neighborhood, city, state, danger_level, block_routes, 1, now, now),
        )
        db.commit()
        audit("admin_risk_zone_create", {"neighborhood": neighborhood, "city": city, "danger_level": danger_level, "block_routes": bool(block_routes)})
        flash("Bairro/área cadastrado e aplicado ao motor de rotas.", "success")
        return redirect(url_for("admin_risk_zones"))
    zones = db.execute("SELECT * FROM risk_zones ORDER BY active DESC, block_routes DESC, danger_level DESC, updated_at DESC, id DESC LIMIT 500").fetchall()
    return render_template("admin_risk_zones.html", zones=zones)


@app.route("/admin/risk-zones/<int:zone_id>/update", methods=["POST"])
@admin_required
def admin_risk_zone_update(zone_id):
    if not validate_csrf():
        abort(400)
    db = get_db()
    row = db.execute("SELECT id FROM risk_zones WHERE id=?", (zone_id,)).fetchone()
    if not row:
        abort(404)
    try:
        danger_level = int(clamp(int(request.form.get("danger_level", 3)), 1, 5))
        radius = float(clamp(float(request.form.get("radius_m", 900)), 150, 5000))
    except (TypeError, ValueError):
        return jsonify({"error":"Valores inválidos."}), 400
    block_routes = 1 if request.form.get("block_routes") in {"1","true","on","yes"} else 0
    level_cap = int(clamp(5-danger_level, 0, 4))
    db.execute(
        "UPDATE risk_zones SET danger_level=?,level_cap=?,radius_m=?,block_routes=?,updated_at=? WHERE id=?",
        (danger_level, level_cap, radius, block_routes, utcnow_iso(), zone_id),
    )
    db.commit()
    audit("admin_risk_zone_update", {"zone_id": zone_id, "danger_level": danger_level, "block_routes": bool(block_routes)})
    flash("Política da área atualizada.", "success")
    return redirect(url_for("admin_risk_zones"))


@app.route("/admin/risk-zones/<int:zone_id>/toggle", methods=["POST"])
@admin_required
def admin_risk_zone_toggle(zone_id):
    if not validate_csrf(): abort(400)
    db=get_db(); row=db.execute("SELECT active FROM risk_zones WHERE id=?", (zone_id,)).fetchone()
    if not row: abort(404)
    db.execute("UPDATE risk_zones SET active=?,updated_at=? WHERE id=?", (0 if row["active"] else 1, utcnow_iso(), zone_id)); db.commit()
    audit("admin_risk_zone_toggle", {"zone_id": zone_id}); flash("Área atualizada.", "success")
    return redirect(url_for("admin_risk_zones"))



@app.route("/admin/risk-zones/<int:zone_id>/delete", methods=["POST"])
@admin_required
def admin_risk_zone_delete(zone_id):
    if not validate_csrf():
        abort(400)
    db = get_db()
    row = db.execute("SELECT id,name FROM risk_zones WHERE id=?", (zone_id,)).fetchone()
    if not row:
        abort(404)
    db.execute("DELETE FROM risk_zones WHERE id=?", (zone_id,))
    db.commit()
    audit("admin_risk_zone_delete", {"zone_id": zone_id, "name": row["name"]})
    flash("Zona removida.", "success")
    return redirect(url_for("admin_risk_zones"))

# -----------------------------
# API
# -----------------------------

