"""VANO configuration.

Extracted from the historical monolithic app.py without changing route bodies or
business rules. Runtime dependencies are injected once during application startup.
"""
from vano.bootstrap import inject as _vano_inject
_vano_inject(globals())
del _vano_inject


APP_NAME = "VANO MAPS"
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
VANO_BUILD_ID = (os.environ.get("VANO_BUILD_ID", "").strip() or os.environ.get("RENDER_GIT_COMMIT", "").strip()[:12] or "dev")

def load_local_env():
    """Carrega .env simples sem dependência extra. Variáveis já exportadas têm prioridade."""
    path = os.path.join(BASE_DIR, ".env")
    if not os.path.exists(path):
        return
    try:
        with open(path, "r", encoding="utf-8") as fh:
            for raw in fh:
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = value
    except OSError:
        pass

load_local_env()

# V133 — canonical public origin used by SEO files and metadata. Keep this
# stable even when Render serves the same app through an onrender.com hostname.
PUBLIC_SITE_URL = os.environ.get("PUBLIC_SITE_URL", "").strip().rstrip("/")
SMTP_HOST = os.environ.get("SMTP_HOST", "").strip()
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587") or 587)
SMTP_USER = os.environ.get("SMTP_USER", "").strip()
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "").strip()
SMTP_FROM = os.environ.get("SMTP_FROM", SMTP_USER or "noreply@localhost").strip()
SMTP_USE_TLS = os.environ.get("SMTP_USE_TLS", "1").strip().lower() not in {"0","false","no","off"}
SEO_INDEXABLE_ENDPOINTS = {
    "index", "about", "sobre", "help_page", "privacy_policy", "terms_of_use",
    "what_is_vano", "seo_avoid_traffic", "seo_waze_alternative", "seo_fastest_route",
    "seo_google_maps_alternative", "seo_motorcycle_gps", "route_benchmark_page",
    "account_delete_page",
}
SEO_CANONICAL_PATHS = {
    "index": "/",
    "about": "/about",
    "sobre": "/sobre",
    "help_page": "/help",
    "privacy_policy": "/politica-de-privacidade",
    "terms_of_use": "/termos-de-uso",
    "what_is_vano": "/o-que-e-vano-maps",
    "seo_avoid_traffic": "/rotas-para-evitar-transito",
    "seo_waze_alternative": "/alternativa-ao-waze",
    "seo_fastest_route": "/rota-mais-rapida",
    "seo_google_maps_alternative": "/alternativa-ao-google-maps",
    "seo_motorcycle_gps": "/gps-para-moto",
    "route_benchmark_page": "/benchmark-de-rotas",
    "account_delete_page": "/excluir-conta",
}

def _load_session_secret():
    configured = os.environ.get("VANO_SECRET_KEY", "").strip()
    if configured:
        return configured
    # Never fall back to a known public development secret. A shared temporary
    # file keeps all Gunicorn workers on the same key for this instance. Render
    # restarts rotate it, so production should still configure VANO_SECRET_KEY.
    path = (os.environ.get("VANO_EPHEMERAL_SECRET_FILE", "").strip() or "/tmp/vano-session-secret")
    try:
        import fcntl
        with open(path, "a+", encoding="utf-8") as fh:
            fcntl.flock(fh.fileno(), fcntl.LOCK_EX)
            fh.seek(0); value = fh.read().strip()
            if not value:
                value = secrets.token_urlsafe(64)
                fh.seek(0); fh.truncate(); fh.write(value); fh.flush()
                try: os.fchmod(fh.fileno(), 0o600)
                except OSError: pass
            return value
    except Exception:
        # Last-resort secure randomness is preferable to a published constant.
        # In this branch multi-worker sessions may not persist; configure the env.
        return secrets.token_urlsafe(64)

DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
SECRET_KEY = _load_session_secret()
MAPBOX_ACCESS_TOKEN = os.environ.get("MAPBOX_ACCESS_TOKEN", "").strip()
# X17 — environmental map styles. MAPBOX_STYLE remains as a backwards-compatible
# fallback, but each mood can be configured independently in Render/.env.
MAPBOX_STYLE = os.environ.get("MAPBOX_STYLE", "mapbox://styles/mapbox/standard").strip()
MAPBOX_STYLE_DAY = os.environ.get("MAPBOX_STYLE_DAY", MAPBOX_STYLE or "mapbox://styles/mapbox/standard").strip()
MAPBOX_STYLE_AFTERNOON = os.environ.get("MAPBOX_STYLE_AFTERNOON", "mapbox://styles/miguwl0287/cmixney1h001501s111340npb").strip()
MAPBOX_STYLE_NIGHT = os.environ.get("MAPBOX_STYLE_NIGHT", "mapbox://styles/miguwl0287/cmiwm8kse007v01s023vnadqb").strip()
MAPBOX_STYLE_BLACK = os.environ.get("MAPBOX_STYLE_BLACK", "mapbox://styles/miguwl0287/cmtce1pyo005901qognhbf5wo").strip()
MAPBOX_STYLE_RAIN = os.environ.get("MAPBOX_STYLE_RAIN", "mapbox://styles/miguwl0287/cmszu604f001x01rw8gcyh06b").strip()

