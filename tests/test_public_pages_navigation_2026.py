"""Regressions for lightweight VANO public pages and their shared navigation.

Static assertions complement browser checks; they do not certify pixel layout.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

PUBLIC_PATHS = (
    "/help",
    "/termos-de-uso",
    "/politica-de-privacidade",
    "/excluir-conta",
    "/about",
    "/sobre",
    "/o-que-e-vano-maps",
    "/alternativa-ao-waze",
    "/alternativa-ao-google-maps",
    "/rota-mais-rapida",
    "/rotas-para-evitar-transito",
    "/gps-para-moto",
)


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_header_switches_to_public_menu_at_the_same_breakpoint_as_links():
    base = read("templates/base.html")
    css = read("static/vano-foundation.css")
    assert 'aria-label="Navegação principal"' in base
    assert "Abrir menu de navegação" in base
    assert ">Recursos</a>" not in base
    assert base.count('href="{{ url_for(\'help_page\') }}">Ajuda</a>') >= 1
    assert "@media(max-width:980px)" in css
    assert "body.vano-page-surface .navlinks {display:none!important;}" in css
    assert "body.vano-page-surface .vano-support-menu {display:block!important;}" in css
    assert ".vano-support-menu[open] summary" in css


def test_public_theme_and_mobile_dock_are_scoped():
    css = read("static/vano-foundation.css")
    assert 'html[data-vano-theme="black"]' in css
    assert "body.vano-page-surface .mobile-dock" in css
    assert "background:var(--ui-surface)!important" in css
    assert "body.vano-page-surface.vano-signed-in" in css
    assert 'body.vano-page-surface .navlinks a[aria-current="page"]' in css


def test_legal_toc_has_links_for_all_sections():
    for filename in ("terms_of_use.html", "privacy_policy.html", "account_delete_page.html"):
        page = read("templates/" + filename)
        sections = set(re.findall(r'<section\s+id="([^"]+)"', page))
        anchors = set(re.findall(r'href="#([^"]+)"', page))
        assert sections, filename
        assert sections.issubset(anchors), (filename, sorted(sections - anchors))


def test_help_search_is_keyboard_and_screen_reader_accessible():
    html = read("templates/help.html")
    css = read("static/vano-foundation.css")
    assert 'aria-controls="faqList"' in html
    assert 'aria-describedby="faqSearchStatus"' in html
    assert 'id="faqSearchStatus"' in html
    assert 'aria-live="polite"' in html
    assert "input.addEventListener('search',update)" in html
    assert "event.key==='Escape'" in html
    assert ".faq details[hidden]" in css
    assert ".help-actions b" in css


def test_privacy_request_preserves_csrf_and_semantic_fields():
    html = read("templates/privacy_policy.html")
    assert 'name="csrf_token"' in html
    assert 'url_for(\'privacy_request_create\')' in html
    assert 'type="email"' in html
    assert 'name="request_type"' in html
    assert 'name="message"' in html
    assert 'type="submit"' in html


def test_all_public_routes_render_with_metadata_and_without_map_css():
    import app as vano_app

    client = vano_app.app.test_client()
    for path in PUBLIC_PATHS:
        response = client.get(path)
        assert response.status_code == 200, (path, response.status_code)
        html = response.get_data(as_text=True)
        assert '<meta name="description"' in html, path
        assert '<link rel="canonical"' in html, path
        assert 'property="og:title"' in html, path
        assert 'name="twitter:card"' in html, path
        assert 'vano-foundation.css' in html, path
        assert '/static/vano.css' not in html, path
        assert 'class="vano-support-menu"' in html, path
        assert 'aria-label="Navegação principal"' in html, path
