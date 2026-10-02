"""VANO locale, geocoding and location search.

Extracted from the historical monolithic app.py without changing route bodies or
business rules. Runtime dependencies are injected once during application startup.
"""
from vano.bootstrap import inject as _vano_inject
_vano_inject(globals())
del _vano_inject

def _explicit_country_hint(query):
    normalized = _search_normalize(query or "")
    # Longest aliases first so phrases like "reino unido" win before "uk".
    for alias in sorted(EUROPE_COUNTRY_HINTS, key=len, reverse=True):
        if re.search(r"(?:^|\s)" + re.escape(alias) + r"(?:$|\s)", normalized):
            return EUROPE_COUNTRY_HINTS[alias]
    return None

def _international_query_context(query):
    clean = re.sub(r"\s+", " ", (query or "").strip())
    country = _explicit_country_hint(clean)
    pure_postcode = bool(EUROPE_POSTCODE_RE.fullmatch(clean.upper())) and not CEP_RE.fullmatch(clean)
    return {"country": country, "pure_postcode": pure_postcode}


def normalize_location_query(value):
    value = re.sub(r"\s+", " ", (value or "").strip())[:240]
    match = CEP_RE.match(value)
    if match:
        return f"{match.group(1)}-{match.group(2)}, Brasil", True
    return value, bool(CEP_ANY_RE.search(value))


def parse_brazil_location_query(value):
    """Extrai CEP e número sem destruir a consulta digitada.

    Aceita exemplos como `05659-000 120`, `CEP 05659000, nº 120` e
    `Rua Exemplo, 120 - 05659-000`. O número só é inferido automaticamente
    quando existe um CEP na mesma consulta, evitando confundir números de rua
    com outras partes de nomes comuns.
    """
    clean = re.sub(r"\s+", " ", (value or "").strip())[:240]
    cep_match = CEP_ANY_RE.search(clean)
    cep = "".join(cep_match.groups()) if cep_match else ""
    number = None
    explicit = HOUSE_NUMBER_RE.search(clean)
    if explicit:
        number = explicit.group(1)
    elif cep_match:
        without_cep = (clean[:cep_match.start()] + " " + clean[cep_match.end():]).strip(" ,;-")
        candidates = re.findall(r"(?<!\d)(\d{1,6}[A-Za-z]?)(?!\d)", without_cep)
        if candidates:
            number = candidates[-1]
    return {"raw": clean, "cep": cep, "number": number}



# VANO MAPS V136 — zero-flash automatic locale resolution.
# Country headers from trusted/proxy infrastructure win. When Render does not
# expose a country header, the first HTML response uses Accept-Language and the
# client refines it before first paint using timezone/region, then persists a
# same-site cookie used by API requests and later pages.
SUPPORTED_UI_LOCALES = {"pt-BR", "pt-PT", "en-US", "fr-FR", "ar-MA", "ru-RU", "es-ES"}
COUNTRY_UI_LOCALE = {
    "BR": "pt-BR", "PT": "pt-PT",
    "FR": "fr-FR", "MC": "fr-FR",
    "US": "en-US", "GB": "en-US", "CA": "en-US", "AU": "en-US", "NZ": "en-US",
    "MA": "ar-MA",
    "RU": "ru-RU",
    "ES": "es-ES", "MX": "es-ES", "AR": "es-ES", "CL": "es-ES",
    "CO": "es-ES", "PE": "es-ES", "UY": "es-ES",
}
COUNTRY_HEADER_CANDIDATES = (
    "CF-IPCountry", "CloudFront-Viewer-Country", "X-Vercel-IP-Country",
    "X-Country-Code", "X-Appengine-Country", "Fastly-Client-Country",
)


def _normalize_ui_locale(value):
    raw = re.sub(r"[^A-Za-z0-9_-]", "", str(value or "")).replace("_", "-")[:24]
    if not raw:
        return ""
    low = raw.lower()
    if low.startswith("pt-pt"):
        return "pt-PT"
    if low.startswith("pt"):
        return "pt-BR"
    if low.startswith("fr"):
        return "fr-FR"
    if low.startswith("en"):
        return "en-US"
    if low.startswith("ar"):
        return "ar-MA"
    if low.startswith("ru"):
        return "ru-RU"
    if low.startswith("es"):
        return "es-ES"
    return ""


def _country_locale_from_headers():
    if not has_request_context():
        return "", ""
    for header in COUNTRY_HEADER_CANDIDATES:
        code = re.sub(r"[^A-Za-z]", "", request.headers.get(header, ""))[:2].upper()
        if code in COUNTRY_UI_LOCALE:
            return COUNTRY_UI_LOCALE[code], code
    return "", ""


def detect_ui_locale():
    """Resolve UI language with an explicit account choice taking precedence."""
    if not has_request_context():
        return _normalize_ui_locale(os.environ.get("VANO_DEFAULT_LANGUAGE", "pt-BR")) or "pt-BR", "default", ""

    # Logged-in users own their language choice. Region/browser detection must
    # never overwrite an explicit preference saved on the account.
    uid = session.get("user_id")
    if uid:
        try:
            resolver = globals().get("current_user")
            row = resolver() if callable(resolver) else None
            if row is None:
                row = get_db().execute("SELECT locale FROM users WHERE id=?", (uid,)).fetchone()
            account_locale = _normalize_ui_locale(row["locale"] if row else "")
            if account_locale in SUPPORTED_UI_LOCALES:
                return account_locale, "account", ""
        except Exception:
            pass

    explicit_locale = _normalize_ui_locale(request.cookies.get("vano_locale", ""))
    if explicit_locale in SUPPORTED_UI_LOCALES:
        return explicit_locale, "explicit_cookie", ""

    header_locale, country = _country_locale_from_headers()
    if header_locale:
        return header_locale, "country_header", country

    # Keep compatibility with both historical client cookie names.
    cookie_locale = _normalize_ui_locale(
        request.cookies.get("vano_locale_auto", "") or request.cookies.get("vano_locale_auto", "")
    )
    if cookie_locale in SUPPORTED_UI_LOCALES:
        return cookie_locale, "client_auto", ""

    # Parse q-values instead of trusting only the first token.
    best = request.accept_languages.best_match(
        ["pt-BR", "pt-PT", "en-US", "fr-FR", "ar-MA", "ru-RU", "es-ES"],
        default="pt-BR",
    )
    normalized = _normalize_ui_locale(best) or "pt-BR"
    return normalized, "accept_language", ""


@app.before_request
def resolve_ui_locale():
    locale, source, country = detect_ui_locale()
    g.vano_locale = locale
    g.vano_locale_source = source
    g.vano_country = country


def active_ui_locale():
    if has_request_context():
        value = getattr(g, "vano_locale", "") or detect_ui_locale()[0]
        return _normalize_ui_locale(value) or "pt-BR"
    return _normalize_ui_locale(os.environ.get("VANO_DEFAULT_LANGUAGE", "pt-BR")) or "pt-BR"

