"""VANO core/public application routes.

Extracted from the historical monolithic app.py without changing route bodies or
business rules. Runtime dependencies are injected once during application startup.
"""
from vano.bootstrap import inject as _vano_inject
_vano_inject(globals())
del _vano_inject

@app.route("/healthz")
def healthz():
    """Render readiness check without calling third-party services.

    The previous health check returned 200 even while `/` crashed because a
    critical helper was missing. This now validates PostgreSQL, the home template
    and provider configuration helpers so Render can reject a broken deploy.
    """
    try:
        get_db().execute("SELECT 1").fetchone()
        get_db().execute("SELECT COUNT(*) FROM auth_sessions").fetchone()
        app.jinja_env.get_template("index.html")
        providers = {
            "mapbox_configured": mapbox_ready(),
            "google_configured": google_ready(),
        }
    except Exception as exc:
        app.logger.exception("healthz readiness failure")
        return jsonify({"ok": False, "service": "vano", "error": type(exc).__name__}), 503
    return jsonify({"ok": True, "service": "vano", "embed": True, **providers}), 200


@app.route("/api/keepalive", methods=["GET", "POST"])
def keepalive_probe():
    """Extremely lightweight GET/POST target used by the backend keep-alive worker."""
    return jsonify({"ok": True, "service": "vano", "ts": int(time.time())}), 200


@app.get("/.well-known/assetlinks.json")
def android_asset_links():
    """Digital Asset Links for the VANO MAPS Trusted Web Activity."""
    payload = [{
        "relation": ["delegate_permission/common.handle_all_urls"],
        "target": {
            "namespace": "android_app",
            "package_name": "com.vano.maps",
            "sha256_cert_fingerprints": [
                "3E:F0:11:85:08:60:D0:AE:62:9E:8D:93:FB:74:9D:70:6A:3E:C5:0E:DC:38:69:71:C4:A6:13:7A:A3:50:63:46",
                "65:D1:8D:53:B2:5B:D5:D6:0C:CF:59:E0:DC:36:18:1D:2D:19:15:D3:07:69:E7:52:68:B7:CD:94:21:F4:BC:88",
            ],
        },
    }]
    response = app.response_class(
        json.dumps(payload, separators=(",", ":")),
        mimetype="application/json",
    )
    response.headers["Cache-Control"] = "public, max-age=3600"
    return response


@app.get("/manifest.webmanifest")
def web_app_manifest():
    response = app.send_static_file("manifest.webmanifest")
    response.headers["Content-Type"] = "application/manifest+json; charset=utf-8"
    response.headers["Cache-Control"] = "public, max-age=3600"
    return response


@app.route("/vano-sw.js")
def vano_service_worker():
    response = app.send_static_file("vano-sw.js")
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Service-Worker-Allowed"] = "/"
    response.headers["X-VANO-Build"] = VANO_BUILD_ID
    return response


@app.route("/frame-test")
def frame_test():
    """Minimal page used to verify that the reverse proxy is not blocking frames."""
    return """<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b1119;color:#fff;font:16px system-ui}.box{padding:28px;border:1px solid #24466f;border-radius:18px;background:#101b29;text-align:center}.ok{color:#67e0a6;font-weight:800}</style></head><body><div class='box'><div class='ok'>IFRAME LIBERADO</div><p>Esta resposta veio do Flask.</p></div><script>if(parent!==window)parent.postMessage({type:'vano:frame-test',ok:true},'*');</script></body></html>"""


@app.route("/embed")
def embed_entry():
    """Stable entry point specifically for embedding inside Vértice Web."""
    if current_user():
        return redirect(url_for("map_page"))
    return index()


# -----------------------------
# Pages
# -----------------------------

