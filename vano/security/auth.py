"""VANO authentication, sessions, CSRF and OAuth.

Extracted from the historical monolithic app.py without changing route bodies or
business rules. Runtime dependencies are injected once during application startup.
"""
from vano.bootstrap import inject as _vano_inject
_vano_inject(globals())
del _vano_inject

def _rate_bucket_key(key, identity=None, include_ip=True):
    """Return a privacy-preserving bucket id for throttling."""
    parts = [str(key or "generic")[:80]]
    if include_ip:
        parts.append(f"ip:{client_ip()}")
    if identity is not None:
        raw = str(identity)[:240]
        digest = hashlib.sha256(raw.encode("utf-8", "ignore")).hexdigest()[:32]
        parts.append(f"id:{digest}")
    return hashlib.sha256("|".join(parts).encode("utf-8", "ignore")).hexdigest()


def _shared_rate_limit(bucket_key, limit, window):
    """An atomic sliding window shared by all workers and service instances."""
    now = time.time()
    db = None
    try:
        db = get_db()
        lock_id = int(bucket_key[:16], 16) % (2**63)
        db.execute("SELECT pg_advisory_xact_lock(?)", (lock_id,))
        db.execute("DELETE FROM security_rate_events WHERE bucket_key=? AND expires_at<=?", (bucket_key, now))
        count = db.execute("SELECT COUNT(*) c FROM security_rate_events WHERE bucket_key=? AND created_at>?", (bucket_key, now-window)).fetchone()["c"]
        allowed = int(count) < limit
        if allowed:
            db.execute("INSERT INTO security_rate_events(bucket_key,created_at,expires_at) VALUES(?,?,?)", (bucket_key, now, now+window))
        # Expired buckets are bounded and cleaned without retaining raw IPs.
        db.execute("DELETE FROM security_rate_events WHERE ctid IN (SELECT ctid FROM security_rate_events WHERE expires_at<=? LIMIT 1000 FOR UPDATE SKIP LOCKED)", (now,))
        db.commit()
        return allowed
    except Exception:
        if db is not None:
            db.rollback()
        app.logger.exception("Shared security rate limiter unavailable")
        return False


def rate_limit(key, limit=20, window=60, *, identity=None, include_ip=True, shared=False):
    """Sliding-window throttle with optional account/user identity binding."""
    limit = max(1, int(limit))
    window = max(1, int(window))
    now = time.time()
    bucket_key = _rate_bucket_key(key, identity=identity, include_ip=include_ip)
    local_allowed = True
    with RATE_LOCK:
        values = RATE_BUCKETS.setdefault(bucket_key, [])
        values[:] = [x for x in values if now - x < window]
        if len(values) >= limit:
            local_allowed = False
        else:
            values.append(now)
        if len(RATE_BUCKETS) > 6000:
            stale = [
                name for name, events in RATE_BUCKETS.items()
                if not events or now - max(events) > 86400
            ][:2500]
            for name in stale:
                RATE_BUCKETS.pop(name, None)
    if not local_allowed:
        return False
    if shared and not _shared_rate_limit(bucket_key, limit, window):
        return False
    return True


def _remember_token_hash(raw_token):
    return hashlib.sha256((raw_token or "").encode("utf-8")).hexdigest()


def _remember_cookie_tokens():
    """Return every remembered-login token visible in the current context.

    A normal top-level cookie and a partitioned embedded cookie can diverge
    after browser/privacy changes.  Logout must revoke *both* values or an old
    partitioned token may silently sign the user back in on the next request.
    """
    values = []
    for name in (REMEMBER_COOKIE_NAME, REMEMBER_EMBED_COOKIE_NAME):
        raw = (request.cookies.get(name) or "").strip()
        if raw and raw not in values:
            values.append(raw)
    return values


def _remember_cookie_token():
    # Restore uses the first usable token, while logout revokes every token.
    values = _remember_cookie_tokens()
    return values[0] if values else ""