def preferred_language():
    """Return a safe language even when called outside Flask request context.

    Search providers may run inside worker threads. Flask's ``request`` proxy is
    local to the HTTP request context, so touching it from those workers raises
    ``Working outside of request context``. Capture the language before spawning
    workers whenever possible; this guard keeps other background callers safe.
    """
    if has_request_context():
        return active_ui_locale()
    raw = os.environ.get("VANO_DEFAULT_LANGUAGE", "pt-BR")
    return _normalize_ui_locale(raw) or "pt-BR"


def mapbox_language():
    """Return a Mapbox-compatible instruction/search language code."""
    locale = preferred_language()
    # Mapbox supports Arabic turn instructions as `ar`/`ar-AE`; `ar-MA`
    # is our account/UI locale, so normalize it before provider requests.
    if locale == "ar-MA":
        return "ar"
    return locale


def mapbox_ready():
    """Return True only for a plausible public Mapbox token.

    X3 accidentally removed this helper while keeping its call sites, which
    caused the Render home page to fail with NameError/HTTP 500.
    """
    token = (MAPBOX_ACCESS_TOKEN or "").strip()
    lowered = token.lower()
    return bool(
        token.startswith("pk.")
        and len(token) > 30
        and "seu_token" not in lowered
        and "your_mapbox" not in lowered
    )


def mapbox_get(url, params, timeout=12):
    if not mapbox_ready():
        raise RuntimeError("Infraestrutura de mapas não configurada neste ambiente.")
    params = dict(params)
    params["access_token"] = MAPBOX_ACCESS_TOKEN
    last_error = None
    for attempt in range(2):
        try:
            response = _MAPBOX_HTTP.get(url, params=params, timeout=(2.5, timeout))
            try:
                payload = response.json()
            except Exception:
                payload = {}
            if response.ok:
                return payload
            message = payload.get("message") or payload.get("error") or f"HTTP {response.status_code}"
            last_error = RuntimeError(f"Serviço de mapas: {message}")
            if attempt == 0 and (response.status_code == 429 or response.status_code >= 500):
                time.sleep(.16)
                continue
            raise last_error
        except (requests.Timeout, requests.ConnectionError) as exc:
            last_error = exc
            if attempt == 0:
                time.sleep(.12)
                continue
    if isinstance(last_error, RuntimeError):
        raise last_error
    raise RuntimeError("Serviço de mapas temporariamente indisponível.") from last_error


def lookup_brazil_cep(cep):
    """Resolve CEP brasileiro combinando ViaCEP + BrasilAPI.

    V35: ViaCEP é usado como referência textual principal para logradouro/bairro/
    cidade/UF; BrasilAPI v2 complementa coordenadas quando disponíveis. As duas
    consultas são independentes para que uma indisponibilidade não derrube a busca.
    """
    digits = re.sub(r"\D", "", cep or "")
    if len(digits) != 8:
        return None

    def fetch_viacep():
        try:
            r = requests.get(f"{VIACEP_URL}/{digits}/json/", timeout=4.5)
            if not r.ok:
                return None
            d = r.json() or {}
            if d.get("erro"):
                return None
            return {
                "street": (d.get("logradouro") or "").strip(),
                "neighborhood": (d.get("bairro") or "").strip(),
                "city": (d.get("localidade") or "").strip(),
                "state": (d.get("uf") or "").strip(),
                "ibge": (d.get("ibge") or "").strip(),
            }
        except Exception:
            return None

    def fetch_brasilapi():
        try:
            r = requests.get(f"{BRASILAPI_CEP_URL}/{digits}", timeout=4.5)
            if not r.ok:
                return None
            d = r.json() or {}
            coords = ((d.get("location") or {}).get("coordinates") or {})
            return {
                "street": (d.get("street") or "").strip(),
                "neighborhood": (d.get("neighborhood") or "").strip(),
                "city": (d.get("city") or "").strip(),
                "state": (d.get("state") or "").strip(),
                "lat": coords.get("latitude"),
                "lon": coords.get("longitude"),
            }
        except Exception:
            return None

    via = bra = None
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            fv = pool.submit(fetch_viacep)
            fb = pool.submit(fetch_brasilapi)
            via, bra = fv.result(), fb.result()
    except Exception:
        via, bra = fetch_viacep(), fetch_brasilapi()

    if not via and not bra:
        return None
    via, bra = via or {}, bra or {}
    # Prefer ViaCEP text so a pure CEP always renders its canonical street label;
    # use BrasilAPI only to fill fields absent from ViaCEP and to supply coordinates.
    return {
        "cep": digits,
        "street": via.get("street") or bra.get("street") or "",
        "neighborhood": via.get("neighborhood") or bra.get("neighborhood") or "",
        "city": via.get("city") or bra.get("city") or "",
        "state": via.get("state") or bra.get("state") or "",
        "lat": bra.get("lat"),
        "lon": bra.get("lon"),
        "source": "viacep+brasilapi" if via and bra else ("viacep" if via else "brasilapi"),
    }


