"""VANO HTTP security headers.

Extracted from the historical monolithic app.py without changing route bodies or
business rules. Runtime dependencies are injected once during application startup.
"""
from vano.bootstrap import inject as _vano_inject
_vano_inject(globals())
del _vano_inject

def security_headers(response):
    response.headers.setdefault("X-Content-Type-Options", "nosniff")

    # Force permissive framing on every Flask response. Do not emit
    # X-Frame-Options at all: there is no standards-compliant ALLOW-ALL value.
    response.headers.pop("X-Frame-Options", None)
    response.headers["Content-Security-Policy"] = f"frame-ancestors {FRAME_ANCESTORS}"
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), payment=(), usb=()")
    response.headers["Permissions-Policy"] = VANO_PERMISSIONS_POLICY

    # Explicitly avoid cross-origin isolation policies that can interfere with
    # an embedded app or its popup/window relationships.
    response.headers["Cross-Origin-Opener-Policy"] = "unsafe-none"
    response.headers["Cross-Origin-Embedder-Policy"] = "unsafe-none"
    response.headers["Cross-Origin-Resource-Policy"] = "cross-origin"

    # The parent page uses /healthz as a preflight before attaching the iframe.
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
    return response

# -----------------------------
# Database
# -----------------------------

