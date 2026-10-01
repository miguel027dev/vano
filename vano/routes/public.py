"""VANO legal, SEO, privacy and benchmark routes.

Extracted from the historical monolithic app.py without changing route bodies or
business rules. Runtime dependencies are injected once during application startup.
"""
from vano.bootstrap import inject as _vano_inject
_vano_inject(globals())
del _vano_inject

def legal_identity_context():
    """Public legal identity sourced from VANO deployment configuration."""
    return {
        "legal_name": str(os.environ.get("VANO_LEGAL_NAME") or "VANO MAPS").strip()[:180],
        "legal_cnpj": str(os.environ.get("VANO_LEGAL_CNPJ") or "").strip()[:32],
        "privacy_email": str(os.environ.get("VANO_PRIVACY_EMAIL") or os.environ.get("VANO_PRIVACY_EMAIL") or "").strip()[:220],
        "activity_log_retention_days": ACTIVITY_LOG_RETENTION_DAYS,
    }


@app.route("/help")
def help_page():
    return render_template("help.html")


@app.route("/about")
def about():
    return render_template("about.html", **legal_identity_context())


@app.route("/sobre")
def sobre():
    # Institutional route intentionally kept out of the main navigation for now.
    return render_template("sobre.html", **legal_identity_context())


def _serve_root_seo_file(filename, mimetype):
    path = os.path.join(BASE_DIR, filename)
    try:
        with open(path, "r", encoding="utf-8") as fh:
            content = fh.read()
    except OSError:
        abort(404)
    public_origin = PUBLIC_SITE_URL or request.host_url.rstrip("/")
    content = content.replace("__PUBLIC_SITE_URL__", public_origin)
    response = app.response_class(content, mimetype=mimetype)
    response.headers["Cache-Control"] = "public, max-age=3600"
    return response


@app.route("/robots.txt")
def robots_txt():
    return _serve_root_seo_file("robots.txt", "text/plain")


@app.route("/sitemap.xml")
def sitemap_xml():
    return _serve_root_seo_file("sitemap.xml", "application/xml")


@app.route("/politica-de-privacidade")
@app.route("/privacy")
def privacy_policy():
    """Página legal exigida pelo rodapé/base.html.

    Mantém o endpoint `privacy_policy` para evitar BuildError em produção
    quando o template chama url_for('privacy_policy').
    """
    recent_privacy_requests = []
    if session.get("user_id"):
        try:
            recent_privacy_requests = get_db().execute(
                "SELECT protocol,request_type,status,created_at,updated_at FROM privacy_requests WHERE user_id=? ORDER BY created_at DESC LIMIT 5",
                (session.get("user_id"),),
            ).fetchall()
        except Exception:
            recent_privacy_requests = []
    return render_template("privacy_policy.html", privacy_request_types=globals().get("PRIVACY_REQUEST_TYPES", {}), recent_privacy_requests=recent_privacy_requests, **legal_identity_context())


@app.route("/termos-de-uso")
@app.route("/terms")
def terms_of_use():
    """Página legal exigida pelo rodapé/base.html."""
    return render_template("terms_of_use.html", **legal_identity_context())


@app.route("/o-que-e-vano-maps")
def what_is_vano():
    return render_template("seo_o_que_e_vano.html")


@app.route("/rotas-para-evitar-transito")
def seo_avoid_traffic():
    return render_template("seo_evitar_transito.html")


@app.route("/alternativa-ao-waze")
def seo_waze_alternative():
    return render_template("seo_alternativa_waze.html")


# V325 — public benchmark contract for humans and automated agents.
# Keep this isolated from the normal navigation API: public benchmark traffic is
# read-only, does not consume guest credits, does not write route history and is
# deliberately constrained by distance/rate limits.
VANO_PUBLIC_BENCHMARK_ENABLED = os.environ.get("VANO_PUBLIC_BENCHMARK_ENABLED", "1").strip().lower() not in {"0", "false", "off", "no"}
VANO_PUBLIC_BENCHMARK_MAX_KM = max(5.0, min(80.0, float(os.environ.get("VANO_PUBLIC_BENCHMARK_MAX_KM", "35") or 35)))
VANO_PUBLIC_BENCHMARK_RATE_PER_MIN = max(2, min(30, int(os.environ.get("VANO_PUBLIC_BENCHMARK_RATE_PER_MIN", "12") or 12)))