def _cep_authoritative_result(cep_info, query_meta, candidates=None, proximity=None):
    """Build the top CEP result with canonical postal text and best known point."""
    if not cep_info or not query_meta.get("cep"):
        return None
    lat = cep_info.get("lat")
    lon = cep_info.get("lon")
    chosen = None
    for item in candidates or []:
        got = re.sub(r"\D", "", str(item.get("postcode") or ""))
        street_ok = not cep_info.get("street") or _soft_token_match(
            _search_normalize(cep_info.get("street")), item.get("street") or item.get("label") or ""
        )
        if got == query_meta["cep"] or item.get("postcode_match") == "matched" or street_ok:
            chosen = item
            if item.get("type") in {"address", "street", "postcode"}:
                break
    if chosen:
        lat, lon = chosen.get("lat"), chosen.get("lon")
    try:
        lat, lon = float(lat), float(lon)
    except (TypeError, ValueError):
        # BrasilAPI may legitimately have no coordinates for a CEP. Use Mapbox itself
        # to geocode the canonical ViaCEP street, keeping the search stack Mapbox-only.
        canonical_query = ", ".join(x for x in [
            cep_info.get("street"), cep_info.get("neighborhood"),
            cep_info.get("city"), cep_info.get("state"), "Brasil"
        ] if x)
        try:
            params = {
                "q": canonical_query, "country": "br", "limit": 5,
                "language": mapbox_language(), "types": "address,street,postcode,place,locality",
            }
            if proximity:
                params["proximity"] = f"{float(proximity[0]):.6f},{float(proximity[1]):.6f}"
            payload = mapbox_get(f"{MAPBOX_GEOCODING_URL}/forward", params, timeout=7) if canonical_query else {}
            fallback = [_mapbox_result(f, query_meta) for f in (payload.get("features") or [])]
            candidate = next((x for x in fallback if x and x.get("type") in {"street", "address", "place", "locality", "postcode"}), None)
            if candidate:
                lat, lon = float(candidate["lat"]), float(candidate["lon"])
                chosen = candidate
            else:
                return None
        except Exception:
            return None
    cep = query_meta["cep"]
    cep_fmt = f"{cep[:5]}-{cep[5:]}"
    street = cep_info.get("street") or ""
    neighborhood = cep_info.get("neighborhood") or ""
    city = cep_info.get("city") or ""
    state = cep_info.get("state") or ""
    number = query_meta.get("number") or ""
    first = " ".join(x for x in [street, number] if x).strip()
    label = ", ".join(x for x in [first, neighborhood, f"{city} - {state}".strip(" -"), cep_fmt] if x)
    cep_display = f"{cep_fmt} · nº {number}" if number else cep_fmt
    canonical_address = ", ".join(x for x in [first or street, neighborhood, f"{city} - {state}".strip(" -"), cep_fmt] if x)
    item = {
        "label": label or cep_fmt,
        "name": cep_display,
        "address": canonical_address,
        "query_display": cep_display,
        "category": "CEP",
        "category_key": "address",
        "lat": lat, "lon": lon,
        "display_lat": float(chosen.get("display_lat", lat)) if chosen else lat,
        "display_lon": float(chosen.get("display_lon", lon)) if chosen else lon,
        "entrance_lat": chosen.get("entrance_lat") if chosen else None,
        "entrance_lon": chosen.get("entrance_lon") if chosen else None,
        "type": "address" if number and chosen and chosen.get("type") == "address" else "postcode",
        "mapbox_id": chosen.get("mapbox_id", "") if chosen else "",
        "postcode": cep_fmt,
        "address_number": str(number),
        "street": street,
        "accuracy": chosen.get("accuracy", "approximate") if chosen else "approximate",
        "match_confidence": chosen.get("match_confidence", "") if chosen else "",
        "address_number_match": chosen.get("address_number_match", "") if chosen else "",
        "street_match": "matched" if street else "",
        "postcode_match": "matched",
        "precision_label": ("CEP + número" if number and chosen and chosen.get("type") == "address" else "logradouro oficial do CEP"),
        "number_unverified": bool(number and not (chosen and chosen.get("type") == "address")),
        "source": "cep-authoritative",
        "cep_query": True,
        "rank": -250,
    }
    if proximity:
        try:
            item["distance_m"] = round(haversine_m(float(proximity[1]), float(proximity[0]), lat, lon))
        except Exception:
            pass
    return item

def _mapbox_result(feature, query_meta=None, source="mapbox"):
    props = feature.get("properties") or {}
    coords = props.get("coordinates") or {}
    lon, lat = coords.get("longitude"), coords.get("latitude")
    if lon is None or lat is None:
        pair = (feature.get("geometry") or {}).get("coordinates") or []
        if len(pair) >= 2:
            lon, lat = pair[0], pair[1]
    if lon is None or lat is None:
        return None
    context = props.get("context") or {}
    postcode = ((context.get("postcode") or {}).get("name") or "").strip()
    address_ctx = context.get("address") or {}
    street_ctx = context.get("street") or {}
    address_number = (address_ctx.get("address_number") or "").strip()
    street_name = (address_ctx.get("street_name") or street_ctx.get("name") or "").strip()
    match = props.get("match_code") or {}
    confidence = str(match.get("confidence") or "").lower()
    accuracy = str(coords.get("accuracy") or "").lower()
    routable = coords.get("routable_points") or []
    default_point = next((p for p in routable if str(p.get("name", "")).lower() == "default"), None)
    entrance_point = next((p for p in routable if str(p.get("name", "")).lower() == "entrance"), None)
    nav_lon = default_point.get("longitude") if default_point else lon
    nav_lat = default_point.get("latitude") if default_point else lat
    ent_lon = entrance_point.get("longitude") if entrance_point else None
    ent_lat = entrance_point.get("latitude") if entrance_point else None
    label = props.get("full_address") or ", ".join(x for x in [props.get("name_preferred") or props.get("name"), props.get("place_formatted")] if x)
    if postcode and postcode not in (label or ""):
        label = f"{label}, {postcode}" if label else postcode
    feature_type = props.get("feature_type", "")
    precision_label = {
        "rooftop": "entrada/prédio",
        "parcel": "lote",
        "point": "endereço",
        "interpolated": "número estimado",
        "approximate": "aproximado",
        "intersection": "cruzamento",
    }.get(accuracy, "endereço" if feature_type == "address" else "rua" if feature_type == "street" else "CEP" if feature_type == "postcode" else "local")
    primary_name = props.get("name_preferred") or props.get("name") or street_name or label or "Local"
    formatted_address = props.get("full_address") or props.get("place_formatted") or label or ""
    return {
        "label": label or (query_meta or {}).get("raw") or "Local",
        "name": primary_name,
        "address": formatted_address,
        "category": "Endereço" if feature_type == "address" else "Rua" if feature_type == "street" else "CEP" if feature_type == "postcode" else "Local",
        "category_key": "address" if feature_type == "address" else "street" if feature_type == "street" else "place",
        "lat": float(nav_lat), "lon": float(nav_lon),
        "display_lat": float(lat), "display_lon": float(lon),
        "entrance_lat": float(ent_lat) if ent_lat is not None else None,
        "entrance_lon": float(ent_lon) if ent_lon is not None else None,
        "type": feature_type,
        "mapbox_id": props.get("mapbox_id") or feature.get("id", ""),
        "postcode": postcode,
        "address_number": address_number,
        "street": street_name,
        "accuracy": accuracy,
        "match_confidence": confidence,
        "address_number_match": str(match.get("address_number") or "").lower(),
        "street_match": str(match.get("street") or "").lower(),
        "postcode_match": str(match.get("postcode") or "").lower(),
        "precision_label": precision_label,
        "source": source,
        "cep_query": bool((query_meta or {}).get("cep")),
    }


def _result_rank(item, query_meta):
    type_rank = {"address": 0, "street": 14, "postcode": 24, "neighborhood": 34, "locality": 38, "place": 42, "district": 48, "region": 54, "country": 60}
    conf_rank = {"exact": 0, "high": 3, "medium": 9, "low": 18, "": 11}
    accuracy_rank = {"rooftop": 0, "parcel": 2, "point": 4, "interpolated": 8, "intersection": 9, "approximate": 14, "": 7}
    score = type_rank.get(item.get("type"), 45) + conf_rank.get(item.get("match_confidence", ""), 12) + accuracy_rank.get(item.get("accuracy", ""), 8)
    if query_meta.get("number"):
        if item.get("type") != "address": score += 35
        wanted_number = str(query_meta["number"]).lower()
        got_number = str(item.get("address_number") or "").lower()
        number_match = item.get("address_number_match", "")
        if got_number and got_number == wanted_number: score -= 18
        elif number_match == "matched": score -= 14
        elif number_match == "plausible": score += 3
        elif number_match == "unmatched" or (got_number and got_number != wanted_number): score += 58
    if query_meta.get("cep"):
        wanted = query_meta["cep"]
        got = re.sub(r"\D", "", item.get("postcode") or "")
        postcode_match = item.get("postcode_match", "")
        if got == wanted or postcode_match == "matched": score -= 15
        elif postcode_match == "unmatched": score += 42
        elif got: score += 18
    if item.get("source") == "cep-fallback": score += 70
    return score


