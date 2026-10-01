"""VANO authentication, sessions, CSRF and OAuth.

Extracted from the historical monolithic app.py without changing route bodies or
business rules. Runtime dependencies are injected once during application startup.
"""
from vano.bootstrap import inject as _vano_inject
_vano_inject(globals())
del _vano_inject

def rate_limit(key, limit=20, window=60):
    now = time.time()
    bucket_key = f"{key}:{client_ip()}"
    with RATE_LOCK:
        values = RATE_BUCKETS.setdefault(bucket_key, [])
        values[:] = [x for x in values if now - x < window]
        if len(values) >= limit:
            return False
        values.append(now)
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

    Only a SHA-256 hash is stored in SQLite. The random token itself exists
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
    g.rairo_remember_set = raw
    g.rairo_remember_expires = expires
    return raw


def revoke_current_persistent_login():
    # Revoke every visible remembered-login cookie. This fixes a logout edge
    # case where the top-level and partitioned cookies held different tokens.
    raws = _remember_cookie_tokens()
    if raws:
        try:
            db = get_db()
            now = utcnow_iso()
            db.executemany(
                "UPDATE auth_sessions SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL",
                [(now, _remember_token_hash(raw)) for raw in raws],
            )
            db.commit()
        except Exception:
            app.logger.exception("Could not revoke remembered login during logout")
    g.rairo_remember_clear = True


@app.before_request
def restore_persistent_login():
    """Restore an authenticated Flask session after a browser restart.

    This runs only when the signed Flask session cookie is absent. It does not
    bypass account state: inactive users and revoked/expired tokens are ignored.
    """
    if session.get("user_id"):
        return
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
        g.rairo_remember_clear = True
        return
    session["user_id"] = int(row["user_id"])
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
    if getattr(g, "rairo_remember_clear", False):
        response.delete_cookie(REMEMBER_COOKIE_NAME, path="/", secure=True, httponly=True, samesite="Lax")
        response.delete_cookie(REMEMBER_EMBED_COOKIE_NAME, path="/", secure=True, httponly=True, samesite="None", partitioned=True)
        return response
    raw = getattr(g, "rairo_remember_set", None)
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
        "locale_source": getattr(g, "rairo_locale_source", "accept_language") if has_request_context() else "default",
        "detected_country": getattr(g, "rairo_country", "") if has_request_context() else "",
    }


def current_user():
    uid = session.get("user_id")
    if not uid:
        return None
    db = get_db()
    row = db.execute(
        "SELECT id,name,email,role,locale,is_active,created_at,last_login_at,google_sub,avatar_url,auth_provider,age,sex,is_app_driver,night_safety_mode,route_preference,onboarding_completed_at,distance_unit,vehicle_make,vehicle_model,vehicle_plate,vehicle_year,preferred_fuel_networks,home_label,work_label,presence_visible,presence_terms_accepted_at,emergency_name,emergency_phone,map_style,map_accent,avoid_ferries,avoid_tolls,avoid_unpaved FROM users WHERE id = ?",
        (uid,),
    ).fetchone()
    # Role is authoritative in the database. Never elevate a password account
    # merely because its unverified local e-mail matches an admin allow-list.
    return row


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
            flash("Entre na sua conta para continuar.", "warning")
            return redirect(url_for("login", next=request.path))
        return view(*args, **kwargs)
    return wrapped


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
        safe_meta.update({"ip": client_ip(), "path": request.path[:300], "method": request.method[:12]})
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


def oauth_client_fingerprint():
    # Used only as a fallback when an embedded browser drops the OAuth cookie.
    # It deliberately avoids storing the raw IP/user-agent in the database.
    material = "|".join([
        client_ip(),
        request.headers.get("User-Agent", "")[:500],
        request.headers.get("Accept-Language", "")[:120],
    ])
    return hashlib.sha256(material.encode("utf-8", "ignore")).hexdigest()


def oauth_cookie_value(state):
    signature = hmac.new(
        SECRET_KEY.encode("utf-8", "ignore"),
        state.encode("utf-8", "ignore"),
        hashlib.sha256,
    ).hexdigest()
    return f"{state}.{signature}"


def oauth_cookie_matches(returned_state):
    raw = request.cookies.get("rairo_oauth_state", "")
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
        (state, redirect_uri, safe_next_url(next_url), oauth_client_fingerprint(), created, expires),
    )
    db.commit()


def consume_google_oauth_state(returned_state):
    """Atomically consume a valid OAuth state and return stored context."""
    if not returned_state:
        return None
    db = get_db()
    now = utcnow_iso()
    row = db.execute(
        "SELECT state,redirect_uri,next_url,fingerprint,expires_at FROM oauth_states WHERE state=? AND expires_at>=?",
        (returned_state, now),
    ).fetchone()
    if not row:
        db.execute("DELETE FROM oauth_states WHERE state=? OR expires_at < ?", (returned_state, now))
        db.commit()
        return None
    db.execute("DELETE FROM oauth_states WHERE state=?", (returned_state,))
    db.commit()
    return row

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


