"""Regression checks for CSP nonce placement and a user-content XSS sink."""
from pathlib import Path
from types import SimpleNamespace

from jinja2 import Environment

from vano.security.csp_templates import TrustedInlineNonceExtension


ROOT = Path(__file__).resolve().parents[1]


def _render(source, nonce, **values):
    env = Environment(extensions=[TrustedInlineNonceExtension], autoescape=True)
    template = env.from_string(source)
    return template.render(g=SimpleNamespace(csp_nonce=nonce), **values)


def test_nonce_only_authorizes_trusted_template_tags():
    html = _render(
        '<script>window.VANO_BOOT=true;</script>'
        '<div>{{ user_html | safe }}</div>'
        '<style>.map{display:block}</style>',
        "random-token",
        user_html="<script>window.evil=true;</script>",
    )
    assert '<script nonce="random-token">window.VANO_BOOT=true;</script>' in html
    assert '<style nonce="random-token">.map{display:block}</style>' in html
    assert '<script>window.evil=true;</script>' in html
    assert html.count('nonce="random-token"') == 2


def test_nonce_is_bound_at_render_time_not_compilation_time():
    env = Environment(extensions=[TrustedInlineNonceExtension], autoescape=True)
    template = env.from_string('<script src="/static/vano-map.js"></script>')
    first = template.render(g=SimpleNamespace(csp_nonce="nonce-one"))
    second = template.render(g=SimpleNamespace(csp_nonce="nonce-two"))
    assert 'nonce="nonce-one"' in first
    assert 'nonce="nonce-two"' in second
    assert 'nonce="nonce-one"' not in second


def test_nonced_tags_are_not_duplicated_and_script_strings_are_untouched():
    html = _render(
        '<script nonce="fixed">const example = "<script>";</script>'
        '<script>window.vanoReady=true;</script>',
        "runtime-nonce",
    )
    assert html.count('nonce="fixed"') == 1
    assert 'const example = "<script>";' in html
    assert html.count('nonce="runtime-nonce"') == 1


def test_no_post_render_nonce_rewrite_or_untrusted_language_html_sink():
    headers = (ROOT / "vano/security/headers.py").read_text(encoding="utf-8")
    profile = (ROOT / "static/vano-profile.js").read_text(encoding="utf-8")
    app = (ROOT / "app.py").read_text(encoding="utf-8")
    assert 'response.set_data(html)' not in headers
    assert "TrustedInlineNonceExtension" in app
    assert "languageSummary.innerHTML" not in profile
    assert "languageSummary.replaceChildren(flag,name,region)" in profile