SEARCH_STOPWORDS = {
    "a", "o", "as", "os", "de", "da", "do", "das", "dos", "e", "em", "na", "no",
    "nas", "nos", "para", "por", "brasil", "sao", "paulo",
    "rua", "r", "avenida", "av", "estrada", "rodovia",
}
SEARCH_LEADING_NOISE_RE = re.compile(
    r"^\s*(?:rua|r\.?|avenida|av\.?|estrada|rodovia)\s+(?=(?:escola|colegio|colégio|universidade|hospital|clinica|clínica|banco|santander|itau|itaú|bradesco|mercado|shopping|farmacia|farmácia|posto)\b)",
    re.IGNORECASE,
)


def _search_normalize(value):
    value = unicodedata.normalize("NFKD", str(value or ""))
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = value.lower()
    return re.sub(r"[^a-z0-9]+", " ", value).strip()


def _search_tokens(value):
    return [x for x in _search_normalize(value).split() if len(x) >= 2 and x not in SEARCH_STOPWORDS]


def _soft_token_match(token, haystack):
    words = set(_search_normalize(haystack).split())
    if token in words or token in _search_normalize(haystack):
        return True
    if len(token) < 4:
        return False
    # Small typo tolerance for proper names (Melo/Mello, Andronico/Andrônico).
    return any(
        abs(len(token) - len(word)) <= 2 and difflib.SequenceMatcher(None, token, word).ratio() >= 0.82
        for word in words if len(word) >= 4
    )


def _search_cache_key(query, proximity):
    q = _search_normalize(query)
    if proximity:
        # ~1 km cells keep cache useful without mixing distant neighborhoods.
        return f"search-v317:{q}:{float(proximity[1]):.2f}:{float(proximity[0]):.2f}"
    return f"search-v317:{q}:global"


def _search_cache_get(key, ttl_seconds=900):
    now = time.time()
    with SEARCH_RESULT_LOCK:
        row = SEARCH_RESULT_CACHE.get(key)
        if not row:
            return None
        created, payload = row
        if now - created > ttl_seconds:
            SEARCH_RESULT_CACHE.pop(key, None)
            return None
        return [dict(x) for x in payload]


def _search_cache_set(key, results):
    # Keep provider responses ephemeral in memory. This reduces repeated public
    # geocoder traffic without retaining temporary Mapbox search data in SQLite.
    with SEARCH_RESULT_LOCK:
        if len(SEARCH_RESULT_CACHE) > 600:
            cutoff = time.time() - 900
            for cache_key, (created, _payload) in list(SEARCH_RESULT_CACHE.items()):
                if created < cutoff:
                    SEARCH_RESULT_CACHE.pop(cache_key, None)
        SEARCH_RESULT_CACHE[key] = (time.time(), [dict(x) for x in results])

def _osm_category(props):
    key = str(props.get("osm_key") or "").lower()
    value = str(props.get("osm_value") or "").lower()
    pair = f"{key}:{value}"
    mapping = {
        "amenity:school": ("Escola", "school"),
        "amenity:college": ("Faculdade", "school"),
        "amenity:university": ("Universidade", "school"),
        "amenity:kindergarten": ("Educação", "school"),
        "amenity:bank": ("Banco", "bank"),
        "amenity:hospital": ("Hospital", "hospital"),
        "amenity:clinic": ("Clínica", "hospital"),
        "amenity:pharmacy": ("Farmácia", "pharmacy"),
        "amenity:fuel": ("Posto", "fuel"),
        "amenity:parking": ("Estacionamento", "parking"),
        "amenity:bus_station": ("Terminal", "terminal"),
        "public_transport:station": ("Terminal / estação", "terminal"),
        "aeroway:aerodrome": ("Aeroporto", "airport"),
        "aeroway:terminal": ("Terminal de aeroporto", "airport"),
        "amenity:restaurant": ("Restaurante", "food"),
        "amenity:cafe": ("Café", "food"),
        "amenity:cinema": ("Cinema", "poi"),
        "amenity:theatre": ("Teatro", "poi"),
        "amenity:marketplace": ("Comércio", "shop"),
        "shop:supermarket": ("Supermercado", "shop"),
        "shop:mall": ("Shopping", "shop"),
        "tourism:hotel": ("Hotel", "hotel"),
        "leisure:park": ("Parque", "park"),
        "amenity:police": ("Serviço público", "public"),
        "office:government": ("Órgão público", "public"),
    }
    if pair in mapping:
        return mapping[pair]
    if key == "shop": return ("Comércio", "shop")
    if key == "office": return ("Empresa / escritório", "business")
    if key == "amenity": return ("Estabelecimento", "poi")
    if key in {"tourism", "leisure"}: return ("Local", "poi")
    if key == "building": return ("Edifício", "building")
    return ("Local", "poi")



def _searchbox_category(props):
    categories = props.get("poi_category") or []
    if isinstance(categories, str):
        categories = [categories]
    category_ids = props.get("poi_category_ids") or []
    if isinstance(category_ids, str):
        category_ids = [category_ids]
    values = " ".join(str(x).lower() for x in categories)
    ids = " ".join(str(x).lower().replace("_", " ") for x in category_ids)
    maki = str(props.get("maki") or "").lower()
    text = f"{values} {ids} {maki}"
    # Keep malls separate from ordinary stores. A query such as "shopping Butantã"
    # should rank the mall itself above shops located inside or near it.
    if any(n in text for n in ("shopping mall", "shopping center", "shopping centre", "mall")):
        return ("Shopping", "mall")
    mapping = [
        (("cinema", "movie", "theatre", "theater"), ("Cinema / entretenimento", "poi")),
        (("restaurant", "food", "cafe"), ("Restaurante", "food")),
        (("hospital", "clinic", "doctor"), ("Saúde", "hospital")),
        (("pharmacy",), ("Farmácia", "pharmacy")),
        (("school", "college", "university"), ("Educação", "school")),
        (("bank",), ("Banco", "bank")),
        (("fuel", "gas"), ("Posto", "fuel")),
        (("parking",), ("Estacionamento", "parking")),
        (("airport", "aerodrome", "airfield"), ("Aeroporto", "airport")),
        (("bus station", "transit station", "rail station", "station"), ("Terminal / estação", "terminal")),
        (("hotel", "lodging"), ("Hotel", "hotel")),
        (("park",), ("Parque", "park")),
        (("supermarket", "grocery"), ("Supermercado", "shop")),
        (("shop", "store", "retail"), ("Comércio", "shop")),
    ]
    for needles, result in mapping:
        if any(n in text for n in needles):
            return result
    return ("Empresa / local", "business")