def issue_persistent_login(user_id):
    """Create a revocable, server-side remembered-login token.

    Only a SHA-256 hash is stored in PostgreSQL. The random token itself exists
    solely in the browser cookie. A fresh token is issued on every successful
    login/register/OAuth completion and can be revoked explicitly on logout.
    """
    raw = secrets.token_urlsafe(48)
    now = datetime.now(timezone.utc).replace(microsecond=0)
    expires = now + timedelta(days=REMEMBER_LOGIN_DAYS)
    db = get_db()
    # Keep the most recent device sessions, but prune expired/revoked records.
    db.execute("DELETE FROM auth_sessions WHERE expires_at <= ? OR (revoked_at IS NOT NULL AND revoked_at <= ?)", (now.isoformat(), (now - timedelta(days=7)).isoformat()))
    db.execute(
        "INSERT INTO auth_sessions(token_hash,user_id,created_at,last_used_at,expires_at,revoked_at) VALUES(?,?,?,?,?,NULL)",
        (_remember_token_hash(raw), int(user_id), now.isoformat(), now.isoformat(), expires.isoformat()),
    )
    # Avoid an unbounded number of remembered devices/tokens for one account.
    stale = db.execute(
        "SELECT id FROM auth_sessions WHERE user_id=? AND revoked_at IS NULL ORDER BY last_used_at DESC LIMIT -1 OFFSET 12",
        (int(user_id),),
    ).fetchall()
    if stale:
        db.executemany("UPDATE auth_sessions SET revoked_at=? WHERE id=?", [(now.isoformat(), row["id"]) for row in stale])
    db.commit()
    g.vano_remember_set = raw
    session["auth_session_hash"] = _remember_token_hash(raw)
    g.vano_remember_expires = expires
    return raw


def revoke_current_persistent_login():
    # Revoke every visible remembered-login cookie. This fixes a logout edge
    # case where the top-level and partitioned cookies held different tokens.
    hashes = {_remember_token_hash(raw) for raw in _remember_cookie_tokens()}
    if session.get("auth_session_hash"):
        hashes.add(session["auth_session_hash"])
    if hashes:
        db = None
        try:
            db = get_db()
            now = utcnow_iso()
            db.executemany(
                "UPDATE auth_sessions SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL",
                [(now, token_hash) for token_hash in hashes],
            )
            db.commit()
        except Exception:
            if db is not None:
                db.rollback()
            app.logger.exception("Could not revoke remembered login during logout")
            abort(503)
    g.vano_remember_clear = True


@app.before_request
def restore_persistent_login():
    """Restore an authenticated Flask session after a browser restart.

    This runs only when the signed Flask session cookie is absent. It does not
    bypass account state: inactive users and revoked/expired tokens are ignored.
    """
    if request.endpoint in {"static", "healthz"}:
        return
    if session.get("user_id"):
        bound = session.get("auth_session_hash")
        valid = get_db().execute(
            """SELECT a.id FROM auth_sessions a JOIN users u ON u.id=a.user_id
               WHERE a.token_hash=? AND a.user_id=? AND a.revoked_at IS NULL
               AND a.expires_at>? AND u.is_active=1""",
            (bound or "", session["user_id"], utcnow_iso()),
        ).fetchone()
        if valid:
            g.vano_auth_session_valid = True
            return
        # Legacy signed cookies alone are never credentials. A valid remember
        # token can migrate an existing device into the revocable session model.
        session.clear()
    raw = _remember_cookie_token()
    if not raw:
        return
    now = datetime.now(timezone.utc).replace(microsecond=0)
    row = get_db().execute(
        """
        SELECT a.id,a.user_id,a.last_used_at,a.expires_at,u.is_active
        FROM auth_sessions a JOIN users u ON u.id=a.user_id
        WHERE a.token_hash=? AND a.revoked_at IS NULL AND a.expires_at>?
        LIMIT 1
        """,
        (_remember_token_hash(raw), now.isoformat()),
    ).fetchone()
    if not row or not row["is_active"]:
        g.vano_remember_clear = True
        return
    session["user_id"] = int(row["user_id"])
    session["auth_session_hash"] = _remember_token_hash(raw)
    g.vano_auth_session_valid = True
    session["csrf_token"] = secrets.token_urlsafe(32)
    session.permanent = True
    # Sliding lifetime: active devices remain signed in. Rotation every 30 days
    # reduces the useful lifetime of a copied browser token.
    try:
        last_used = datetime.fromisoformat(row["last_used_at"])
        if last_used.tzinfo is None:
            last_used = last_used.replace(tzinfo=timezone.utc)
    except Exception:
        last_used = now - timedelta(days=31)
    if now - last_used >= timedelta(days=30):
        get_db().execute("UPDATE auth_sessions SET revoked_at=? WHERE id=?", (now.isoformat(), row["id"]))
        get_db().commit()
        issue_persistent_login(row["user_id"])
    else:
        get_db().execute("UPDATE auth_sessions SET last_used_at=? WHERE id=?", (now.isoformat(), row["id"]))
        get_db().commit()