@app.route("/")
def index():
    # V91 — keep the product entry path lean. The old page counted users and
    # active reports on every visit even though the map no longer renders those
    # values. Avoid that PostgreSQL round-trip and render immediately.
    user = current_user()
    map_style_pref = (user["map_style"] if user and "map_style" in user.keys() else "auto") or "auto"
    # Normalize legacy values without destroying the user's new explicit choice.
    if map_style_pref in {"vano", "vivid"}:
        map_style_pref = "auto"
    elif map_style_pref in {"standard", "streets"}:
        map_style_pref = "day"
    if map_style_pref not in {"auto", "day", "afternoon", "night", "rain"}:
        map_style_pref = "auto"
    style_lookup = {
        "day": MAPBOX_STYLE_DAY,
        "afternoon": MAPBOX_STYLE_DAY,
        "night": MAPBOX_STYLE_NIGHT,
        "rain": MAPBOX_STYLE_DAY,
    }
    selected_map_style = style_lookup.get(map_style_pref, MAPBOX_STYLE_DAY)
    map_accent_pref = (user["map_accent"] if user and "map_accent" in user.keys() else "violet") or "violet"
    if map_accent_pref not in MAPBOX_ACCENT_PRESETS:
        map_accent_pref = "violet"
    return render_template(
        "index.html",
        mapbox_token=MAPBOX_ACCESS_TOKEN if mapbox_ready() else "",
        mapbox_style=selected_map_style,
        mapbox_styles={
            "day": MAPBOX_STYLE_DAY,
            "afternoon": MAPBOX_STYLE_DAY,
            "night": MAPBOX_STYLE_NIGHT,
            "black": MAPBOX_STYLE_NIGHT,
            "rain": MAPBOX_STYLE_DAY,
        },
        map_style_mode=map_style_pref,
        map_accent=map_accent_pref,
        map_accent_colors=MAPBOX_ACCENT_PRESETS[map_accent_pref],
        nav_preferences={
            "avoid_ferries": bool(user and user["avoid_ferries"]),
            "avoid_tolls": bool(user and user["avoid_tolls"]),
            "avoid_unpaved": bool(user and user["avoid_unpaved"]),
        },
        mapbox_ready=mapbox_ready(),
        categories=CATEGORY_META,
        guest_route_limit=GUEST_ROUTE_LIMIT,
        guest_routes_remaining=guest_routes_remaining(),
    )



def _password_reset_email(to_email, reset_url):
    """Send a reset link when SMTP is configured; fail closed without leaking account state."""
    if not (SMTP_HOST and SMTP_FROM):
        app.logger.warning("Password reset requested but SMTP is not configured")
        return False
    msg = EmailMessage()
    msg["Subject"] = "Redefinir sua senha do VANO MAPS"
    msg["From"] = SMTP_FROM
    msg["To"] = to_email
    msg.set_content(
        "Recebemos um pedido para redefinir sua senha do VANO MAPS.\n\n"
        f"Abra este link (válido por 30 minutos):\n{reset_url}\n\n"
        "Se você não pediu essa alteração, ignore esta mensagem."
    )
    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=8) as smtp:
            if SMTP_USE_TLS:
                smtp.starttls()
            if SMTP_USER:
                smtp.login(SMTP_USER, SMTP_PASSWORD)
            smtp.send_message(msg)
        return True
    except Exception:
        app.logger.exception("Could not send password reset e-mail")
        return False


@app.route("/forgot-password", methods=["GET", "POST"])
def forgot_password():
    if request.method == "POST":
        if not validate_csrf():
            abort(400)
        if not rate_limit("forgot-password", 5, 900, shared=True):
            flash("Muitos pedidos em pouco tempo. Aguarde alguns minutos.", "danger")
            return render_template("forgot_password.html"), 429
        email = request.form.get("email", "").strip().lower()
        # Always show the same answer so this endpoint cannot enumerate accounts.
        if EMAIL_RE.match(email) and len(email) <= 180:
            user = get_db().execute("SELECT id,email,is_active FROM users WHERE email=?", (email,)).fetchone()
            if user and user["is_active"]:
                raw_token = secrets.token_urlsafe(32)
                token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
                now = datetime.now(timezone.utc)
                expires = (now + timedelta(minutes=30)).replace(microsecond=0).isoformat()
                db = get_db()
                db.execute("UPDATE password_reset_tokens SET used_at=? WHERE user_id=? AND used_at IS NULL", (now.replace(microsecond=0).isoformat(), user["id"]))
                db.execute(
                    "INSERT INTO password_reset_tokens(user_id,token_hash,created_at,expires_at,used_at) VALUES(?,?,?,?,NULL)",
                    (user["id"], token_hash, now.replace(microsecond=0).isoformat(), expires),
                )
                db.commit()
                public_origin = PUBLIC_SITE_URL or request.host_url.rstrip("/")
                reset_url = f"{public_origin}{url_for('reset_password', token=raw_token)}"
                _password_reset_email(user["email"], reset_url)
                audit("password_reset_requested", {}, user["id"])
        flash("Se existir uma conta com esse e-mail, enviaremos um link de redefinição.", "success")
        return redirect(url_for("forgot_password"))
    return render_template("forgot_password.html")


