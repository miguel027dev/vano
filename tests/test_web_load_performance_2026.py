"""Regression checks for fast public website rendering.

These prove that purely editorial pages do not pull the map's 2.34 MB
legacy stylesheet while navigation, benchmark, and account screens keep it.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def read(path):
    return (ROOT / path).read_text(encoding="utf-8")

def test_public_reading_endpoints_exclude_map_stylesheet():
    base = read("templates/base.html")
    assert "vano_light_public_surface" in base
    expected = (
        "what_is_vano", "seo_waze_alternative", "seo_google_maps_alternative",
        "seo_avoid_traffic", "seo_fastest_route", "seo_motorcycle_gps",
        "privacy_policy", "terms_of_use", "about", "sobre",
        "account_delete_page", "help_page",
    )
    for endpoint in expected:
        assert "'" + endpoint + "'" in base.split("vano_light_public_surface =", 1)[1].split("] %}", 1)[0]
    assert "'route_benchmark_page'" not in base.split("vano_light_public_surface =", 1)[1].split("] %}", 1)[0]
    assert "{% if not vano_light_public_surface %}" in base
    assert "vano-foundation.css" in base

def test_public_header_does_not_request_two_large_png_banners():
    base = read("templates/base.html")
    assert "vano-nav-brand-lite" in base
    assert "{% if vano_map_surface %}" in base
    assert "vano-maps-icon-64.png" in base

def test_static_assets_use_build_fingerprinted_cache_policy():
    headers = read("vano/security/headers.py")
    worker = read("static/vano-sw.js")
    assert "requested_build == current_build" in headers
    assert 're.fullmatch(r"[a-fA-F0-9]{7,40}", current_build)' in headers
    assert '"public, max-age=2592000, immutable"' in headers
    assert '"public, max-age=0, must-revalidate"' in headers
    assert "cache.match(req)" in worker
    assert "url.searchParams.get('v')" in worker
    assert "if(versioned)" in worker

def test_worker_registration_not_on_reading_pages():
    base = read("templates/base.html")
    assert "{% if vano_map_surface %}\n<script>if('serviceWorker' in navigator)" in base
    assert "requestIdleCallback(register,{timeout:3000})" in base

def test_html_server_timing_is_observable():
    headers = read("vano/security/headers.py")
    assert '"Server-Timing"' in headers
    assert "perf_counter()" in headers

def test_all_public_pages_have_independent_styles_in_foundation():
    css = read("static/vano-foundation.css")
    for feature in (
        "VANO lightweight public reading layout",
        ".legal-request .form-grid",
        ".legal-shell .public-split",
        ".vano-seo .seo-wrap",
        ".faq-group",
        ".legal-layout",
    ):
        assert feature in css

def test_sample_public_routes_render_without_legacy_css():
    import app as vano_app

    client = vano_app.app.test_client()
    for url in ("/rota-mais-rapida", "/termos-de-uso", "/help"):
        response = client.get(url)
        assert response.status_code == 200, (url, response.status_code)
        html = response.get_data(as_text=True)
        assert "vano-foundation.css" in html
        assert 'filename=\'vano.css\'' not in html
        assert "/static/vano.css" not in html
        assert "vano-nav-brand-lite" in html
        assert "Server-Timing" in response.headers