def _map_color_env(name, fallback):
    value = os.environ.get(name, fallback).strip()
    return value if re.fullmatch(r"#[0-9A-Fa-f]{6}", value or "") else fallback

MAPBOX_ACCENT_PRESETS = {
    "violet": {
        "primary": _map_color_env("MAPBOX_ACCENT_VIOLET", "#F59A62"),
        "light": _map_color_env("MAPBOX_ACCENT_VIOLET_LIGHT", "#FFC39B"),
        "alt": _map_color_env("MAPBOX_ACCENT_VIOLET_ALT", "#D9703F"),
    },
    "orange": {
        "primary": _map_color_env("MAPBOX_ACCENT_ORANGE", "#FFC39B"),
        "light": _map_color_env("MAPBOX_ACCENT_ORANGE_LIGHT", "#FFE0CA"),
        "alt": _map_color_env("MAPBOX_ACCENT_ORANGE_ALT", "#F59A62"),
    },
    "blue": {
        "primary": _map_color_env("MAPBOX_ACCENT_BLUE", "#D9703F"),
        "light": _map_color_env("MAPBOX_ACCENT_BLUE_LIGHT", "#F59A62"),
        "alt": _map_color_env("MAPBOX_ACCENT_BLUE_ALT", "#FFC39B"),
    },
    "green": {
        "primary": _map_color_env("MAPBOX_ACCENT_GREEN", "#E8D8C9"),
        "light": _map_color_env("MAPBOX_ACCENT_GREEN_LIGHT", "#FFFBF2"),
        "alt": _map_color_env("MAPBOX_ACCENT_GREEN_ALT", "#C9B7A8"),
    },
    "rose": {
        "primary": _map_color_env("MAPBOX_ACCENT_ROSE", "#27231F"),
        "light": _map_color_env("MAPBOX_ACCENT_ROSE_LIGHT", "#706861"),
        "alt": _map_color_env("MAPBOX_ACCENT_ROSE_ALT", "#F59A62"),
    },
}
MAPBOX_GEOCODING_URL = "https://api.mapbox.com/search/geocode/v6"
MAPBOX_SEARCHBOX_URL = "https://api.mapbox.com/search/searchbox/v1"
BRASILAPI_CEP_URL = "https://brasilapi.com.br/api/cep/v2"
VIACEP_URL = "https://viacep.com.br/ws"
MAPBOX_DIRECTIONS_URL = "https://api.mapbox.com/directions/v5/mapbox"
OVERPASS_URL = os.environ.get("OVERPASS_URL", "https://overpass-api.de/api/interpreter").strip()
OPEN_METEO_URL = os.environ.get("OPEN_METEO_URL", "https://api.open-meteo.com/v1/forecast").strip()
OPENROUTESERVICE_API_KEY = os.environ.get("OPENROUTESERVICE_API_KEY", "").strip()
OPENROUTESERVICE_URL = os.environ.get("OPENROUTESERVICE_URL", "https://api.heigit.org/openrouteservice/v2/directions").strip().rstrip("/")
OSRM_BASE_URL = os.environ.get("OSRM_BASE_URL", "").strip().rstrip("/")
# V164 — event-aware routing. Optional structured feeds can be added later via
# env without changing code; OSM venue discovery + live traffic works by default.
VANO_EVENT_INTELLIGENCE_ENABLED = os.environ.get("VANO_EVENT_INTELLIGENCE_ENABLED", "1").strip().lower() not in {"0", "false", "off", "no"}
VANO_EVENT_FEED_URLS = [x.strip() for x in os.environ.get("VANO_EVENT_FEED_URLS", "").split(",") if x.strip()][:3]
VANO_EVENT_SCAN_MAX_KM = max(8.0, min(180.0, float(os.environ.get("VANO_EVENT_SCAN_MAX_KM", "90") or 90)))
VANO_ESPN_MATCH_FEED_ENABLED = os.environ.get("VANO_ESPN_MATCH_FEED_ENABLED", "1").strip().lower() not in {"0", "false", "off", "no"}
VANO_ESPN_SOCCER_LEAGUES = [x.strip() for x in os.environ.get("VANO_ESPN_SOCCER_LEAGUES", "bra.1,bra.2,bra.copa_do_brazil,conmebol.libertadores,conmebol.sudamericana").split(",") if x.strip()][:8]