SEARCH_CATEGORY_QUERY_TERMS = {
    "mall": {"shopping", "mall", "center", "centre", "centro", "comercial"},
    "hospital": {"hospital", "hospitais", "clinica", "clinicas", "medica", "medico", "upa"},
    "pharmacy": {"farmacia", "farmacias", "drogaria", "drogarias"},
    "school": {"escola", "colegio", "faculdade", "universidade", "etec", "senai", "educacao"},
    "airport": {"aeroporto", "airport", "aerodromo", "terminal", "aeroportuario"},
    "terminal": {"terminal", "rodoviaria", "estacao", "metro", "trem"},
    "parking": {"estacionamento", "parking", "garagem"},
    "fuel": {"posto", "combustivel", "gasolina", "etanol"},
    "food": {"restaurante", "restaurantes", "cafe", "cafeteria", "lanchonete"},
    "bank": {"banco", "agencia", "bancaria", "caixa", "eletronico"},
    "hotel": {"hotel", "pousada", "hostel"},
    "park": {"parque", "praca"},
    "shop": {"mercado", "supermercado", "loja", "comercio"},
}

# Canonical Search Box category ids. These are optional refinements: if Mapbox
# changes/doesn't support one, the normal text search still runs immediately after.
SEARCHBOX_CATEGORY_FILTERS = {
    "mall": "shopping_mall",
    "hospital": "hospital",
    "pharmacy": "pharmacy",
    "airport": "airport",
    "parking": "parking",
    "fuel": "gas_station",
    "hotel": "hotel",
    "park": "park",
}

def _query_entity_tokens(query, wanted_category=""):
    tokens = _search_tokens(query)
    category_terms = SEARCH_CATEGORY_QUERY_TERMS.get(str(wanted_category or ""), set())
    return [t for t in tokens if t not in category_terms]

def _token_coverage(tokens, value):
    if not tokens:
        return 0.0
    return sum(1 for token in tokens if _soft_token_match(token, value)) / max(1, len(tokens))

def _query_search_intent(query):
    raw = re.sub(r"\s+", " ", str(query or "").strip())
    meta = parse_brazil_location_query(raw)
    normalized = _search_normalize(raw)
    pure_cep = bool(meta.get("cep") and CEP_RE.fullmatch(raw))
    street_prefix = bool(re.match(
        r"\s*(?:rua|r\.?|avenida|av\.?|alameda|travessa|estrada|rodovia|street|st\.?|road|rd\.?|avenue|ave\.?|boulevard|blvd\.?|rue|route|chemin|quai|via|viale|corso|strada|calle|carrer|paseo|platz|strasse|straße|weg|gasse)\b",
        raw, re.I
    ))
    explicit_number = bool(re.search(r",\s*\d{1,6}[A-Za-z]?\s*$", raw) or HOUSE_NUMBER_RE.search(raw))
    shopping = bool(re.search(r"\b(?:shopping|shopping center|shopping centre|shopping mall|mall)\b", normalized))
    category_patterns = [
        ("mall", r"\b(?:shopping|shopping center|shopping centre|shopping mall|mall)\b"),
        ("hospital", r"\b(?:hospital|hospitais|clinica|clinica medica|pronto socorro|upa)\b"),
        ("pharmacy", r"\b(?:farmacia|farmacias|drogaria|drogarias)\b"),
        ("school", r"\b(?:escola|colegio|faculdade|universidade|etec|senai|educacao)\b"),
        ("airport", r"\b(?:aeroporto|airport|aerodromo|terminal aeroportuario)\b"),
        ("terminal", r"\b(?:terminal|rodoviaria|estacao|metro|trem)\b"),
        ("parking", r"\b(?:estacionamento|parking|garagem)\b"),
        ("fuel", r"\b(?:posto|combustivel|gasolina|etanol)\b"),
        ("food", r"\b(?:restaurante|restaurantes|cafe|cafeteria|lanchonete)\b"),
        ("bank", r"\b(?:banco|agencia bancaria|caixa eletronico)\b"),
        ("hotel", r"\b(?:hotel|pousada|hostel)\b"),
        ("park", r"\b(?:parque|praca)\b"),
        ("shop", r"\b(?:mercado|supermercado|loja|comercio)\b"),
    ]
    wanted_category = next((cat for cat, pattern in category_patterns if re.search(pattern, normalized)), "")
    if meta.get("cep"):
        kind = "cep_number" if meta.get("number") else "cep"
    elif street_prefix and explicit_number:
        kind = "address"
    elif street_prefix:
        kind = "street"
    elif explicit_number:
        kind = "address"
    else:
        kind = "poi"
    entity_tokens = _query_entity_tokens(raw, wanted_category)
    return {"kind": kind, "shopping": shopping, "wanted_category": wanted_category, "entity_tokens": entity_tokens, "meta": meta, "normalized": normalized, "pure_cep": pure_cep}

def _mapbox_searchbox_result(feature, query, proximity=None, provider_rank=0):
    props = feature.get("properties") or {}
    geometry = feature.get("geometry") or {}
    pair = geometry.get("coordinates") or []
    coords = props.get("coordinates") or {}
    lon = coords.get("longitude")
    lat = coords.get("latitude")
    if (lon is None or lat is None) and len(pair) >= 2:
        lon, lat = pair[0], pair[1]
    try:
        lon, lat = float(lon), float(lat)
    except (TypeError, ValueError):
        return None
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None

    routable = coords.get("routable_points") or []
    nav = next((x for x in routable if str(x.get("name") or "").lower() == "default"), None)
    if nav:
        try:
            nav_lon = float(nav.get("longitude")); nav_lat = float(nav.get("latitude"))
        except (TypeError, ValueError):
            nav_lon, nav_lat = lon, lat
    else:
        nav_lon, nav_lat = lon, lat

    feature_type = str(props.get("feature_type") or "poi")
    name = str(props.get("name_preferred") or props.get("name") or "Local").strip()
    full_address = str(props.get("full_address") or "").strip()
    place_formatted = str(props.get("place_formatted") or "").strip()
    address = full_address or place_formatted
    context = props.get("context") or {}
    postcode = str(((context.get("postcode") or {}).get("name") or "")).strip()
    street = str(((context.get("street") or {}).get("name") or "")).strip()
    address_ctx = context.get("address") or {}
    address_number = str(address_ctx.get("address_number") or "").strip()
    if not street:
        street = str(address_ctx.get("street_name") or "").strip()
    if feature_type == "poi":
        category, category_key = _searchbox_category(props)
    else:
        category = {"address":"Endereço","street":"Rua","postcode":"CEP","place":"Cidade","locality":"Local"}.get(feature_type, "Local")
        category_key = "address" if feature_type in {"address","street","postcode"} else "place"
    item = {
        "label": full_address or ", ".join(x for x in [name, place_formatted] if x) or name,
        "name": name,
        "address": address,
        "category": category,
        "category_key": category_key,
        "category_ids": ([str(props.get("poi_category_ids"))] if isinstance(props.get("poi_category_ids"), str) else [str(x) for x in (props.get("poi_category_ids") or [])])[:8],
        "lat": nav_lat, "lon": nav_lon,
        "display_lat": lat, "display_lon": lon,
        "entrance_lat": None, "entrance_lon": None,
        "type": feature_type,
        "mapbox_id": props.get("mapbox_id") or feature.get("id", ""),
        "postcode": postcode,
        "address_number": address_number,
        "street": street,
        "accuracy": str(coords.get("accuracy") or "point"),
        "match_confidence": "",
        "precision_label": category,
        "source": "mapbox-searchbox",
        "cep_query": False,
        "rank": float(provider_rank),
    }
    if proximity:
        try:
            d = haversine_m(float(proximity[1]), float(proximity[0]), nav_lat, nav_lon)
            item["distance_m"] = round(d)
        except Exception:
            pass
    return item


