"""VANO authentication and onboarding routes.

Extracted from the historical monolithic app.py without changing route bodies or
business rules. Runtime dependencies are injected once during application startup.
"""
from vano.bootstrap import inject as _vano_inject
_vano_inject(globals())
del _vano_inject

# Equalize the expensive password-verification path for unknown accounts so a
# failed login does not trivially reveal whether an e-mail exists by timing.
LOGIN_DUMMY_HASH = hash_password(secrets.token_urlsafe(24))

@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        if not validate_csrf():
            abort(400)
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        account_bucket = hashlib.sha256(email.encode("utf-8", "ignore")).hexdigest()[:32]
        if not rate_limit("login-ip", 10, 60, shared=True) or not rate_limit(
            "login-account", 12, 900, identity=account_bucket, include_ip=False, shared=True
        ):
            flash("Muitas tentativas. Tente novamente em instantes.", "danger")
            return render_template("login.html"), 429

        db = get_db()
        user = db.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
        candidate_hash = user["password_hash"] if user else LOGIN_DUMMY_HASH
        password_ok = verify_password(candidate_hash, password)
        if not user or not user["is_active"] or not password_ok:
            flash("E-mail ou senha inválidos.", "danger")
            audit("login_failed", {"email_hash": account_bucket[:16]}, None)
            return render_template("login.html"), 401

        # Upgrade legacy PBKDF2 hashes only after a valid login; no schema
        # migration or password reset is required for existing accounts.
        if password_needs_rehash(user["password_hash"]):
            db.execute("UPDATE users SET password_hash=? WHERE id=?", (hash_password(password), user["id"]))

        session.clear()
        session["user_id"] = user["id"]
        session["csrf_token"] = secrets.token_urlsafe(32)
        session.permanent = True
        issue_persistent_login(user["id"])
        record_user_access(user["id"], force=True)
        db.execute("UPDATE users SET last_login_at=? WHERE id=?", (utcnow_iso(), user["id"]))
        db.commit()
        audit("login_success", {}, user["id"])
        flash(f"Bem-vindo, {user['name'].split()[0]}!", "success")
        refreshed = current_user()
        if onboarding_needed(refreshed):
            return redirect(url_for("onboarding", next=safe_next_url(request.args.get("next")) or url_for("map_page")))
        return redirect(safe_next_url(request.args.get("next")) or url_for("map_page"))

    return render_template("login.html")


@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        if not validate_csrf():
            abort(400)
        if not rate_limit("register-ip", 6, 300, shared=True):
            flash("Muitas tentativas de cadastro. Tente novamente depois.", "danger")
            return render_template("register.html"), 429

        name = request.form.get("name", "").strip()
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        register_bucket = hashlib.sha256(email.encode("utf-8", "ignore")).hexdigest()[:32]
        if not rate_limit("register-account", 4, 3600, identity=register_bucket, include_ip=False, shared=True):
            flash("Muitas tentativas de cadastro para esse e-mail. Tente novamente depois.", "danger")
            return render_template("register.html"), 429
        locale = _normalize_ui_locale(request.form.get("locale") or active_ui_locale()) or active_ui_locale()

        errors = []
        if not EMAIL_RE.match(email) or len(email) > 180:
            errors.append("Informe um e-mail válido.")
        valid_password, password_error = validate_password_strength(password)
        if not valid_password:
            errors.append(password_error)

        if errors:
            for err in errors:
                flash(err, "danger")
            return render_template("register.html"), 400

        db = get_db()
        try:
            cur = db.execute(
                "INSERT INTO users(name,email,password_hash,role,locale,created_at) VALUES(?,?,?,?,?,?)",
                (name, email, hash_password(password), "user", locale, utcnow_iso()),
            )
            db.commit()
        except IntegrityError:
            db.rollback()
            flash("Já existe uma conta com este e-mail.", "danger")
            return render_template("register.html"), 409

        session.clear()
        session["user_id"] = cur.lastrowid
        session["csrf_token"] = secrets.token_urlsafe(32)
        session.permanent = True
        issue_persistent_login(cur.lastrowid)
        record_user_access(cur.lastrowid, force=True)
        audit("register", {}, cur.lastrowid)
        flash("Conta criada. Agora complete seu perfil.", "success")
        return redirect(url_for("onboarding", next=safe_next_url(request.args.get("next")) or url_for("map_page")))

    return render_template("register.html")