@app.route("/reset-password/<token>", methods=["GET", "POST"])
def reset_password(token):
    if not re.fullmatch(r"[A-Za-z0-9_-]{30,100}", token or ""):
        abort(404)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    row = get_db().execute(
        "SELECT prt.*,u.email,u.is_active FROM password_reset_tokens prt JOIN users u ON u.id=prt.user_id WHERE prt.token_hash=?",
        (token_hash,),
    ).fetchone()
    valid = False
    if row and row["used_at"] is None and row["is_active"]:
        expires = parse_iso(row["expires_at"])
        valid = bool(expires and expires > datetime.now(timezone.utc))
    if request.method == "POST":
        if not validate_csrf():
            abort(400)
        if not rate_limit("reset-password", 10, 900, shared=True):
            flash("Muitas tentativas. Aguarde antes de tentar novamente.", "danger")
            return render_template("reset_password.html", reset_valid=valid), 429
        if not valid:
            flash("Esse link expirou ou já foi utilizado.", "danger")
            return redirect(url_for("forgot_password"))
        password = request.form.get("password", "")
        confirm = request.form.get("confirm_password", "")
        valid_password, password_error = validate_password_strength(password)
        if password != confirm:
            valid_password, password_error = False, "As senhas digitadas não são iguais."
        if not valid_password:
            flash(password_error, "danger")
            return render_template("reset_password.html", reset_valid=True), 400
        db = get_db()
        # Compute the expensive hash before holding the token's row lock.
        new_hash = hash_password(password)
        from vano.security.auth import claim_password_reset
        claimed = claim_password_reset(db, row["id"], utcnow_iso())
        if not claimed:
            db.rollback()
            flash("Esse link expirou ou já foi utilizado.", "danger")
            return redirect(url_for("forgot_password"))
        db.execute("UPDATE users SET password_hash=? WHERE id=?", (new_hash, claimed["user_id"]))
        db.execute("UPDATE auth_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL", (utcnow_iso(), claimed["user_id"]))
        db.commit()
        audit("password_reset_completed", {}, claimed["user_id"])
        flash("Senha atualizada. Entre novamente.", "success")
        return redirect(url_for("login"))
    return render_template("reset_password.html", reset_valid=valid)


@app.route("/share-target")
def share_target():
    """PWA/Android share target: send an address from another app directly to VANO MAPS search."""
    value = (request.args.get("text") or request.args.get("url") or request.args.get("title") or "").strip()
    if len(value) > 240:
        value = value[:240]
    return redirect(url_for("index", q=value) if value else url_for("index"))