def mapbox_searchbox_forward(query, proximity=None, language=None, *, poi_category=None, types=None, rank_offset=0):
    """POI/business + address search using Mapbox Search Box /forward.

    ``poi_category`` is used for strong category intent (for example a shopping
    mall). We still run the unfiltered request as a fallback/secondary source.
    """
    raw = re.sub(r"\s+", " ", (query or "").strip())[:240]
    if not raw or not mapbox_ready():
        return []
    context = _international_query_context(raw)
    params = {
        "q": raw,
        "limit": 10,
        "language": (language or preferred_language()).split("-", 1)[0].lower(),
        "types": types or "poi,address,street,postcode,place,locality,neighborhood",
        "auto_complete": "true",
    }
    if poi_category:
        params["poi_category"] = str(poi_category)[:120]
    if context.get("country"):
        params["country"] = context["country"].lower()
    # An explicit foreign country should beat the user's current GPS bias.
    if proximity and not context.get("country"):
        params["proximity"] = f"{float(proximity[0]):.6f},{float(proximity[1]):.6f}"
    payload = mapbox_get(f"{MAPBOX_SEARCHBOX_URL}/forward", params, timeout=5.5)
    out = []
    for idx, feature in enumerate((payload.get("features") or [])[:10]):
        item = _mapbox_searchbox_result(feature, raw, proximity, provider_rank=rank_offset + idx * 2)
        if item:
            if poi_category:
                item["category_filtered"] = True
            out.append(item)
    return out


def _combined_search_rank(item, query, proximity=None):
    if item.get("source") == "cep-authoritative":
        return -500.0
    intent = _query_search_intent(query)
    base = float(item.get("rank", 100))
    qtokens = _search_tokens(query)
    name = item.get("name") or str(item.get("label") or "").split(",", 1)[0]
    qn = _search_normalize(query)
    nn = _search_normalize(name)
    streetn = _search_normalize(item.get("street") or "")
    labeln = _search_normalize(item.get("label") or "")
    combined = _search_normalize(" ".join([str(name), str(item.get("address") or ""), str(item.get("label") or "")]))
    name_hits = sum(1 for t in qtokens if _soft_token_match(t, nn))
    all_hits = sum(1 for t in qtokens if _soft_token_match(t, combined))
    name_ratio = name_hits / max(1, len(qtokens))
    all_ratio = all_hits / max(1, len(qtokens))
    base += (1 - all_ratio) * 70
    base += (1 - name_ratio) * 24

    # Exact typed wording beats provider popularity. This is what keeps a named
    # mall/street on top instead of a loosely related commerce result.
    if qn and nn == qn:
        base -= 82
    elif qn and (nn.startswith(qn) or qn.startswith(nn)):
        base -= 48
    elif qn and qn in nn:
        base -= 40
    elif qtokens and name_hits == len(qtokens):
        base -= 34

    kind = intent["kind"]
    item_type = str(item.get("type") or "")
    category_key = str(item.get("category_key") or "")
    category_text = _search_normalize(item.get("category") or "")
    entity_tokens = list(intent.get("entity_tokens") or [])
    entity_name_coverage = _token_coverage(entity_tokens, nn) if entity_tokens else 0.0
    entity_context_coverage = _token_coverage(entity_tokens, labeln) if entity_tokens else 0.0

    if kind in {"cep", "cep_number"}:
        wanted_cep = str(intent["meta"].get("cep") or "")
        got_cep = re.sub(r"\D", "", str(item.get("postcode") or ""))
        if got_cep == wanted_cep:
            base -= 95
        else:
            base += 180
        if kind == "cep_number":
            wanted_number = str(intent["meta"].get("number") or "").lower()
            got_number = str(item.get("address_number") or "").lower()
            if got_number == wanted_number:
                base -= 75
            elif item.get("number_unverified"):
                base += 16
            elif got_number:
                base += 160
            if item_type not in {"address", "postcode", "street"}:
                base += 160
    elif kind in {"street", "address"}:
        if item_type in {"street", "address"}:
            base -= 45
        elif item_type == "poi":
            base += 72
        street_query = re.sub(r"^(?:rua|r|avenida|av|alameda|travessa|estrada|rodovia)\s+", "", qn).strip()
        street_candidate = re.sub(r"^(?:rua|r|avenida|av|alameda|travessa|estrada|rodovia)\s+", "", streetn or nn).strip()
        if street_query and street_candidate == street_query:
            base -= 72
        elif street_query and street_candidate.startswith(street_query):
            base -= 38
        if kind == "address" and item_type != "address":
            base += 28
    else:
        # Named places/businesses must stay places/businesses. Do not let a street
        # or generic locality outrank a POI just because it is geographically close.
        if item_type == "poi":
            base -= 42
        elif item_type in {"street", "address", "postcode"}:
            base += 66

        wanted = str(intent.get("wanted_category") or "")
        compatible = {
            "mall": {"mall"}, "hospital": {"hospital"}, "pharmacy": {"pharmacy"},
            "school": {"school"}, "airport": {"airport"}, "terminal": {"terminal"},
            "parking": {"parking"}, "fuel": {"fuel"}, "food": {"food"},
            "bank": {"bank"}, "hotel": {"hotel"}, "park": {"park"},
            "shop": {"shop", "mall"},
        }.get(wanted, {wanted} if wanted else set())
        category_match = bool(wanted and category_key in compatible)

        if wanted:
            if category_match:
                base -= 98
            elif item_type == "poi":
                base += 64
            else:
                base += 90

            # Critical relevance rule: entity words (e.g. "Butantã" in
            # "Shopping Butantã") need to occur in the POI *name*. If they only
            # occur in the address/context, the result is probably a store located
            # inside the requested mall rather than the mall itself.
            if entity_tokens:
                if entity_name_coverage >= 0.999:
                    base -= 74 if category_match else 24
                elif entity_name_coverage >= 0.5:
                    base -= 30 if category_match else 4
                elif entity_context_coverage >= 0.999:
                    base += 155 if item_type == "poi" else 80
                elif entity_context_coverage >= 0.5:
                    base += 92 if item_type == "poi" else 48
                else:
                    base += 118

            if category_match and (not entity_tokens or entity_name_coverage >= 0.999):
                item["match_kind"] = "primary"
                item["match_reason"] = "Nome e categoria correspondem à busca"
            elif item_type == "poi" and entity_tokens and entity_name_coverage < 0.5 and entity_context_coverage >= 0.5:
                item["match_kind"] = "related"
                item["match_reason"] = "Local relacionado à região pesquisada"
        elif qtokens:
            # Generic named-place searches still favor name matches over words that
            # only appear in the address/context.
            if name_ratio >= 0.999:
                base -= 38
                item.setdefault("match_kind", "primary")
                item.setdefault("match_reason", "Nome corresponde à busca")
            elif name_ratio < 0.34 and all_ratio >= 0.67:
                base += 48
                item.setdefault("match_kind", "related")

        if intent["shopping"]:
            if category_key == "mall" or category_text == "shopping":
                base -= 72
            elif category_key in {"shop", "food", "bank", "pharmacy"}:
                base += 72
            else:
                base += 22
            if "shopping" in nn or "mall" in nn:
                base -= 34

    # Proximity decides between equally relevant alternatives, not between an
    # exact semantic match and an unrelated nearby place.
    if proximity:
        try:
            if item.get("distance_m") is None:
                d = haversine_m(float(proximity[1]), float(proximity[0]), float(item["lat"]), float(item["lon"]))
                item["distance_m"] = round(d)
            else:
                d = float(item.get("distance_m") or 0)
            base += min(22, math.log1p(max(0, d) / 700.0) * 3.2)
        except Exception:
            pass
    return round(base, 3)