@app.route("/auth/google")
@app.route("/login/google")
def google_login():
    if not google_ready():
        flash("O login com Google ainda não foi configurado neste servidor.", "warning")
        return redirect(url_for("login"))

    # Mantém o mesmo host do redirect URI antes de criar o state da sessão.
    # Isso evita falhas locais quando o app é aberto em 127.0.0.1 mas o
    # callback autorizado no Google usa localhost (ou vice-versa).
    if GOOGLE_REDIRECT_URI:
        configured = urlparse(GOOGLE_REDIRECT_URI)
        if configured.scheme in {"http", "https"} and configured.netloc:
            current_host = request.host.lower()
            target_host = configured.netloc.lower()
            if current_host != target_host:
                target = f"{configured.scheme}://{configured.netloc}/login/google"
                next_url = safe_next_url(request.args.get("next"))
                if next_url:
                    target += "?" + urlencode({"next": next_url})
                return redirect(target)

    state = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(24)
    session["google_oauth_state"] = state
    session["google_oauth_nonce"] = nonce
    next_url = safe_next_url(request.args.get("next"))
    if next_url:
        session["google_oauth_next"] = next_url

    redirect_uri = google_redirect_uri()
    session["google_oauth_redirect_uri"] = redirect_uri
    # Keep a server-side copy too. This makes Google login reliable even if a
    # partitioned iframe cookie is unavailable after returning from Google.
    persist_google_oauth_state(state, redirect_uri, next_url)
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "nonce": nonce,
        "prompt": "select_account",
    }
    response = redirect(f"{GOOGLE_AUTH_URL}?{urlencode(params)}")
    # Dedicated OAuth cookie: unlike the normal embedded session cookie this
    # uses SameSite=Lax so top-level navigation back from Google can carry it.
    response.set_cookie(
        "vano_oauth_state",
        oauth_cookie_value(state),
        max_age=12 * 60,
        secure=True,
        httponly=True,
        samesite="Lax",
        path="/",
    )
    return response