@app.route("/api/search-suggestions")
def api_search_suggestions():
    user = current_user()
    if not user:
        return jsonify({"items": []})
    items, seen = [], set()
    for kind, label in (("home", user["home_label"]), ("work", user["work_label"])):
        label = str(label or "").strip()
        if label and label.lower() not in seen:
            seen.add(label.lower()); items.append({"kind": kind, "label": label})
    db = get_db()
    try:
        favorites = db.execute("SELECT id,name,label,latitude,longitude FROM saved_places WHERE user_id=? ORDER BY updated_at DESC LIMIT 8", (user["id"],)).fetchall()
    except Exception:
        favorites = []
    for row in favorites:
        label = str(row["label"] or "").strip()
        if not label or label.lower() in seen: continue
        seen.add(label.lower()); items.append({"kind":"favorite","id":row["id"],"name":row["name"] or label.split(",",1)[0],"label":label,"lat":row["latitude"],"lon":row["longitude"]})
    try:
        now_hour = datetime.now().hour
        raw_history = db.execute("SELECT destination_label,destination_lat,destination_lon,created_at FROM route_history WHERE user_id=? AND destination_label<>'' ORDER BY created_at DESC LIMIT 100", (user["id"],)).fetchall()
        by_now = {}
        for h in raw_history:
            try: dt = parse_iso(h["created_at"]); hh = dt.hour if dt else -10
            except Exception: hh = -10
            delta = min((hh-now_hour)%24, (now_hour-hh)%24) if hh >= 0 else 99
            if delta <= 1:
                key = str(h["destination_label"] or "").strip()
                if key:
                    row = by_now.setdefault(key, {"count":0,"lat":h["destination_lat"],"lon":h["destination_lon"]}); row["count"] += 1
        if by_now:
            label, row = max(by_now.items(), key=lambda kv: kv[1]["count"])
            if row["count"] >= 2 and label.lower() not in seen:
                seen.add(label.lower()); items.append({"kind":"smart","label":label,"lat":row["lat"],"lon":row["lon"],"uses":row["count"]})
    except Exception:
        pass
    rows = db.execute(
        """SELECT destination_label,destination_lat,destination_lon,MAX(created_at) last_used,COUNT(*) uses
           FROM route_history WHERE user_id=? AND destination_label<>''
           GROUP BY destination_label,destination_lat,destination_lon ORDER BY last_used DESC LIMIT 14""",
        (user["id"],),
    ).fetchall()
    for row in rows:
        label = str(row["destination_label"] or "").strip()
        if not label or label.lower() in seen:
            continue
        seen.add(label.lower())
        items.append({"kind":"recent","label":label,"lat":row["destination_lat"],"lon":row["destination_lon"],"uses":int(row["uses"] or 1)})
        if len(items) >= 12:
            break
    return jsonify({"items": items})


@app.route("/api/saved-places", methods=["GET", "POST"])
@login_required
def api_saved_places():
    db = get_db(); uid = session["user_id"]
    if request.method == "GET":
        rows = db.execute("SELECT id,name,label,latitude,longitude,updated_at FROM saved_places WHERE user_id=? ORDER BY updated_at DESC LIMIT 24", (uid,)).fetchall()
        return jsonify({"items":[{"id":r["id"],"name":r["name"],"label":r["label"],"lat":r["latitude"],"lon":r["longitude"],"updated_at":r["updated_at"]} for r in rows]})
    if not validate_csrf(): return jsonify({"ok":False,"error":"Sessão inválida."}), 400
    if not rate_limit("saved-place", 40, 3600): return jsonify({"ok":False,"error":"Muitas alterações em pouco tempo."}), 429
    data = request.get_json(silent=True) or {}
    label = str(data.get("label") or "").strip()[:220]; name = str(data.get("name") or "").strip()[:100]
    try: lat=float(data.get("lat")); lon=float(data.get("lon"))
    except Exception: return jsonify({"ok":False,"error":"Localização inválida."}),400
    if not label or not (-90<=lat<=90 and -180<=lon<=180): return jsonify({"ok":False,"error":"Localização inválida."}),400
    now=utcnow_iso()
    existing=db.execute("SELECT id FROM saved_places WHERE user_id=? AND label=?",(uid,label)).fetchone()
    if existing:
        db.execute("UPDATE saved_places SET name=?,latitude=?,longitude=?,updated_at=? WHERE id=?",(name or label.split(",",1)[0],lat,lon,now,existing["id"])); place_id=existing["id"]
    else:
        count=int(db.execute("SELECT COUNT(*) c FROM saved_places WHERE user_id=?",(uid,)).fetchone()["c"] or 0)
        if count>=24: return jsonify({"ok":False,"error":"Você pode manter até 24 favoritos."}),409
        cur=db.execute("INSERT INTO saved_places(user_id,name,label,latitude,longitude,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",(uid,name or label.split(",",1)[0],label,lat,lon,now,now)); place_id=cur.lastrowid
    db.commit(); audit("saved_place",{"id":place_id})
    return jsonify({"ok":True,"id":place_id,"name":name or label.split(",",1)[0],"label":label,"lat":lat,"lon":lon})


@app.route("/api/saved-places/<int:place_id>", methods=["DELETE"])
@login_required
def api_saved_place_delete(place_id):
    if not validate_csrf(): return jsonify({"ok":False,"error":"Sessão inválida."}),400
    db=get_db(); cur=db.execute("DELETE FROM saved_places WHERE id=? AND user_id=?",(place_id,session["user_id"])); db.commit()
    return jsonify({"ok":True,"deleted":bool(cur.rowcount)})


