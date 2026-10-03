from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_password_hashing_uses_argon2id_with_legacy_compatibility():
    requirements = read("requirements.txt")
    database = read("vano/infrastructure/database.py")
    auth_routes = read("vano/routes/auth.py")

    assert "argon2-cffi" in requirements
    assert "PasswordHasher" in database
    assert "memory_cost=19_456" in database
    assert "time_cost=2" in database
    assert "parallelism=1" in database
    assert 'stored.startswith("$argon2id$")' in database
    assert '"pbkdf2_sha256"' in database
    assert "def password_needs_rehash" in database
    assert "password_needs_rehash(user[" in auth_routes


def test_sensitive_rate_limits_bind_ip_and_identity():
    auth = read("vano/security/auth.py")
    login = read("vano/routes/auth.py")
    routing = read("vano/routes/routing.py")
    api = read("vano/routes/api.py")
    community = read("vano/routes/community.py")

    assert "def rate_limit(key, limit=20, window=60, *, identity=None, include_ip=True, shared=False)" in auth
    assert "fcntl.LOCK_EX" in auth
    assert "VANO_RATE_LIMIT_FILE" in auth
    assert '"login-account"' in login
    assert '"register-account"' in login
    assert 'shared=True' in routing
    assert '"quick-alert-user-burst"' in api
    assert '"quick-alert-user-hour"' in api
    assert '"sos-user"' in community


def test_report_votes_cannot_be_self_confirmed_or_self_removed():
    api = read("vano/routes/api.py")
    community = read("vano/routes/community.py")

    assert 'SELECT id,user_id,status FROM reports WHERE id=?' in api
    assert 'Você não pode confirmar seu próprio alerta.' in api
    assert 'SELECT id,user_id,status,confirmations FROM reports WHERE id=?' in api
    assert 'Você não pode avaliar seu próprio alerta.' in api
    assert 'Você não pode confirmar seu próprio alerta.' in community


def test_live_location_is_minimized_and_not_cacheable():
    api = read("vano/routes/api.py")
    map_js = read("static/vano-map.js")
    headers = read("vano/security/headers.py")

    assert "last_lat=NULL,last_lon=NULL,last_accuracy=NULL,last_speed=NULL,last_heading=NULL" in api
    assert '"X-Robots-Tag"] = "noindex, nofollow"' in api
    assert "ACTIVE_TRIP_MAX_AGE=6*60*60*1000" in map_js
    assert "age>2*60*60*1000" in map_js
    assert '"/api/live-trip/"' in headers
    assert '"/live/"' in headers
    assert '"no-store, no-cache, must-revalidate, max-age=0"' in headers


def test_browser_security_policy_is_defense_in_depth():
    headers = read("vano/security/headers.py")
    app = read("app.py")

    for directive in (
        "default-src 'self'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
        "worker-src 'self' blob:",
        "manifest-src 'self'",
    ):
        assert directive in headers
    assert "X-DNS-Prefetch-Control" in headers
    assert "Retry-After" in headers
    assert "geolocation=(self)" in app
    assert "camera=()" in app
    assert "microphone=()" in app


def test_remembered_session_window_is_bounded():
    route_cache = read("vano/services/route_cache.py")
    profile = read("templates/profile.html")
    deletion = read("vano/routes/public.py")

    assert 'VANO_REMEMBER_DAYS", "90"' in route_cache
    assert "min(365" in route_cache
    assert "Verificado pelo Google" in profile
    assert 'str(user["auth_provider"] or "password") != "google"' in deletion
