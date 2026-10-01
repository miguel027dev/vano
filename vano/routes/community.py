"""VANO profile, reports, family, notifications and SOS routes.

Extracted from the historical monolithic app.py without changing route bodies or
business rules. Runtime dependencies are injected once during application startup.
"""
from vano.bootstrap import inject as _vano_inject
_vano_inject(globals())
del _vano_inject

@app.route("/map")
def map_page():
    # A navegação principal agora vive na home mobile-first.
    return redirect(url_for("index"))


@app.route("/report", methods=["GET", "POST"])
@login_required
def report_page():
    if request.method == "POST":
        if not validate_csrf():
            abort(400)
        if not rate_limit("report", 8, 3600):
            flash("Limite temporário de denúncias atingido.", "danger")
            return render_template("report.html", categories=CATEGORY_META), 429

        category = request.form.get("category", "other")
        title = request.form.get("title", "").strip()
        description = request.form.get("description", "").strip()
        address = request.form.get("address", "").strip()
        try:
            severity = int(request.form.get("severity", "3"))
            lat = float(request.form.get("latitude", ""))
            lon = float(request.form.get("longitude", ""))
        except ValueError:
            flash("Localização inválida.", "danger")
            return render_template("report.html", categories=CATEGORY_META), 400

        if category not in CATEGORY_META:
            category = "other"
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            flash("Coordenadas fora do intervalo válido.", "danger")
            return render_template("report.html", categories=CATEGORY_META), 400
        if not (4 <= len(title) <= 100):
            flash("O título deve ter entre 4 e 100 caracteres.", "danger")
            return render_template("report.html", categories=CATEGORY_META), 400
        if len(description) > 600 or len(address) > 220:
            flash("Texto muito longo.", "danger")
            return render_template("report.html", categories=CATEGORY_META), 400

        road_hit = snap_alert_to_nearest_road(lat, lon)
        if not road_hit:
            flash("Não foi possível fixar o alerta em uma via próxima. Tente novamente.", "danger")
            return render_template("report.html", categories=CATEGORY_META), 503
        lat, lon = road_hit["lat"], road_hit["lon"]
        if road_hit.get("road_name"):
            address = road_hit["road_name"]

        severity = clamp(severity, 1, 5)
        author_weight = report_author_weight(session.get("user_id"))
        severity = max(1, int(round(severity * author_weight)))
        expires_at = (datetime.now(timezone.utc) + timedelta(days=14)).replace(microsecond=0).isoformat()
        db = get_db()
        db.execute(
            """
            INSERT INTO reports(user_id,category,title,description,severity,latitude,longitude,address,status,created_at,expires_at,road_snapped,snap_distance_m,road_name)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (session["user_id"], category, title, description, severity, lat, lon, address, "active", utcnow_iso(), expires_at, 1, round(road_hit["distance_m"], 1), road_hit.get("road_name") or ""),
        )
        db.commit()
        audit("report_created", {"category": category, "severity": severity, "road_snapped": True, "snap_distance_m": round(road_hit["distance_m"], 1)})
        record_activity("alert", {"label": "road-snap:full", "target": "report", "snap_distance_m": round(road_hit["distance_m"], 1)}, status_code=201, method="EVENT", path="/report", endpoint="report_page")
        flash("Alerta publicado. Obrigado por ajudar a comunidade.", "success")
        return redirect(url_for("alerts_page"))

    return render_template("report.html", categories=CATEGORY_META)


@app.route("/alerts")
@login_required
def alerts_page():
    db = get_db()
    reports = db.execute(
        """
        SELECT r.*, u.name reporter_name
        FROM reports r JOIN users u ON u.id=r.user_id
        WHERE r.status='active' AND (r.expires_at IS NULL OR r.expires_at > ?)
        ORDER BY r.created_at DESC LIMIT 100
        """,
        (utcnow_iso(),),
    ).fetchall()
    return render_template("alerts.html", reports=reports, categories=CATEGORY_META)


@app.route("/alerts/<int:report_id>/confirm", methods=["POST"])
@login_required
def confirm_report(report_id):
    if not validate_csrf():
        abort(400)
    db = get_db()
    report = db.execute("SELECT id,status FROM reports WHERE id=?", (report_id,)).fetchone()
    if not report or report["status"] != "active":
        abort(404)
    try:
        db.execute(
            "INSERT INTO report_confirmations(report_id,user_id,created_at) VALUES(?,?,?)",
            (report_id, session["user_id"], utcnow_iso()),
        )
        db.execute("UPDATE reports SET confirmations=confirmations+1 WHERE id=?", (report_id,))
        db.commit()
        invalidate_route_context("reports")
        flash("Alerta confirmado.", "success")
    except IntegrityError:
        db.rollback()
        flash("Você já confirmou este alerta.", "info")
    return redirect(url_for("alerts_page"))


@app.route("/profile", methods=["GET", "POST"])
@login_required
def profile():
    db = get_db()
    user = current_user()
    if request.method == "POST":
        if not validate_csrf():
            abort(400)
        locale = _normalize_ui_locale(request.form.get("locale") or active_ui_locale()) or active_ui_locale()
        if locale not in SUPPORTED_UI_LOCALES:
            locale = active_ui_locale()
        distance_unit = (request.form.get("distance_unit") or "km").strip()
        if distance_unit not in {"km", "mi"}:
            distance_unit = "km"
        visibility = (request.form.get("presence_visible") or "0") == "1"
        # Presença é opt-in e só pode ser publicada por motoristas adultos.
        # A posição servida aos demais é sempre quantizada/aproximada.
        can_publish_presence = bool(user and int(user["is_app_driver"] or 0) == 1 and int(user["age"] or 0) >= 18 and user["presence_terms_accepted_at"])
        presence_visible = 1 if visibility and can_publish_presence else 0
        networks = [x.strip()[:40] for x in request.form.getlist("fuel_networks") if x.strip()][:12]
        map_style = (request.form.get("map_style") or "auto").strip().lower()
        if map_style not in {"auto", "day", "afternoon", "night", "rain"}:
            map_style = "auto"
        map_accent = (request.form.get("map_accent") or "violet").strip().lower()
        if map_accent not in MAPBOX_ACCENT_PRESETS:
            map_accent = "violet"
        avoid_ferries = 1 if request.form.get("avoid_ferries") == "1" else 0
        avoid_tolls = 1 if request.form.get("avoid_tolls") == "1" else 0
        avoid_unpaved = 1 if request.form.get("avoid_unpaved") == "1" else 0
        emergency_name = (request.form.get("emergency_name") or "").strip()[:80]
        emergency_phone = re.sub(r"[^0-9+() -]", "", (request.form.get("emergency_phone") or "").strip())[:30]
        db.execute(
            """UPDATE users SET locale=?,distance_unit=?,vehicle_make=?,vehicle_model=?,vehicle_plate=?,vehicle_year=?,preferred_fuel_networks=?,home_label=?,work_label=?,presence_visible=?,emergency_name=?,emergency_phone=?,map_style=?,map_accent=?,avoid_ferries=?,avoid_tolls=?,avoid_unpaved=? WHERE id=?""",
            (
                locale, distance_unit,
                (request.form.get("vehicle_make") or "").strip()[:60],
                (request.form.get("vehicle_model") or "").strip()[:80],
                (request.form.get("vehicle_plate") or "").strip().upper()[:16],
                (request.form.get("vehicle_year") or "").strip()[:8],
                json.dumps(networks, ensure_ascii=False),
                (request.form.get("home_label") or "").strip()[:220],
                (request.form.get("work_label") or "").strip()[:220],
                presence_visible, emergency_name, emergency_phone, map_style, map_accent,
                avoid_ferries, avoid_tolls, avoid_unpaved, session["user_id"],
            ),
        )
        if not presence_visible:
            db.execute("DELETE FROM nearby_presence WHERE user_id=?", (session["user_id"],))
        db.commit()
        flash("Preferências salvas.", "success")
        response = redirect(url_for("profile") + "#settings")
        cookie_kwargs = dict(max_age=365 * 24 * 60 * 60, secure=request.is_secure, httponly=False, samesite="Lax", path="/")
        response.set_cookie("vano_locale", locale, **cookie_kwargs)
        response.set_cookie("vano_locale_auto", locale, **cookie_kwargs)
        return response

    recent = db.execute(
        "SELECT * FROM route_history WHERE user_id=? ORDER BY created_at DESC LIMIT 8",
        (session["user_id"],),
    ).fetchall()
    mine = db.execute(
        "SELECT * FROM reports WHERE user_id=? ORDER BY created_at DESC LIMIT 8",
        (session["user_id"],),
    ).fetchall()
    user = current_user()
    try:
        fuel_networks = json.loads(user["preferred_fuel_networks"] or "[]") if user else []
    except Exception:
        fuel_networks = []
    try:
        created = datetime.fromisoformat(str(user["created_at"]).replace("Z", "+00:00"))
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        membership_days = max(0, (datetime.now(timezone.utc) - created).days)
    except Exception:
        membership_days = 0
    linked_accounts = db.execute(
        """SELECT tl.id,tl.relation,tl.created_at,u.id AS user_id,u.name,u.email,u.avatar_url
           FROM trusted_links tl JOIN users u ON u.id=tl.trusted_user_id
           WHERE tl.owner_user_id=? ORDER BY tl.created_at DESC""",
        (session["user_id"],),
    ).fetchall()
    # IDs são monotônicos na tabela users; 1–5000 representam os primeiros
    # cadastros e mantêm o selo mesmo que contas antigas sejam removidas.
    try:
        is_pioneer = 1 <= int(user["id"]) <= 5000
    except (TypeError, ValueError, KeyError):
        is_pioneer = False
    return render_template("profile.html", recent=recent, mine=mine, categories=CATEGORY_META, fuel_networks=fuel_networks, membership_days=membership_days, linked_accounts=linked_accounts, is_pioneer=is_pioneer)



@app.route("/api/family-invite", methods=["POST"])
@login_required
def api_family_invite():
    if not validate_csrf():
        abort(400)
    db = get_db()
    now = datetime.now(timezone.utc)
    token = secrets.token_urlsafe(32)
    expires = (now + timedelta(days=7)).replace(microsecond=0).isoformat()
    db.execute("DELETE FROM family_invites WHERE inviter_user_id=? AND accepted_at IS NULL", (session["user_id"],))
    db.execute(
        "INSERT INTO family_invites(token,inviter_user_id,relation,created_at,expires_at) VALUES(?,?,?,?,?)",
        (token, session["user_id"], "responsavel", now.replace(microsecond=0).isoformat(), expires),
    )
    db.commit()
    return jsonify({"ok": True, "url": url_for("family_invite", token=token, _external=True), "expires_at": expires})


@app.route("/family/invite/<token>", methods=["GET", "POST"])
def family_invite(token):
    db = get_db()
    invite = db.execute(
        "SELECT fi.*,u.name AS inviter_name,u.email AS inviter_email,u.age AS inviter_age FROM family_invites fi JOIN users u ON u.id=fi.inviter_user_id WHERE fi.token=?",
        (token,),
    ).fetchone()
    if not invite:
        return render_template("error.html", code=404, message="Convite não encontrado."), 404
    try:
        expired = datetime.fromisoformat(invite["expires_at"].replace("Z", "+00:00")) < datetime.now(timezone.utc)
    except Exception:
        expired = True
    if expired or invite["accepted_at"]:
        return render_template("family_invite.html", invite=invite, expired=True)
    if request.method == "POST":
        user = current_user()
        if not user:
            return redirect(url_for("login", next=request.path))
        if not validate_csrf():
            abort(400)
        if int(user["id"]) == int(invite["inviter_user_id"]):
            flash("Use outra conta para aceitar seu próprio convite.", "warning")
            return redirect(request.path)
        if user["age"] is not None and int(user["age"] or 0) < 18:
            flash("A conta responsável precisa ser de uma pessoa adulta.", "warning")
            return redirect(request.path)
        now = utcnow_iso()
        db.execute(
            """INSERT INTO trusted_links(owner_user_id,trusted_user_id,relation,created_at)
               VALUES(?,?,?,?) ON CONFLICT(owner_user_id,trusted_user_id) DO NOTHING""",
            (invite["inviter_user_id"], user["id"], invite["relation"] or "responsavel", now),
        )
        db.execute(
            "UPDATE family_invites SET accepted_at=?,accepted_by_user_id=? WHERE id=?",
            (now, user["id"], invite["id"]),
        )
        db.execute(
            "INSERT INTO app_notifications(user_id,source_user_id,kind,title,body,payload_json,created_at) VALUES(?,?,?,?,?,?,?)",
            (invite["inviter_user_id"], user["id"], "family", "Conta vinculada", f"{user['name']} aceitou seu convite de vínculo.", "{}", now),
        )
        db.commit()
        flash("Conta vinculada com sucesso.", "success")
        return redirect(url_for("profile") + "#family")
    return render_template("family_invite.html", invite=invite, expired=False)


@app.route("/api/family-link/<int:link_id>/remove", methods=["POST"])
@login_required
def api_family_link_remove(link_id):
    if not validate_csrf():
        abort(400)
    db = get_db()
    db.execute("DELETE FROM trusted_links WHERE id=? AND owner_user_id=?", (link_id, session["user_id"]))
    db.commit()
    flash("Vínculo removido.", "success")
    return redirect(url_for("profile") + "#family")


@app.route("/notifications")
@login_required
def notifications_page():
    db = get_db()
    items = db.execute(
        "SELECT n.*,u.name AS source_name,u.avatar_url AS source_avatar FROM app_notifications n LEFT JOIN users u ON u.id=n.source_user_id WHERE n.user_id=? ORDER BY n.created_at DESC LIMIT 80",
        (session["user_id"],),
    ).fetchall()
    db.execute("UPDATE app_notifications SET read_at=COALESCE(read_at,?) WHERE user_id=?", (utcnow_iso(), session["user_id"]))
    db.commit()
    return render_template("notifications.html", notifications=items)


@app.route("/notifications/<int:notification_id>/location")
@login_required
def notification_location(notification_id):
    row = get_db().execute(
        "SELECT payload_json FROM app_notifications WHERE id=? AND user_id=?",
        (notification_id, session["user_id"]),
    ).fetchone()
    if not row:
        abort(404)
    try:
        data = json.loads(row["payload_json"] or "{}")
        lat, lon = float(data.get("lat")), float(data.get("lon"))
    except Exception:
        abort(404)
    return redirect(f"https://www.google.com/maps?q={lat:.6f},{lon:.6f}")


@app.route("/api/notifications/unread")
@login_required
def api_notifications_unread():
    row = get_db().execute(
        "SELECT COUNT(*) AS n FROM app_notifications WHERE user_id=? AND read_at IS NULL",
        (session["user_id"],),
    ).fetchone()
    return jsonify({"ok": True, "unread": int(row["n"] or 0)})


@app.route("/api/sos", methods=["POST"])
@login_required
def api_sos():
    if not validate_csrf():
        abort(400)
    payload = request.get_json(silent=True) or {}
    try:
        lat = float(payload.get("lat")); lon = float(payload.get("lon"))
    except (TypeError, ValueError):
        return jsonify({"error": "Posição inválida."}), 400
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return jsonify({"error": "Posição inválida."}), 400
    user = current_user()
    db = get_db()
    links = db.execute(
        "SELECT tl.trusted_user_id,u.name,u.email FROM trusted_links tl JOIN users u ON u.id=tl.trusted_user_id WHERE tl.owner_user_id=? AND u.is_active=1",
        (session["user_id"],),
    ).fetchall()
    now = utcnow_iso()
    destination = str(payload.get("destination") or "")[:180]
    notification_payload = json.dumps({"lat": round(lat, 6), "lon": round(lon, 6), "destination": destination}, ensure_ascii=False)
    for linked in links:
        db.execute(
            "INSERT INTO app_notifications(user_id,source_user_id,kind,title,body,payload_json,created_at) VALUES(?,?,?,?,?,?,?)",
            (linked["trusted_user_id"], user["id"], "sos", f"SOS de {user['name']}", "A pessoa vinculada acionou o SOS no Vano Maps. Abra para ver a posição compartilhada.", notification_payload, now),
        )
    db.commit()
    audit("sos_internal_notify", {"linked_count": len(links)}, user["id"] if user else None)
    return jsonify({"ok": True, "notified": len(links)})