# V48 — Mapbox-only routing/search. HERE is intentionally disabled/removed for now.

# V42 — lightweight self keep-alive. One GET + one POST every 120 seconds.
# The URL and switch are environment-configurable so staging/local environments
# can disable it without changing source code.
VANO_KEEPALIVE_URL = (os.environ.get("VANO_KEEPALIVE_URL", "").strip() or "https://vanomaps.online").rstrip("/")
VANO_KEEPALIVE_ENABLED = os.environ.get("VANO_KEEPALIVE_ENABLED", "1").strip().lower() not in {"0", "false", "off", "no"}
VANO_KEEPALIVE_INTERVAL = max(120, int(os.environ.get("VANO_KEEPALIVE_INTERVAL", "120") or 120))
VANO_KEEPALIVE_TIMEOUT = max(2, min(15, int(os.environ.get("VANO_KEEPALIVE_TIMEOUT", "7") or 7)))
VANO_KEEPALIVE_START_DELAY = max(3, min(60, int(os.environ.get("VANO_KEEPALIVE_START_DELAY", "12") or 12)))
_KEEPALIVE_THREAD_LOCK = threading.Lock()
_KEEPALIVE_THREAD_STARTED = False
_KEEPALIVE_LEADER_FD = None

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "").strip()
GOOGLE_REDIRECT_URI = os.environ.get("GOOGLE_REDIRECT_URI", "").strip()
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"

# Number of reverse-proxy hops whose forwarding headers are trusted. Render's
# normal setup is one hop; deployments behind an additional CDN/proxy can set 2.
VANO_PROXY_HOPS = max(0, min(5, int(os.environ.get("VANO_PROXY_HOPS", "1") or 1)))

# Administration identity is deployment configuration, never source code.
PRIMARY_ADMIN_EMAIL = os.environ.get("VANO_ADMIN_EMAIL", "").strip().lower()
VANO_OWNER_EMAIL = PRIMARY_ADMIN_EMAIL
ADMIN_EMAILS = {PRIMARY_ADMIN_EMAIL} if PRIMARY_ADMIN_EMAIL else set()
MOTORIZED_PROFILES = {"driving", "motorcycle"}