def smart_location_search(query, proximity=None):
    """Intent-aware location search.

    CEP/house-number queries are resolved as addresses; street queries prioritize
    the matching street; named places (shopping, hospital, school, business, etc.)
    prioritize POIs. Distance only breaks ties among semantically relevant hits.
    """
    cache_key = _search_cache_key(query, proximity)
    cached = _search_cache_get(cache_key)
    if cached is not None:
        return cached

    intent = _query_search_intent(query)
    query_meta = intent["meta"]
    international = _international_query_context(query)
    search_language = preferred_language()
    effective_proximity = None if international.get("country") else proximity
    candidates = []
    errors = []

    def collect(fn, label):
        try:
            rows = fn() or []
            candidates.extend(rows)
            return bool(rows)
        except Exception as exc:
            errors.append(f"{label}: {exc}")
            return False

    kind = intent["kind"]
    if kind in {"cep", "cep_number", "address", "street"}:
        collect(lambda: mapbox_forward_geocode(query, effective_proximity, search_language), "geocode")
        # For a street/address query Search Box is only a secondary source. It can
        # recover named buildings without being allowed to dominate the ranking.
        if kind in {"address", "street"} and mapbox_ready():
            collect(lambda: mapbox_searchbox_forward(query, effective_proximity, search_language), "searchbox-secondary")
    else:
        # Strong category intent gets a category-filtered POI request first. For
        # example, "Shopping Butantã" asks Mapbox for shopping_mall POIs before
        # the generic text search, preventing shops inside the mall from winning.
        wanted = str(intent.get("wanted_category") or "")
        category_filter = SEARCHBOX_CATEGORY_FILTERS.get(wanted)
        if mapbox_ready() and category_filter:
            collect(lambda: mapbox_searchbox_forward(
                query, effective_proximity, search_language,
                poi_category=category_filter, types="poi", rank_offset=-30
            ), "searchbox-category")
        # Generic Search Box remains as coverage/fallback and Geocoding supplies
        # locality/street fallbacks.
        if mapbox_ready():
            collect(lambda: mapbox_searchbox_forward(query, effective_proximity, search_language), "searchbox")
        collect(lambda: mapbox_forward_geocode(query, effective_proximity, search_language), "geocode-secondary")

    merged, seen = [], set()
    for item in candidates:
        try:
            lat, lon = float(item["lat"]), float(item["lon"])
        except Exception:
            continue
        name_key = _search_normalize(item.get("name") or str(item.get("label") or "").split(",", 1)[0])
        key = item.get("mapbox_id") or f"{round(lat,5)}:{round(lon,5)}:{name_key[:90]}"
        if item.get("source") == "cep-authoritative":
            key = f"cep:{query_meta.get('cep')}:{query_meta.get('number') or ''}"
        if key in seen:
            continue
        seen.add(key)
        item["rank"] = _combined_search_rank(item, query, effective_proximity)
        merged.append(item)

    merged.sort(key=lambda x: (float(x.get("rank", 9999)), float(x.get("distance_m", 1e12)), str(x.get("label", ""))))

    # When a strong primary entity exists, results that only match because they
    # are *inside/near* that entity are still useful, but they belong at the end.
    # This makes "Shopping X" show the shopping itself before its stores.
    if kind == "poi" and any(x.get("match_kind") == "primary" for x in merged):
        primary = [x for x in merged if x.get("match_kind") == "primary"]
        neutral = [x for x in merged if x.get("match_kind") not in {"primary", "related"}]
        related = [x for x in merged if x.get("match_kind") == "related"]
        merged = primary + neutral + related

    # CEP + number: if the authoritative canonical result exists, it must be the
    # first thing the UI sees and it must visibly preserve the typed number.
    if kind in {"cep", "cep_number"}:
        authoritative = [x for x in merged if x.get("source") == "cep-authoritative"]
        rest = [x for x in merged if x.get("source") != "cep-authoritative"]
        if authoritative:
            merged = authoritative + rest

    final = merged[:10]
    for item in final:
        item.pop("rank", None)
    if final:
        _search_cache_set(cache_key, final)
        return final
    if errors:
        raise RuntimeError(" | ".join(errors[:2]))
    return []