VANO_BENCHMARK_POINTS = {
    "morumbi": {"label": "Morumbi Shopping, São Paulo", "lat": -23.62326, "lon": -46.69844},
    "paulista": {"label": "Av. Paulista, 1578, São Paulo", "lat": -23.56147, "lon": -46.65594},
    "congonhas": {"label": "Aeroporto de Congonhas, São Paulo", "lat": -23.62611, "lon": -46.65639},
    "faria": {"label": "Av. Faria Lima, São Paulo", "lat": -23.57055, "lon": -46.69217},
    "ibirapuera": {"label": "Parque Ibirapuera, São Paulo", "lat": -23.58742, "lon": -46.65764},
}
VANO_BENCHMARK_SCENARIO_PAIRS = [
    ("morumbi-paulista", "morumbi", "paulista"),
    ("paulista-morumbi", "paulista", "morumbi"),
    ("congonhas-paulista", "congonhas", "paulista"),
    ("paulista-congonhas", "paulista", "congonhas"),
    ("faria-ibirapuera", "faria", "ibirapuera"),
    ("ibirapuera-faria", "ibirapuera", "faria"),
    ("morumbi-ibirapuera", "morumbi", "ibirapuera"),
    ("congonhas-faria", "congonhas", "faria"),
    ("morumbi-faria", "morumbi", "faria"),
    ("congonhas-morumbi", "congonhas", "morumbi"),
]

def _public_benchmark_scenarios(limit=10):
    rows = []
    for sid, a, b in VANO_BENCHMARK_SCENARIO_PAIRS[:max(1, min(10, int(limit or 10)))]:
        rows.append({
            "id": sid,
            "origin": dict(VANO_BENCHMARK_POINTS[a]),
            "destination": dict(VANO_BENCHMARK_POINTS[b]),
            "profile": "driving",
            "recommended_modes": ["fastest", "smart", "safest"],
        })
    return rows

def _benchmark_capabilities_payload():
    origin = PUBLIC_SITE_URL or request.host_url.rstrip("/")
    route_url = f"{origin}/api/benchmark/v1/route"
    return {
        "ok": True,
        "service": "VANO MAPS Route Benchmark",
        "protocol": "vano-route-benchmark",
        "version": "1.0",
        "build": VANO_BUILD_ID,
        "read_only": True,
        "agent_ready": True,
        "generated_at": utcnow_iso(),
        "endpoints": {
            "capabilities": f"{origin}/api/benchmark/v1/capabilities",
            "scenarios": f"{origin}/api/benchmark/v1/scenarios?limit=10",
            "route": route_url,
            "human_ui": f"{origin}/benchmark-de-rotas",
        },
        "limits": {
            "requests_per_minute_per_ip": VANO_PUBLIC_BENCHMARK_RATE_PER_MIN,
            "max_direct_distance_km": VANO_PUBLIC_BENCHMARK_MAX_KM,
            "max_variant_budget": 4,
            "recommended_parallelism": 1,
            "recommended_delay_ms_between_calls": 250,
        },
        "profiles": ["driving", "motorcycle", "cycling", "walking"],
        "modes": ["fastest", "smart", "safest", "quietest"],
        "query": {
            "required": ["start_lat", "start_lon", "end_lat", "end_lon"],
            "optional": {
                "profile": "driving|motorcycle|cycling|walking (default driving)",
                "mode": "fastest|smart|safest|quietest (default smart)",
                "adaptive": "0|1 (default 1)",
                "variant_budget": "2..4 for public benchmark (default 4)",
                "avoid_tolls": "0|1",
                "avoid_unpaved": "0|1",
                "avoid_ferries": "0|1",
                "include_geometry": "0|1 (default 0; use 1 only to inspect/draw the path)",
                "benchmark_nonce": "optional opaque id; unique values avoid full-result cache reuse",
            },
        },
        "response_contract": {
            "benchmark": ["protocol", "request_id", "generated_at", "geometry_included", "limits"],
            "benchmark_result": ["selected_route_id", "eta_min", "distance_km", "traffic_score", "safety_score", "vano_score", "candidate_count", "provider", "distributed"],
            "routes": "VANO route candidates; geometry/steps omitted unless include_geometry=1",
        },
        "example": {
            "method": "GET",
            "url": route_url + "?start_lat=-23.62326&start_lon=-46.69844&end_lat=-23.56147&end_lon=-46.65594&profile=driving&mode=smart&adaptive=1&variant_budget=4&include_geometry=0",
        },
        "methodology": [
            "Use identical coordinates/options when comparing modes.",
            "Run multiple rounds and report median/p95 latency instead of one request.",
            "Use a unique benchmark_nonce for cold/full calculations; omit/reuse it when observing cache behavior.",
            "Do not interpret ETA alone as safety quality; compare traffic, safety and VANO scores separately.",
        ],
    }

