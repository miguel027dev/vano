"""VANO HTTP security headers.

Extracted from the historical monolithic app.py without changing route bodies or
business rules. Runtime dependencies are injected once during application startup.
"""
from vano.bootstrap import inject as _vano_inject
_vano_inject(globals())
del _vano_inject

@app.after_request
def security_headers(response):
    response.headers.setdefault("X-Content-Type-Options", "nosniff")

    # The Vértice integration needs configurable framing, but the rest of the
    # document policy is kept explicit and deny-by-default where practical.
    response.headers.pop("X-Frame-Options", None)
    csp = "; ".join([
        "default-src 'self'",
        "base-uri 'self'",
        "form-action 'self'",
        f"frame-ancestors {FRAME_ANCESTORS}",
        "object-src 'none'",
        "script-src 'self' 'unsafe-inline' https://unpkg.com https://api.mapbox.com https://cdn.jsdelivr.net",
        "style-src 'self' 'unsafe-inline' https://unpkg.com https://api.mapbox.com https://cdn.jsdelivr.net",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data: https://api.mapbox.com https://*.mapbox.com",
        "connect-src 'self' https://api.mapbox.com https://events.mapbox.com https://tiles.mapbox.com https://*.mapbox.com",
        "worker-src 'self' blob:",
        "child-src 'self' blob:",
        "media-src 'self' blob:",
        "manifest-src 'self'",
    ])
    response.headers["Content-Security-Policy"] = csp
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers["Permissions-Policy"] = VANO_PERMISSIONS_POLICY
    response.headers.setdefault("X-DNS-Prefetch-Control", "off")

    # Explicitly avoid cross-origin isolation policies that can interfere with
    # an embedded app or its popup/window relationships.
    response.headers["Cross-Origin-Opener-Policy"] = "unsafe-none"
    response.headers["Cross-Origin-Embedder-Policy"] = "unsafe-none"
    response.headers["Cross-Origin-Resource-Policy"] = "cross-origin"

    # The parent page uses /healthz as a preflight before attaching the iframe.
    sensitive_prefixes = (
        "/api/live-trip/", "/live/", "/profile", "/notifications",
        "/login", "/register", "/auth/", "/onboarding", "/logout",
        "/forgot-password", "/reset-password/", "/account/delete",
    )
    if request.path.startswith(sensitive_prefixes):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["X-Robots-Tag"] = "noindex, nofollow"

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
        # Critical map/runtime bundles must be revalidated. Keeping them
        # immutable for 30 days caused some regions/devices to retain a broken
        # map core after a hotfix. Other fingerprinted/static assets stay cheap.
        static_name = request.path.rsplit("/", 1)[-1].lower()
        if static_name.startswith(("vano-map-", "vano-runtime-", "vano-telemetry-", "vano-theme-", "vano-benchmark-", "vano-app-")):
            response.headers["Cache-Control"] = "public, max-age=0, must-revalidate"
        else:
            response.headers["Cache-Control"] = "public, max-age=2592000, immutable"
    elif request.path in {"/embed", "/frame-test"}:
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"

    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    if app.config.get("SESSION_COOKIE_SECURE"):
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    response.headers.setdefault("X-VANO-Build", VANO_BUILD_ID)
    response.headers.setdefault("X-Permitted-Cross-Domain-Policies", "none")
    if response.status_code == 429:
        response.headers.setdefault("Retry-After", "60")
    return response

# -----------------------------
# Database
# -----------------------------