def mapbox_forward_geocode(query, proximity=None, language=None):
    query_meta = parse_brazil_location_query(query)
    raw = query_meta["raw"]
    if not raw:
        return []
    features = []
    cep_info = lookup_brazil_cep(query_meta["cep"]) if query_meta.get("cep") else None

    context = _international_query_context(raw)
    base = {
        "limit": 10,
        "language": language or preferred_language(),
        "entrances": "true",
    }
    # Brazilian CEP remains deliberately constrained to BR; every other query is global
    # unless the user explicitly wrote a country name such as Portugal/France/UK.
    if query_meta.get("cep"):
        base["country"] = "br"
    elif context.get("country"):
        base["country"] = context["country"].lower()
    if proximity and not context.get("country"):
        base["proximity"] = f"{float(proximity[0]):.6f},{float(proximity[1]):.6f}"

    # CEP + número usa Structured Input: é a forma mais forte de dizer ao geocoder
    # qual token é número, rua, cidade, estado e código postal.
    if cep_info and cep_info.get("street"):
        structured = dict(base)
        structured["autocomplete"] = "false"
        structured["street"] = cep_info["street"]
        structured["postcode"] = query_meta["cep"]
        if query_meta.get("number"): structured["address_number"] = query_meta["number"]
        if cep_info.get("city"): structured["place"] = cep_info["city"]
        if cep_info.get("state"): structured["region"] = cep_info["state"]
        if cep_info.get("neighborhood"): structured["neighborhood"] = cep_info["neighborhood"]
        try:
            features.extend((mapbox_get(f"{MAPBOX_GEOCODING_URL}/forward", structured, timeout=5.5).get("features") or [])[:7])
        except Exception:
            pass

    normalized, _ = normalize_location_query(raw)
    general = dict(base)
    general.update({
        "q": normalized,
        "autocomplete": "true",
        "types": "address,street,postcode,place,locality,neighborhood,district,region,country",
    })
    try:
        features.extend((mapbox_get(f"{MAPBOX_GEOCODING_URL}/forward", general, timeout=5.5).get("features") or [])[:10])
    except Exception:
        # Se a consulta estruturada já trouxe resultados, não falhamos a busca inteira.
        if not features:
            raise

    results = []
    seen = set()
    for feature in features:
        item = _mapbox_result(feature, query_meta)
        if not item:
            continue
        key = item.get("mapbox_id") or f"{item['lat']:.6f},{item['lon']:.6f}:{item['label'].lower()}"
        if key in seen:
            continue
        seen.add(key)
        item["rank"] = _result_rank(item, query_meta)
        results.append(item)

    # O fallback de CEP é intencionalmente identificado como aproximado. Nunca
    # afirmamos que o centroide do CEP é o número digitado.
    if not results and cep_info and cep_info.get("lat") is not None and cep_info.get("lon") is not None:
        try:
            lat, lon = float(cep_info["lat"]), float(cep_info["lon"])
            cep_fmt = f"{query_meta['cep'][:5]}-{query_meta['cep'][5:]}"
            pieces = [cep_info.get("street"), cep_info.get("neighborhood"), f"{cep_info.get('city','')} - {cep_info.get('state','')}".strip(" -"), cep_fmt]
            label = ", ".join(x for x in pieces if x)
            results.append({
                "label": label or cep_fmt, "lat": lat, "lon": lon,
                "display_lat": lat, "display_lon": lon, "entrance_lat": None, "entrance_lon": None,
                "type": "postcode", "mapbox_id": "", "postcode": cep_fmt,
                "address_number": "", "street": cep_info.get("street") or "",
                "accuracy": "approximate", "match_confidence": "",
                "precision_label": (f"CEP localizado; nº {query_meta['number']} não confirmado" if query_meta.get("number") else "centro aproximado do CEP"),
                "number_unverified": bool(query_meta.get("number")), "source": "cep-fallback",
                "cep_query": True, "rank": 999,
            })
        except Exception:
            pass

    results.sort(key=lambda x: (x.get("rank", 999), x.get("label", "")))
    if query_meta.get("cep") and query_meta.get("number"):
        wanted_cep = query_meta["cep"]
        wanted_number = str(query_meta["number"]).lower()
        strict = []
        for item in results:
            got_cep = re.sub(r"\D", "", item.get("postcode") or "")
            got_number = str(item.get("address_number") or "").lower()
            number_ok = got_number == wanted_number or item.get("address_number_match") in {"matched", "plausible"}
            cep_ok = got_cep == wanted_cep or item.get("postcode_match") == "matched"
            if item.get("type") == "address" and number_ok and cep_ok:
                strict.append(item)
        if strict:
            # Evita exibir números claramente diferentes quando a consulta já trouxe
            # candidatos coerentes com CEP + número.
            results = strict + [x for x in results if x.get("type") in {"street", "postcode"}][:2]
        else:
            # Precisão > palpite: quando o número não pôde ser confirmado, removemos
            # endereços com outro número e mostramos apenas a rua/CEP coerente. Isso
            # evita navegar silenciosamente para o imóvel errado.
            safe = []
            for item in results:
                got_cep = re.sub(r"\D", "", item.get("postcode") or "")
                cep_ok = got_cep == wanted_cep or item.get("postcode_match") == "matched"
                if item.get("type") in {"street", "postcode"} and cep_ok:
                    item["number_unverified"] = True
                    item["precision_label"] = f"CEP localizado; nº {query_meta['number']} não confirmado"
                    safe.append(item)
            if safe:
                results = safe[:3]
            elif cep_info and cep_info.get("lat") is not None and cep_info.get("lon") is not None:
                try:
                    lat, lon = float(cep_info["lat"]), float(cep_info["lon"])
                    cep_fmt = f"{wanted_cep[:5]}-{wanted_cep[5:]}"
                    pieces = [cep_info.get("street"), cep_info.get("neighborhood"), f"{cep_info.get('city','')} - {cep_info.get('state','')}".strip(" -"), cep_fmt]
                    results = [{
                        "label": ", ".join(x for x in pieces if x) or cep_fmt,
                        "lat": lat, "lon": lon, "display_lat": lat, "display_lon": lon,
                        "entrance_lat": None, "entrance_lon": None, "type": "postcode", "mapbox_id": "",
                        "postcode": cep_fmt, "address_number": "", "street": cep_info.get("street") or "",
                        "accuracy": "approximate", "match_confidence": "", "address_number_match": "",
                        "street_match": "", "postcode_match": "matched",
                        "precision_label": f"CEP localizado; nº {query_meta['number']} não confirmado",
                        "number_unverified": True, "source": "cep-fallback", "cep_query": True,
                    }]
                except Exception:
                    results = []
            else:
                results = []

    # Pure CEP must always display the canonical postal street/address first, even
    # if a geocoder returns a nearby POI or a differently formatted street label.
    if query_meta.get("cep") and cep_info:
        canonical = _cep_authoritative_result(cep_info, query_meta, results, proximity)
        if canonical:
            results = [canonical] + [x for x in results if x.get("source") != "cep-authoritative"]

    for item in results:
        item.pop("rank", None)
    return results[:10]


def mapbox_reverse_geocode(lon, lat):
    data = mapbox_get(f"{MAPBOX_GEOCODING_URL}/reverse", {
        "longitude": float(lon),
        "latitude": float(lat),
        "language": mapbox_language(),
    })
    features = data.get("features", [])
    if not features:
        return f"{lat:.5f}, {lon:.5f}"
    props = features[0].get("properties") or {}
    return props.get("full_address") or ", ".join(x for x in [props.get("name_preferred") or props.get("name"), props.get("place_formatted")] if x) or f"{lat:.5f}, {lon:.5f}"