@app.route("/benchmark-de-rotas")
def route_benchmark_page():
    return render_template(
        "benchmark_de_rotas.html",
        mapbox_token=MAPBOX_ACCESS_TOKEN if mapbox_ready() else "",
        mapbox_style=MAPBOX_STYLE_NIGHT or MAPBOX_STYLE_DAY,
        benchmark_enabled=VANO_PUBLIC_BENCHMARK_ENABLED,
        benchmark_rate=VANO_PUBLIC_BENCHMARK_RATE_PER_MIN,
        benchmark_max_km=VANO_PUBLIC_BENCHMARK_MAX_KM,
    )

@app.route("/.well-known/vano-benchmark.json")
@app.route("/api/benchmark/v1/capabilities")
def api_benchmark_capabilities():
    if not VANO_PUBLIC_BENCHMARK_ENABLED:
        return jsonify({"ok": False, "error": "benchmark_disabled"}), 503
    return jsonify(_benchmark_capabilities_payload())

@app.route("/api/benchmark/v1/scenarios")
def api_benchmark_scenarios():
    if not VANO_PUBLIC_BENCHMARK_ENABLED:
        return jsonify({"ok": False, "error": "benchmark_disabled"}), 503
    if not rate_limit("public-benchmark-scenarios", 30, 60):
        return jsonify({"ok": False, "error": "rate_limited", "retry_after_s": 60}), 429
    try:
        limit = int(request.args.get("limit", "10") or 10)
    except ValueError:
        limit = 10
    rows = _public_benchmark_scenarios(limit)
    return jsonify({
        "ok": True,
        "protocol": "vano-route-benchmark",
        "version": "1.0",
        "build": VANO_BUILD_ID,
        "count": len(rows),
        "scenarios": rows,
    })


@app.route("/excluir-conta")
def account_delete_page():
    return render_template("account_delete_page.html")


@app.route("/account/delete", methods=["POST"])
@login_required
def account_delete():
    if not validate_csrf():
        abort(400)
    if not rate_limit("account-delete", 4, 900):
        flash("Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.", "danger")
        return redirect(url_for("profile") + "#accountDanger")
    user = current_user()
    confirmation = str(request.form.get("confirmation") or "").strip().upper()
    password = request.form.get("password", "")
    if confirmation != "EXCLUIR":
        flash("Digite EXCLUIR para confirmar a exclusão permanente.", "danger")
        return redirect(url_for("profile") + "#accountDanger")
    if str(user["auth_provider"] or "password") == "password" and not verify_password(user["password_hash"], password):
        flash("Senha atual incorreta.", "danger")
        return redirect(url_for("profile") + "#accountDanger")
    uid = int(user["id"])
    db = get_db()
    try:
        # Preserve only legally/operationally necessary records through existing
        # ON DELETE SET NULL constraints. Account-linked personal rows cascade.
        db.execute("DELETE FROM users WHERE id=?", (uid,))
        db.commit()
    except Exception:
        db.rollback()
        app.logger.exception("Account deletion failed")
        flash("Não foi possível excluir sua conta agora. Tente novamente.", "danger")
        return redirect(url_for("profile") + "#accountDanger")
    session.clear()
    response = redirect(url_for("index"))
    response.delete_cookie(REMEMBER_COOKIE_NAME, path="/")
    flash("Sua conta foi excluída permanentemente.", "success")
    return response


