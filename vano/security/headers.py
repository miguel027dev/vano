"""VANO HTTP security headers.

Extracted from the historical monolithic app.py without changing route bodies or
business rules. Runtime dependencies are injected once during application startup.
"""
from time import perf_counter
from vano.bootstrap import inject as _vano_inject
_vano_inject(globals())
del _vano_inject

@app.before_request
def prepare_security_nonce():
    # One nonce per request lets templates keep small bootstrap scripts without
    # enabling arbitrary inline JavaScript globally.
    g.request_started_perf = perf_counter()
    g.csp_nonce = secrets.token_urlsafe(18)


@app.after_request
def security_headers(response):
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    # Distinguish application processing from network/render delays.
    if request.method == "GET" and response.mimetype == "text/html":
        elapsed_ms = max(0.0, (perf_counter() - getattr(g, "request_started_perf", perf_counter())) * 1000)
        response.headers["Server-Timing"] = f"app;dur={elapsed_ms:.1f}"
        if elapsed_ms > 700:
            app.logger.warning("[web-perf] slow HTML route=%s status=%s duration_ms=%.1f", request.path, response.status_code, elapsed_ms)

    # Normal pages cannot be framed. Only the explicit embed diagnostics/routes
    # use the configured integration allow-list.
    embed_surface = request.path in {"/embed", "/frame-test"}
    if embed_surface:
        response.headers.pop("X-Frame-Options", None)
    else:
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
    frame_ancestors = FRAME_ANCESTORS if embed_surface else "'self'"
    nonce = str(getattr(g, "csp_nonce", "") or "")
    csp = "; ".join([
        "default-src 'self'",
        "base-uri 'self'",
        "form-action 'self'",
        f"frame-ancestors {frame_ancestors}",
        "object-src 'none'",
        f"script-src 'self' 'nonce-{nonce}' https://unpkg.com https://api.mapbox.com https://cdn.jsdelivr.net",
        "style-src 'self' https://unpkg.com https://api.mapbox.com https://cdn.jsdelivr.net",
        f"style-src-elem 'self' 'nonce-{nonce}' https://unpkg.com https://api.mapbox.com https://cdn.jsdelivr.net",
        "style-src-attr 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data: https://api.mapbox.com https://*.mapbox.com",
        "connect-src 'self' https://api.mapbox.com https://events.mapbox.com https://tiles.mapbox.com https://*.mapbox.com https://api.open-meteo.com",
        "worker-src 'self' blob:",
        "child-src 'self' blob:",
        "media-src 'self' blob:",
        "manifest-src 'self'",
    ])
    response.headers["Content-Security-Policy"] = csp
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    # Voice search is only exposed on the main map. Permit the origin to ask
    # the user for microphone access there; other pages remain microphone-off.
    # An explicitly configured policy always takes precedence.
    permissions_policy = VANO_PERMISSIONS_POLICY
    if response.mimetype == "text/html" and not request.path.startswith(("/admin", "/api/admin")) and request.path != "/onboarding" and not os.environ.get("VANO_PERMISSIONS_POLICY"):
        permissions_policy = permissions_policy.replace("microphone=()", "microphone=(self)")
    response.headers["Permissions-Policy"] = permissions_policy
    response.headers.setdefault("X-DNS-Prefetch-Control", "off")

    # Explicitly avoid cross-origin isolation policies that can interfere with
    # an embedded app or its popup/window relationships.
    response.headers["Cross-Origin-Opener-Policy"] = "unsafe-none" if embed_surface else "same-origin-allow-popups"
    response.headers["Cross-Origin-Embedder-Policy"] = "unsafe-none"
    response.headers["Cross-Origin-Resource-Policy"] = "cross-origin" if embed_surface else "same-site"

    # The parent page uses /healthz as a preflight before attaching the iframe.
    sensitive_prefixes = (
        "/api/live-trip/", "/live/", "/profile", "/notifications",
        "/login", "/register", "/auth/", "/onboarding", "/logout",
        "/forgot-password", "/reset-password/", "/account/delete",
        "/api/saved-places", "/api/weekly-routine", "/api/notifications/", "/api/voice/",
        "/api/shared-route", "/api/shared-routes", "/route/share/", "/family/",
    )
    if request.path.startswith(sensitive_prefixes):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["X-Robots-Tag"] = "noindex, nofollow"
    if session.get("user_id") or request.path in {"/privacy", "/politica-de-privacidade", "/privacy/request", "/testar"}:
        response.headers["Cache-Control"] = "no-store, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.vary.add("Cookie")
    if request.path.startswith(("/route/share/", "/live/", "/family/", "/reset-password/", "/login/google/callback", "/auth/google/callback")):
        response.headers["Referrer-Policy"] = "no-referrer"

    if request.path.startswith("/admin") or request.path.startswith("/api/admin"):
        response.headers["Cache-Control"] = "no-store, max-age=0"
    if request.path == "/healthz":
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Cache-Control"] = "no-store, max-age=0"
    elif request.path.startswith("/api/benchmark/v1/") or request.path == "/.well-known/vano-benchmark.json":
        # Public, read-only machine contract. CORS is intentional so browser-based
        # QA agents can consume it without sharing application/session credentials.
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Cache-Control"] = "no-store, max-age=0"
        response.headers["X-Robots-Tag"] = "noindex, nofollow"
        response.headers["X-VANO-Benchmark-Protocol"] = "1.0"
    elif request.path.startswith("/static/"):
        # Assets whose ?v= matches the current deploy are content-addressed
        # at the URL level: subsequent visits should not re-download them.
        # Unversioned or stale-version critical runtime/map assets still revalidate
        # to preserve hotfix behavior and compatibility with older clients.
        static_name = request.path.rsplit("/", 1)[-1].lower()
        current_build = str(VANO_BUILD_ID or "")
        requested_build = str(request.args.get("v", ""))
        fingerprinted = bool(current_build and requested_build == current_build and re.fullmatch(r"[a-fA-F0-9]{7,40}", current_build))
        critical = static_name.startswith(("vano-map", "vano-runtime", "vano-telemetry", "vano-theme", "vano-benchmark", "vano-app"))
        if fingerprinted:
            response.headers["Cache-Control"] = "public, max-age=2592000, immutable"
        elif critical:
            response.headers["Cache-Control"] = "public, max-age=0, must-revalidate"
        else:
            response.headers["Cache-Control"] = "public, max-age=86400"
    elif request.path in {"/embed", "/frame-test"}:
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"

    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    if app.config.get("SESSION_COOKIE_SECURE"):
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    response.headers.setdefault("X-VANO-Build", VANO_BUILD_ID)
    response.headers.setdefault("X-Permitted-Cross-Domain-Policies", "none")
    if response.status_code == 429:
        response.headers.setdefault("Retry-After", "60")

    # Add the request nonce to every rendered script tag. Static JS remains
    # external; JSON-LD and small bootstraps are covered without unsafe-inline.
    if nonce and response.mimetype == "text/html" and not response.direct_passthrough:
        try:
            html = response.get_data(as_text=True)
            html = re.sub(
                r"<script(?![^>]*\bnonce=)",
                lambda match: f'<script nonce="{nonce}"',
                html,
                flags=re.IGNORECASE,
            )
            html = re.sub(
                r"<style(?![^>]*\bnonce=)",
                lambda match: f'<style nonce="{nonce}"',
                html,
                flags=re.IGNORECASE,
            )
            response.set_data(html)
        except Exception:
            app.logger.exception("CSP nonce injection failed")
    return response

# -----------------------------
# Database
# -----------------------------