@app.route("/auth/google/callback")
@app.route("/login/google/callback")
def google_callback():
    if not google_ready():
        abort(404)

    if request.args.get("error"):
        flash("O login com Google foi cancelado ou não pôde ser concluído.", "warning")
        return redirect(url_for("login"))

    returned_state = request.args.get("state", "")
    expected_state = session.pop("google_oauth_state", "")
    session.pop("google_oauth_nonce", None)

    # First validate the normal same-session flow. Independently consume the
    # persisted one-time state so iframe/mobile OAuth also works when the
    # browser did not return the original partitioned session cookie.
    stored_state = consume_google_oauth_state(returned_state)
    session_state_ok = bool(
        returned_state
        and expected_state
        and secrets.compare_digest(returned_state, expected_state)
    )
    cookie_state_ok = oauth_cookie_matches(returned_state)
    fingerprint_ok = bool(
        stored_state
        and stored_state["fingerprint"]
        and secrets.compare_digest(stored_state["fingerprint"], oauth_client_fingerprint())
    )
    if not stored_state or not (session_state_ok or cookie_state_ok or fingerprint_ok):
        audit(
            "google_login_state_mismatch",
            {
                "session_state_present": bool(expected_state),
                "signed_cookie_ok": cookie_state_ok,
                "fingerprint_ok": fingerprint_ok,
            },
        )
        flash("A sessão do login Google expirou. Tente entrar novamente.", "warning")
        return redirect(url_for("login"))

    code = request.args.get("code", "")
    session_redirect_uri = session.pop("google_oauth_redirect_uri", None)
    session_next_url = session.pop("google_oauth_next", None)
    redirect_uri = stored_state["redirect_uri"] or session_redirect_uri or google_redirect_uri()
    next_url = stored_state["next_url"] or session_next_url
    if not code:
        flash("O Google não retornou um código de autenticação válido.", "danger")
        return redirect(url_for("login"))

    try:
        token_response = requests.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
            timeout=12,
        )
        token_response.raise_for_status()
        token_data = token_response.json()
        access_token = token_data.get("access_token")
        if not access_token:
            raise RuntimeError("Token de acesso ausente")
        info = google_user_from_token(access_token)
    except Exception as exc:
        provider_status = getattr(getattr(exc, "response", None), "status_code", None)
        provider_error = ""
        try:
            if getattr(exc, "response", None) is not None:
                body = exc.response.json()
                provider_error = str(body.get("error") or "")[:80]
        except Exception:
            pass
        audit(
            "google_login_provider_error",
            {"type": type(exc).__name__, "status": provider_status, "provider_error": provider_error},
        )
        flash("Não foi possível concluir o login com Google agora. Tente novamente.", "danger")
        return redirect(url_for("login"))

    sub = str(info.get("sub") or "").strip()
    email = str(info.get("email") or "").strip().lower()
    email_verified = info.get("email_verified") is True or str(info.get("email_verified")).lower() == "true"
    name = str(info.get("name") or info.get("given_name") or email.split("@")[0]).strip()[:80]
    avatar = str(info.get("picture") or "").strip()[:500]
    if not sub or not EMAIL_RE.match(email) or not email_verified:
        audit("google_login_invalid_identity")
        flash("A conta Google precisa disponibilizar um e-mail verificado.", "danger")
        return redirect(url_for("login"))

    db = get_db()
    user = db.execute("SELECT * FROM users WHERE google_sub=?", (sub,)).fetchone()
    if not user:
        user = db.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()

    if user and not user["is_active"]:
        flash("Esta conta está desativada.", "danger")
        return redirect(url_for("login"))

    created_new = False
    try:
        if user:
            existing_sub = user["google_sub"]
            if existing_sub and existing_sub != sub:
                raise RuntimeError("Conta Google divergente")
            provider = "google" if user["auth_provider"] == "google" else "hybrid"
            role = role_for_email(email)
            db.execute(
                "UPDATE users SET google_sub=?, avatar_url=?, auth_provider=?, last_login_at=?, role=? WHERE id=?",
                (sub, avatar, provider, utcnow_iso(), role, user["id"]),
            )
            user_id = user["id"]
        else:
            cur = db.execute(
                "INSERT INTO users(name,email,password_hash,role,locale,created_at,last_login_at,google_sub,avatar_url,auth_provider) VALUES(?,?,?,?,?,?,?,?,?,?)",
                (name, email, f"google_only${secrets.token_hex(32)}", role_for_email(email), preferred_language(), utcnow_iso(), utcnow_iso(), sub, avatar, "google"),
            )
            user_id = cur.lastrowid
            created_new = True
        db.commit()
    except Exception:
        db.rollback()
        audit("google_login_link_error")
        flash("Não foi possível vincular sua conta Google ao Vano Maps.", "danger")
        return redirect(url_for("login"))

    session.clear()
    session["user_id"] = user_id
    session["csrf_token"] = secrets.token_urlsafe(32)
    session.permanent = True
    issue_persistent_login(user_id)
    record_user_access(user_id, force=True)
    audit("google_login_success", {}, user_id)
    flash(f"Bem-vindo, {name.split()[0]}!", "success")
    refreshed = current_user()
    if created_new or onboarding_needed(refreshed):
        return redirect(url_for("onboarding", next=safe_next_url(next_url) or url_for("index")))
    return redirect(safe_next_url(next_url) or url_for("index"))