PRIVACY_REQUEST_TYPES = {
    "access": "Acesso aos meus dados",
    "correction": "Correção de dados",
    "deletion": "Exclusão / anonimização",
    "portability": "Portabilidade",
    "sharing": "Informações sobre compartilhamento",
    "objection": "Oposição a tratamento",
    "consent": "Revogação de consentimento",
    "other": "Outro pedido de privacidade",
}


@app.route("/privacy/request", methods=["POST"])
@login_required
def privacy_request_create():
    if not validate_csrf():
        abort(400)
    if not rate_limit("privacy-request", 5, 3600):
        flash("Muitos pedidos em pouco tempo. Aguarde antes de enviar novamente.", "danger")
        return redirect(url_for("privacy_policy"))
    user = current_user()
    request_type = str(request.form.get("request_type") or "other").strip().lower()
    if request_type not in PRIVACY_REQUEST_TYPES:
        request_type = "other"
    message = re.sub(r"\s+", " ", str(request.form.get("message") or "").strip())[:1200]
    now = utcnow_iso()
    protocol = "PRV-" + datetime.now(timezone.utc).strftime("%Y%m%d") + "-" + secrets.token_hex(3).upper()
    db = get_db()
    # Token is random enough for a human protocol; retry once on the extremely
    # unlikely event of a collision.
    for _ in range(2):
        try:
            db.execute(
                """INSERT INTO privacy_requests(protocol,user_id,email,request_type,message,status,created_at,updated_at)
                   VALUES(?,?,?,?,?,'pending',?,?)""",
                (protocol, user["id"], str(user["email"] or "")[:220], request_type, message, now, now),
            )
            db.commit()
            break
        except IntegrityError:
            db.rollback(); protocol = "PRV-" + datetime.now(timezone.utc).strftime("%Y%m%d") + "-" + secrets.token_hex(4).upper()
    else:
        flash("Não foi possível gerar o protocolo agora. Tente novamente.", "danger")
        return redirect(url_for("privacy_policy"))
    audit("privacy_request_created", {"protocol": protocol, "request_type": request_type}, user["id"] if user else None)
    flash(f"Pedido recebido. Seu protocolo é {protocol}.", "success")
    return redirect(url_for("privacy_policy") + "#direitos")


@app.route("/admin/privacy")
@admin_required
def admin_privacy_requests():
    rows = get_db().execute(
        """SELECT p.*,COALESCE(u.name,'Conta removida') user_name
           FROM privacy_requests p LEFT JOIN users u ON u.id=p.user_id
           ORDER BY CASE p.status WHEN 'pending' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END, p.created_at DESC
           LIMIT 500"""
    ).fetchall()
    return render_template("admin_privacy.html", rows=rows, request_types=PRIVACY_REQUEST_TYPES)


@app.route("/admin/privacy/<int:request_id>/status", methods=["POST"])
@admin_required
def admin_privacy_request_status(request_id):
    if not validate_csrf():
        abort(400)
    status = str(request.form.get("status") or "pending").strip()
    if status not in {"pending", "in_progress", "completed", "rejected"}:
        abort(400)
    note = str(request.form.get("admin_note") or "").strip()[:1200]
    db = get_db()
    row = db.execute("SELECT protocol FROM privacy_requests WHERE id=?", (request_id,)).fetchone()
    if not row:
        abort(404)
    db.execute("UPDATE privacy_requests SET status=?,admin_note=?,updated_at=? WHERE id=?", (status, note, utcnow_iso(), request_id))
    db.commit()
    audit("privacy_request_status", {"protocol": row["protocol"], "status": status})
    flash("Pedido de privacidade atualizado.", "success")
    return redirect(url_for("admin_privacy_requests"))

# -----------------------------
# Admin
# -----------------------------

