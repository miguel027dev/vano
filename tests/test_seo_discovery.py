from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_priority_discovery_pages_are_registered_and_canonical():
    config = (ROOT / "vano" / "config.py").read_text(encoding="utf-8")
    routes = (ROOT / "vano" / "routes" / "public.py").read_text(encoding="utf-8")
    expected = {
        "seo_fastest_route": "/rota-mais-rapida",
        "seo_google_maps_alternative": "/alternativa-ao-google-maps",
        "seo_motorcycle_gps": "/gps-para-moto",
    }
    for endpoint, path in expected.items():
        assert endpoint in config
        assert f'"{endpoint}": "{path}"' in config
        assert f'@app.route("{path}")' in routes


def test_sitemap_covers_discovery_cluster_with_lastmod():
    sitemap = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
    for path in (
        "/o-que-e-vano-maps",
        "/alternativa-ao-waze",
        "/rotas-para-evitar-transito",
        "/rota-mais-rapida",
        "/alternativa-ao-google-maps",
        "/gps-para-moto",
    ):
        assert f"__PUBLIC_SITE_URL__{path}" in sitemap
    assert "<lastmod>2026-10-03</lastmod>" in sitemap


def test_oai_searchbot_is_explicitly_allowed_without_private_routes():
    robots = (ROOT / "robots.txt").read_text(encoding="utf-8")
    assert "User-agent: OAI-SearchBot" in robots
    oai = robots.split("User-agent: OAI-SearchBot", 1)[1].split("User-agent: *", 1)[0]
    assert "Allow: /" in oai
    for path in ("/admin", "/api/", "/profile", "/onboarding", "/auth/"):
        assert f"Disallow: {path}" in oai


def test_home_explains_navigation_entity_and_seo_pages_cross_link():
    index = (ROOT / "templates" / "index.html").read_text(encoding="utf-8")
    assert "GPS, rotas rápidas e trânsito em tempo real" in index
    assert "'@type':'SoftwareApplication'" in index
    partial = (ROOT / "templates" / "_seo_links.html").read_text(encoding="utf-8")
    for endpoint in (
        "seo_fastest_route",
        "seo_avoid_traffic",
        "seo_waze_alternative",
        "seo_google_maps_alternative",
        "seo_motorcycle_gps",
        "route_benchmark_page",
    ):
        assert f"url_for('{endpoint}')" in partial


def test_discovery_pages_use_existing_seo_design_system():
    for name in (
        "seo_o_que_e_vano.html",
        "seo_alternativa_waze.html",
        "seo_evitar_transito.html",
        "seo_rota_mais_rapida.html",
        "seo_alternativa_google_maps.html",
        "seo_gps_moto.html",
    ):
        text = (ROOT / "templates" / name).read_text(encoding="utf-8")
        assert 'class="vano-seo"' in text
        assert 'class="seo-wrap"' in text
        assert "_seo_links.html" in text