@app.before_request
def record_authenticated_ip():
    uid = session.get("user_id")
    fast_mobile_paths = {
        "/api/mobile/bootstrap", "/api/mobile/navigation/config",
        "/api/mobile/navigation/batch", "/mobile/health",
    }
    if not uid or request.endpoint in {"static", "healthz"} or request.path in fast_mobile_paths:
        return
    record_user_access(uid)


@app.after_request
def persistent_login_cookie(response):
    max_age = REMEMBER_LOGIN_DAYS * 24 * 60 * 60
    if getattr(g, "vano_remember_clear", False):
        response.delete_cookie(REMEMBER_COOKIE_NAME, path="/", secure=True, httponly=True, samesite="Lax")
        response.delete_cookie(REMEMBER_EMBED_COOKIE_NAME, path="/", secure=True, httponly=True, samesite="None", partitioned=True)
        return response
    raw = getattr(g, "vano_remember_set", None)
    if raw:
        response.set_cookie(
            REMEMBER_COOKIE_NAME, raw, max_age=max_age, secure=True, httponly=True,
            samesite="Lax", path="/",
        )
        response.set_cookie(
            REMEMBER_EMBED_COOKIE_NAME, raw, max_age=max_age, secure=True, httponly=True,
            samesite="None", partitioned=True, path="/",
        )
    return response


def csrf_token():
    if "csrf_token" not in session:
        session["csrf_token"] = secrets.token_urlsafe(32)
    return session["csrf_token"]


def validate_csrf():
    sent = request.form.get("csrf_token") or request.headers.get("X-CSRF-Token")
    expected = session.get("csrf_token")
    return bool(sent and expected and secrets.compare_digest(sent, expected))


@app.context_processor
def inject_globals():
    endpoint = request.endpoint if has_request_context() else None
    path = request.path if has_request_context() else "/"
    # Query strings, Render hostnames and temporary preview URLs should never
    # become canonical. Every HTML page points to the stable production origin.
    canonical_path = SEO_CANONICAL_PATHS.get(endpoint, path if path.startswith("/") else f"/{path}")
    public_origin = PUBLIC_SITE_URL or (request.host_url.rstrip("/") if has_request_context() else "")
    canonical_url = f"{public_origin}{canonical_path}"
    return {
        "APP_NAME": APP_NAME,
        "vano_build_id": VANO_BUILD_ID,
        "csrf_token": csrf_token,
        "current_year": datetime.now().year,
        "google_ready": google_ready(),
        "safety_level_from_score": safety_level_from_score if "safety_level_from_score" in globals() else None,
        "seo_indexable": endpoint in SEO_INDEXABLE_ENDPOINTS,
        "seo_canonical_url": canonical_url,
        "public_site_url": public_origin,
        "active_locale": active_ui_locale(),
        "locale_source": getattr(g, "vano_locale_source", "accept_language") if has_request_context() else "default",
        "detected_country": getattr(g, "vano_country", "") if has_request_context() else "",
    }


def current_user():
    """Return the authenticated user with one database read per request."""
    uid = session.get("user_id")
    if not uid:
        return None
    try:
        uid = int(uid)
    except (TypeError, ValueError):
        return None

    if not getattr(g, "vano_auth_session_valid", False):
        valid = get_db().execute(
            """SELECT id FROM auth_sessions WHERE token_hash=? AND user_id=?
               AND revoked_at IS NULL AND expires_at>?""",
            (session.get("auth_session_hash") or "", uid, utcnow_iso()),
        ).fetchone()
        if not valid:
            session.clear()
            return None
        g.vano_auth_session_valid = True

    if getattr(g, "vano_current_user_loaded", False) and getattr(g, "vano_current_user_uid", None) == uid:
        return getattr(g, "vano_current_user_value", None)

    db = get_db()
    row = db.execute(
        "SELECT id,name,email,role,locale,is_active,created_at,last_login_at,google_sub,avatar_url,auth_provider,age,sex,is_app_driver,night_safety_mode,route_preference,onboarding_completed_at,distance_unit,vehicle_make,vehicle_model,vehicle_plate,vehicle_year,preferred_fuel_networks,home_label,work_label,presence_visible,presence_terms_accepted_at,emergency_name,emergency_phone,map_style,map_accent,avoid_ferries,avoid_tolls,avoid_unpaved FROM users WHERE id = ?",
        (uid,),
    ).fetchone()
    g.vano_current_user_loaded = True
    g.vano_current_user_uid = uid
    g.vano_current_user_value = row if row and row["is_active"] else None
    return g.vano_current_user_value


