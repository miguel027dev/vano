"""Contracts for VANO's 2026 public/SEO and onboarding refresh."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

PUBLIC_TEMPLATES = (
    "seo_o_que_e_vano.html",
    "seo_alternativa_waze.html",
    "seo_alternativa_google_maps.html",
    "seo_evitar_transito.html",
    "seo_rota_mais_rapida.html",
    "seo_gps_moto.html",
    "privacy_policy.html",
    "terms_of_use.html",
    "about.html",
    "sobre.html",
    "account_delete_page.html",
    "help.html",
    "benchmark_de_rotas.html",
)


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_public_pages_have_accessible_breadcrumbs_and_real_headings():
    for filename in PUBLIC_TEMPLATES:
        page = read("templates/" + filename)
        assert 'class="vano-public-breadcrumb"' in page, filename
        assert 'aria-label="Trilha de navegação"' in page, filename
        assert 'aria-current="page"' in page, filename
        assert "<h1" in page, filename
        assert "conteudo-principal" in page, filename


def test_public_design_is_scope_limited_and_responsive():
    base = read("templates/base.html")
    css = read("static/vano-public-refresh.css")
    assert "not vano_map_surface and not vano_admin_surface" in base
    assert "vano-public-refresh.css" in base
    assert "vano-public-refresh.js" in base
    for selector in (
        ".vano-seo .seo-wrap",
        ".legal-shell",
        ".legal-toc",
        ".faq-search",
        ".bench-public-hero",
        ".bench261-table-wrap",
        ".ob500-map-grid",
    ):
        assert selector in css
    for size in ("max-width:980px", "max-width:740px", "max-width:380px"):
        assert size in css
    assert "min-height:48px" in css
    assert "env(safe-area-inset-bottom)" in css


def test_discovery_semantics_stay_intact():
    base = read("templates/base.html")
    assert 'rel="canonical"' in base
    assert 'name="robots"' in base
    assert "BreadcrumbList" in base
    assert "'item':seo_canonical_url" in base
    for filename in PUBLIC_TEMPLATES:
        page = read("templates/" + filename)
        assert "{% block title %}" in page
        assert "{% block meta_description %}" in page


def test_onboarding_progress_keyboard_and_privacy_explanation():
    template = read("templates/onboarding.html")
    js = read("static/vano-onboarding.js")
    assert 'role="progressbar"' in template
    assert 'aria-valuenow="33"' in template
    assert 'id="obStepAnnouncement"' in template
    assert "presença pública no mapa permanece desativada" in template
    for i in (1, 2, 3):
        assert f'id="obTitle{i}" tabindex="-1"' in template
    assert "progressTrack?.setAttribute('aria-valuenow'" in js
    assert "heading?.focus({preventScroll:true})" in js
    assert "editable?.setAttribute('aria-invalid','true')" in js
    assert "target?.removeAttribute?.('aria-invalid')" in js


def test_semantic_navigation_enhancement_works_without_content_rewrite():
    js = read("static/vano-public-refresh.js")
    assert "'IntersectionObserver' in window" in js
    assert "aria-current','location'" in js
    assert "requestAnimationFrame(updateProgress)" in js
    assert "nav.setAttribute('aria-label','Assuntos desta página')" in js