@app.route("/onboarding", methods=["GET", "POST"])
@login_required
def onboarding():
    user = current_user()
    if request.method == "POST":
        if not validate_csrf():
            abort(400)

        name = re.sub(r"\s+", " ", str(request.form.get("name", "")).strip())[:80]
        try:
            age = int(request.form.get("age", ""))
        except (TypeError, ValueError):
            age = 0
        sex = str(request.form.get("sex", "")).strip().lower()
        locale = _normalize_ui_locale(request.form.get("locale", ""))
        route_preference = str(request.form.get("route_preference", "balanced")).strip().lower()
        map_style = str(request.form.get("map_style", "auto")).strip().lower()
        night_safety_mode = 1 if request.form.get("night_safety_mode") == "1" else 0
        avoid_ferries = 1 if request.form.get("avoid_ferries") == "1" else 0
        avoid_tolls = 1 if request.form.get("avoid_tolls") == "1" else 0
        avoid_unpaved = 1 if request.form.get("avoid_unpaved") == "1" else 0

        allowed_sex = {"female", "male", "intersex_other", "prefer_not_say"}
        allowed_route_preferences = {"balanced", "safety_first", "fast_first"}
        allowed_map_styles = {"auto", "day", "afternoon", "night", "rain"}
        errors = []
        if len(name) < 2 or len(name) > 80:
            errors.append("Informe um nome válido.")
        if age < 13 or age > 100:
            errors.append("Informe uma idade válida entre 13 e 100 anos.")
        if sex not in allowed_sex:
            errors.append("Selecione uma opção de sexo válida.")
        if locale not in SUPPORTED_UI_LOCALES:
            errors.append("Selecione um idioma válido.")
        if route_preference not in allowed_route_preferences:
            errors.append("Selecione uma preferência de rota válida.")
        if map_style not in allowed_map_styles:
            errors.append("Selecione um estilo de mapa válido.")

        if errors:
            for message in errors:
                flash(message, "danger")
            form_user = dict(user)
            form_user.update({
                "name": name, "age": age or "", "sex": sex, "locale": locale or active_ui_locale(),
                "route_preference": route_preference if route_preference in allowed_route_preferences else "balanced",
                "map_style": map_style if map_style in allowed_map_styles else "auto",
                "night_safety_mode": night_safety_mode, "avoid_ferries": avoid_ferries,
                "avoid_tolls": avoid_tolls, "avoid_unpaved": avoid_unpaved,
            })
            return render_template("onboarding.html", user=form_user), 400

        db = get_db()
        db.execute(
            """UPDATE users
               SET name=?, age=?, sex=?, locale=?,
                   route_preference=?, night_safety_mode=?, map_style=?,
                   avoid_ferries=?, avoid_tolls=?, avoid_unpaved=?,
                   is_app_driver=COALESCE(is_app_driver, 0),
                   onboarding_completed_at=?, presence_visible=?
               WHERE id=?""",
            (
                name, age, sex, locale, route_preference, night_safety_mode, map_style,
                avoid_ferries, avoid_tolls, avoid_unpaved, utcnow_iso(), 0, user["id"],
            ),
        )
        db.execute("DELETE FROM nearby_presence WHERE user_id=?", (user["id"],))
        db.commit()
        audit(
            "profile_onboarding_complete",
            {"locale": locale, "route_preference": route_preference, "map_style": map_style, "night_safety_mode": bool(night_safety_mode)},
            user["id"],
        )

        flash("Perfil configurado.", "success")
        response = redirect(safe_next_url(request.args.get("next")) or url_for("map_page"))
        cookie_kwargs = dict(max_age=365 * 24 * 60 * 60, secure=request.is_secure, httponly=False, samesite="Lax", path="/")
        response.set_cookie("vano_locale", locale, **cookie_kwargs)
        response.set_cookie("vano_locale_auto", locale, **cookie_kwargs)
        return response

    return render_template("onboarding.html", user=user)


@app.route("/logout", methods=["POST"])
def logout():
    if not validate_csrf():
        abort(400)
    uid = session.get("user_id")
    audit("logout", {}, uid)
    revoke_current_persistent_login()
    session.clear()
    # Return to the entry screen so logout has an unambiguous visual result.
    # Explicit cookie expiry complements Flask's session clearing and the
    # after_request remembered-cookie cleanup on restrictive mobile browsers.
    response = redirect(url_for("login", logged_out="1"))
    response.delete_cookie(REMEMBER_COOKIE_NAME, path="/", secure=True, httponly=True, samesite="Lax")
    response.delete_cookie(REMEMBER_EMBED_COOKIE_NAME, path="/", secure=True, httponly=True, samesite="None", partitioned=True)
    response.delete_cookie(app.config.get("SESSION_COOKIE_NAME", "session"), path="/")
    return response