def invalidate_current_user_cache():
    """Drop the request-local account cache after an in-request mutation."""
    g.pop("vano_current_user_loaded", None)
    g.pop("vano_current_user_uid", None)
    g.pop("vano_current_user_value", None)

def onboarding_needed(user):
    if not user or user["role"] == "admin":
        return False
    return not (
        user["onboarding_completed_at"]
        and str(user["name"] or "").strip()
        and user["age"] is not None
        and str(user["sex"] or "").strip()
        and _normalize_ui_locale(user["locale"]) in SUPPORTED_UI_LOCALES
    )


@app.before_request
def enforce_profile_onboarding():
    """Keep every account-creation method on the same profile-completion flow."""
    if not session.get("user_id"):
        return
    endpoint = request.endpoint or ""
    allowed = {
        "onboarding", "logout", "google_login", "google_callback", "login", "register",
        "healthz", "static", "frame_test", "embed",
        "mobile_bootstrap", "mobile_navigation_config", "mobile_navigation_batch", "mobile_health",
        "privacy_policy", "terms_of_use", "help_page", "about", "sobre",
        "account_delete_page", "account_delete", "privacy_request_create",
        "forgot_password", "reset_password", "google_link", "shared_route_view",
    }
    if endpoint in allowed or endpoint.startswith("static"):
        return
    user = current_user()
    if not onboarding_needed(user):
        return
    if request.path.startswith("/api/"):
        return jsonify({
            "error": "Complete seu perfil antes de continuar.",
            "code": "profile_incomplete",
            "onboarding_url": url_for("onboarding"),
        }), 428
    return redirect(url_for("onboarding", next=request.full_path if request.query_string else request.path))


@app.context_processor
def inject_user():
    return {"current_user": current_user()}


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = current_user()
        if not user or not user["is_active"]:
            session.clear()
            if request.path.startswith(("/api/", "/mobile/")):
                return jsonify({"ok": False, "error": "unauthorized", "code": "session_expired", "login_url": url_for("login")}), 401
            flash("Entre na sua conta para continuar.", "warning")
            return redirect(url_for("login", next=request.path))
        return view(*args, **kwargs)
    return wrapped


def recently_authenticated(max_age=300):
    try:
        age = time.time() - float(session.get("reauthenticated_at", 0))
        return 0 <= age <= max_age
    except (TypeError, ValueError):
        return False


def admin_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = current_user()
        if not user or user["role"] != "admin" or not is_admin_email(user["email"]):
            abort(403)
        return view(*args, **kwargs)
    return wrapped


def safe_next_url(value):
    """Allow only local absolute paths for post-authentication redirects."""
    value = str(value or "")[:1000]
    if not value or not value.startswith("/") or value.startswith("//"):
        return None
    if "\\" in value or "\r" in value or "\n" in value:
        return None
    parsed = urlparse(value)
    if parsed.scheme or parsed.netloc:
        return None
    return value


def audit(action, metadata=None, user_id=None):
    try:
        db = get_db()
        safe_meta = _safe_activity_metadata(metadata or {})
        safe_meta.update({"ip": client_ip(), "path": redact_path(request.path)[:300], "method": request.method[:12]})
        db.execute(
            "INSERT INTO audit_logs(user_id,action,metadata,created_at) VALUES(?,?,?,?)",
            (user_id or session.get("user_id"), action, json.dumps(safe_meta, ensure_ascii=False), utcnow_iso()),
        )
        db.commit()
    except Exception:
        pass

# -----------------------------
# Google OpenID Connect
# -----------------------------

def google_ready():
    return bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)

def google_redirect_uri():
    if GOOGLE_REDIRECT_URI:
        return GOOGLE_REDIRECT_URI
    return url_for("google_callback", _external=True)

def google_user_from_token(access_token):
    response = requests.get(
        GOOGLE_USERINFO_URL,
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=12,
    )
    response.raise_for_status()
    return response.json()


def oauth_cookie_value(state):
    signature = hmac.new(
        SECRET_KEY.encode("utf-8", "ignore"),
        state.encode("utf-8", "ignore"),
        hashlib.sha256,
    ).hexdigest()
    return f"{state}.{signature}"


def oauth_cookie_matches(returned_state):
    raw = request.cookies.get("vano_oauth_state", "")
    if not raw or "." not in raw or not returned_state:
        return False
    cookie_state, signature = raw.rsplit(".", 1)
    if not secrets.compare_digest(cookie_state, returned_state):
        return False
    expected = oauth_cookie_value(cookie_state).rsplit(".", 1)[1]
    return secrets.compare_digest(signature, expected)