# V85 — distributed infrastructure dashboard. The public URLs/regions are safe
# configuration metadata only; secrets/tokens are intentionally never exposed.
VANO_NODE_COUNT = max(1, min(5000, int(os.environ.get("VANO_NODE_COUNT", "15") or 15)))
VANO_NODE_CAPACITY = max(1, min(100, int(os.environ.get("VANO_NODE_CAPACITY", "4") or 4)))
VANO_NODE_HEALTH_PATH = os.environ.get("VANO_NODE_HEALTH_PATH", "/healthz").strip() or "/healthz"
VANO_NODE_CHECK_TIMEOUT = max(0.7, min(8.0, float(os.environ.get("VANO_NODE_CHECK_TIMEOUT", "2.8") or 2.8)))
VANO_NODE_STATUS_TTL = max(4, min(120, int(os.environ.get("VANO_NODE_STATUS_TTL", "20") or 20)))
VANO_NODE_STATUS_CACHE = {}
VANO_NODE_STATUS_LOCK = threading.Lock()
VANO_DISTRIBUTED_ROUTING_ENABLED = os.environ.get("VANO_DISTRIBUTED_ROUTING_ENABLED", "1").strip().lower() not in {"0", "false", "off", "no"}
VANO_NODE_ROUTE_TIMEOUT = max(4.0, min(30.0, float(os.environ.get("VANO_NODE_ROUTE_TIMEOUT", "10") or 10)))
VANO_NODE_ROUTE_ATTEMPTS = max(1, min(6, int(os.environ.get("VANO_NODE_ROUTE_ATTEMPTS", "2") or 2)))
# V123.3 — heavy-route orchestration. Routes from 8 km up to 3,000 km can use
# hedged requests across multiple healthy Route Nodes. A hedge is launched only
# when the previous worker is slow/failing, avoiding a naive N-way duplicate on
# every trip (important because Mapbox limits are per access token, not server).
VANO_HEAVY_ROUTE_MIN_KM = max(0.0, min(5000.0, float(os.environ.get("VANO_HEAVY_ROUTE_MIN_KM", "8") or 8)))
VANO_HEAVY_ROUTE_MAX_KM = max(VANO_HEAVY_ROUTE_MIN_KM, min(10000.0, float(os.environ.get("VANO_HEAVY_ROUTE_MAX_KM", "3000") or 3000)))
VANO_HEAVY_ROUTE_MAX_FANOUT = max(2, min(8, int(os.environ.get("VANO_HEAVY_ROUTE_MAX_FANOUT", "5") or 5)))
VANO_HEAVY_ROUTE_TOTAL_ATTEMPTS = max(2, min(16, int(os.environ.get("VANO_HEAVY_ROUTE_TOTAL_ATTEMPTS", "8") or 8)))
VANO_HEAVY_ROUTE_HEDGE_DELAY_MS = max(80, min(1500, int(os.environ.get("VANO_HEAVY_ROUTE_HEDGE_DELAY_MS", "650") or 650)))
VANO_HEAVY_ROUTE_TIMEOUT_MAX = max(20.0, min(90.0, float(os.environ.get("VANO_HEAVY_ROUTE_TIMEOUT_MAX", "55") or 55)))
VANO_HEAVY_ROUTE_CLUSTER_LOAD_LIMIT = max(0.50, min(0.98, float(os.environ.get("VANO_HEAVY_ROUTE_CLUSTER_LOAD_LIMIT", "0.86") or 0.86)))
CENTRAL_API_SECRET = os.environ.get("CENTRAL_API_SECRET", "").strip()
VANO_ALLOW_HTTP_NODES = os.environ.get("VANO_ALLOW_HTTP_NODES", "0").strip().lower() in {"1", "true", "yes", "on"}
_NODE_CONFIG_TABLE_LOCK = threading.Lock()
_NODE_CONFIG_TABLE_READY = False
_NODE_CONFIG_CACHE = {}
_NODE_CONFIG_CACHE_LOCK = threading.Lock()
_NODE_CONFIG_CACHE_TTL = max(3, min(60, int(os.environ.get("VANO_NODE_CONFIG_CACHE_TTL", "12") or 12)))
_NODE_REGISTRY_CACHE = {"ts": 0.0, "configs": []}
_NODE_REGISTRY_LOCK = threading.Lock()
_NODE_REGISTRY_TTL = max(2, min(60, int(os.environ.get("VANO_NODE_REGISTRY_TTL", "15") or 15)))
_NODE_REGISTRY_LIMIT = min(5000, max(32, int(os.environ.get("VANO_NODE_REGISTRY_LIMIT", str(max(VANO_NODE_COUNT, 128))) or max(VANO_NODE_COUNT, 128))))
_NODE_DISPATCH_LOCK = threading.Lock()
_NODE_DISPATCH_CURSOR = 0
_NODE_COOLDOWN_UNTIL = {}
_NODE_COOLDOWN_LOCK = threading.Lock()
# Local reservations close the gap between health probes. Without them, several
# simultaneous Central requests can all see the same stale "free slots" value
# and stampede one worker before /healthz catches up.
_NODE_INFLIGHT = {}
_NODE_INFLIGHT_LOCK = threading.Lock()
_NODE_LOG_TABLE_LOCK = threading.Lock()
_NODE_LOG_TABLE_READY = False
_NODE_LOG_QUEUE = queue.Queue(maxsize=5000)
_NODE_LOG_WORKER_LOCK = threading.Lock()
_NODE_LOG_WORKER_STARTED = False

# V91 — persistent connection pools. Reusing DNS/TLS connections removes a
# noticeable amount of latency on repeated Mapbox and worker requests.
def _make_http_session(pool=32):
    s = requests.Session()
    adapter = HTTPAdapter(pool_connections=pool, pool_maxsize=pool, max_retries=0, pool_block=False)
    s.mount("https://", adapter)
    s.mount("http://", adapter)
    return s

_NODE_HTTP = _make_http_session(max(64, min(512, int(os.environ.get("VANO_NODE_HTTP_POOL", "192") or 192))))
_MAPBOX_HTTP = _make_http_session(48)


def _env_bool(name, default=True):
    raw = os.environ.get(name)
    if raw is None:
        return bool(default)
    return str(raw).strip().lower() not in {"0", "false", "off", "no", "disabled"}