@app.route("/api/weekly-routine", methods=["GET", "PUT"])
@login_required
def api_weekly_routine():
    """Read or replace the signed-in user's seven-day destination routine.

    weekday uses Python's convention: Monday=0 ... Sunday=6. Empty days are
    intentionally removed so the payload remains compact and easy to sync.
    """
    db = get_db(); uid = session["user_id"]
    if request.method == "GET":
        rows = db.execute(
            "SELECT weekday,label,latitude,longitude,departure_time,enabled,updated_at "
            "FROM weekly_routines WHERE user_id=? ORDER BY weekday",
            (uid,),
        ).fetchall()
        return jsonify({
            "items": [
                {
                    "weekday": int(r["weekday"]),
                    "label": r["label"],
                    "lat": r["latitude"],
                    "lon": r["longitude"],
                    "time": r["departure_time"] or "",
                    "enabled": bool(r["enabled"]),
                    "updated_at": r["updated_at"],
                } for r in rows
            ]
        })

    if not validate_csrf():
        return jsonify({"ok": False, "error": "Sessão inválida."}), 400
    if not rate_limit("weekly-routine", 80, 3600):
        return jsonify({"ok": False, "error": "Muitas alterações em pouco tempo."}), 429

    data = request.get_json(silent=True) or {}
    raw_days = data.get("days")
    if not isinstance(raw_days, list) or len(raw_days) > 7:
        return jsonify({"ok": False, "error": "Rotina inválida."}), 400

    normalized = {}
    for raw in raw_days:
        if not isinstance(raw, dict):
            return jsonify({"ok": False, "error": "Rotina inválida."}), 400
        try:
            weekday = int(raw.get("weekday"))
        except Exception:
            return jsonify({"ok": False, "error": "Dia da semana inválido."}), 400
        if weekday < 0 or weekday > 6 or weekday in normalized:
            return jsonify({"ok": False, "error": "Dia da semana inválido ou repetido."}), 400

        label = str(raw.get("label") or "").strip()[:220]
        departure_time = str(raw.get("time") or "").strip()[:5]
        enabled = 1 if raw.get("enabled", True) else 0
        if departure_time:
            if len(departure_time) != 5 or departure_time[2] != ":":
                return jsonify({"ok": False, "error": "Horário inválido."}), 400
            try:
                hh, mm = (int(x) for x in departure_time.split(":", 1))
                if not (0 <= hh <= 23 and 0 <= mm <= 59): raise ValueError
            except Exception:
                return jsonify({"ok": False, "error": "Horário inválido."}), 400

        if not label:
            normalized[weekday] = None
            continue
        try:
            lat = float(raw.get("lat")); lon = float(raw.get("lon"))
        except Exception:
            return jsonify({"ok": False, "error": "Escolha um endereço válido em cada dia preenchido."}), 400
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            return jsonify({"ok": False, "error": "Localização inválida."}), 400
        normalized[weekday] = {"label": label, "lat": lat, "lon": lon, "time": departure_time, "enabled": enabled}

    now = utcnow_iso()
    for weekday in range(7):
        item = normalized.get(weekday)
        if not item:
            db.execute("DELETE FROM weekly_routines WHERE user_id=? AND weekday=?", (uid, weekday))
            continue
        existing = db.execute("SELECT id FROM weekly_routines WHERE user_id=? AND weekday=?", (uid, weekday)).fetchone()
        if existing:
            db.execute(
                "UPDATE weekly_routines SET label=?,latitude=?,longitude=?,departure_time=?,enabled=?,updated_at=? WHERE id=?",
                (item["label"], item["lat"], item["lon"], item["time"], item["enabled"], now, existing["id"]),
            )
        else:
            db.execute(
                "INSERT INTO weekly_routines(user_id,weekday,label,latitude,longitude,departure_time,enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
                (uid, weekday, item["label"], item["lat"], item["lon"], item["time"], item["enabled"], now, now),
            )
    db.commit()
    audit("weekly_routine_saved", {"configured_days": sum(1 for x in normalized.values() if x)}, uid)
    return jsonify({"ok": True, "configured_days": sum(1 for x in normalized.values() if x)})