def persist_google_oauth_state(state, redirect_uri, next_url=None):
    """Persist one-time OAuth state independently of the Flask session.

    The app can be embedded with Partitioned cookies. A server-side record plus
    a short-lived signed OAuth cookie keeps the callback reliable on Android
    while still binding fallback validation to the initiating client.
    """
    now = datetime.now(timezone.utc)
    created = now.replace(microsecond=0).isoformat()
    expires = (now + timedelta(minutes=12)).replace(microsecond=0).isoformat()
    db = get_db()
    db.execute("DELETE FROM oauth_states WHERE expires_at < ?", (created,))
    db.execute(
        """INSERT INTO oauth_states(state,redirect_uri,next_url,fingerprint,created_at,expires_at)
           VALUES(?,?,?,?,?,?)
           ON CONFLICT(state) DO UPDATE SET
             redirect_uri=EXCLUDED.redirect_uri,
             next_url=EXCLUDED.next_url,
             fingerprint=EXCLUDED.fingerprint,
             created_at=EXCLUDED.created_at,
             expires_at=EXCLUDED.expires_at""",
        (state, redirect_uri, safe_next_url(next_url), "", created, expires),
    )
    db.commit()


def consume_google_oauth_state(returned_state):
    """Atomically consume a valid OAuth state and return stored context."""
    if not returned_state:
        return None
    db = get_db()
    now = utcnow_iso()
    row = db.execute(
        """DELETE FROM oauth_states WHERE state=? AND expires_at>=?
           RETURNING state,redirect_uri,next_url,expires_at""",
        (returned_state, now),
    ).fetchone()
    if not row:
        db.execute("DELETE FROM oauth_states WHERE state=? AND expires_at < ?", (returned_state, now))
    db.commit()
    return row


def claim_password_reset(db, token_id, now):
    """Claim a single-use reset inside the caller's password-change transaction.

    UPDATE locks/rechecks the token, so only one concurrent request can claim
    it. The caller commits the claim together with the new hash and revocations.
    """
    return db.execute(
        """UPDATE password_reset_tokens SET used_at=?
           WHERE id=? AND used_at IS NULL AND expires_at>?
           RETURNING user_id""",
        (now, token_id, now),
    ).fetchone()

# -----------------------------
# Validation / route scoring
# -----------------------------

CATEGORY_META = {
    "robbery": {"label": "Roubo/furto", "weight": 1.35, "quiet": 0.15, "icon": "shield-alert"},
    "harassment": {"label": "Assédio/importunação", "weight": 1.30, "quiet": 0.10, "icon": "user-alert"},
    "poor_lighting": {"label": "Iluminação ruim", "weight": 1.05, "quiet": 0.05, "icon": "moon"},
    "accident": {"label": "Acidente/risco viário", "weight": 1.15, "quiet": 0.20, "icon": "triangle-alert"},
    "traffic": {"label": "Trânsito parado", "weight": 0.72, "quiet": 0.45, "icon": "traffic-cone"},
    "road_block": {"label": "Via bloqueada", "weight": 1.05, "quiet": 0.20, "icon": "ban"},
    "blitz": {"label": "Blitz/Fiscalização", "weight": 0.38, "quiet": 0.80, "icon": "badge-alert"},
    "speed_camera": {"label": "Radar/fiscalização eletrônica", "weight": 0.24, "quiet": 0.90, "icon": "camera"},
    "road_hazard": {"label": "Perigo na via", "weight": 0.95, "quiet": 0.25, "icon": "diamond-alert"},
    "pothole": {"label": "Buraco grande", "weight": 0.90, "quiet": 0.25, "icon": "circle-dot-dashed"},
    "stopped_vehicle": {"label": "Veículo parado", "weight": 0.92, "quiet": 0.25, "icon": "car-front"},
    "object_on_road": {"label": "Objeto na pista", "weight": 1.00, "quiet": 0.20, "icon": "package-open"},
    "broken_signal": {"label": "Semáforo com problema", "weight": 0.86, "quiet": 0.25, "icon": "traffic-cone"},
    "flood": {"label": "Alagamento", "weight": 1.25, "quiet": 0.10, "icon": "waves"},
    "construction": {"label": "Obra/bloqueio", "weight": 0.90, "quiet": 0.30, "icon": "construction"},
    "crowd": {"label": "Aglomeração/evento", "weight": 0.45, "quiet": 1.40, "icon": "users"},
    "other": {"label": "Outro alerta", "weight": 0.75, "quiet": 0.30, "icon": "info"},
}

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


