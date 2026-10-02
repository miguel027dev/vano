from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_localization_does_not_block_first_paint_for_pt_br():
    base = (ROOT / "templates" / "base.html").read_text(encoding="utf-8")
    assert "active_locale != 'pt-BR'" in base
    assert "<script defer src=\"{{ url_for('static', filename='vano-i18n.js')" in base


def test_onboarding_uses_lightweight_brand_and_single_stylesheet():
    page = (ROOT / "templates" / "onboarding.html").read_text(encoding="utf-8")
    assert "vano-maps-banner.png" not in page
    assert "vano-maps-banner-dark.png" not in page
    assert "vano-maps-icon-64.png" in page
    assert "vano-onboarding-base.css" not in page
    assert "vano-auth-startup.css" not in page
    assert "vano-auth-experience.css" not in page


def test_onboarding_assets_have_a_reasonable_budget():
    css = ROOT / "static" / "vano-onboarding.css"
    js = ROOT / "static" / "vano-onboarding.js"
    assert css.stat().st_size < 60_000
    assert js.stat().st_size < 25_000


def test_global_onboarding_does_not_pull_heavy_app_shell():
    base = (ROOT / "templates" / "base.html").read_text(encoding="utf-8")
    assert "vano_endpoint != 'onboarding' %}<link rel=\"stylesheet\" href=\"{{ url_for('static', filename='vano-app.css')" in base
    assert "vano_endpoint != 'onboarding' %}<link rel=\"stylesheet\" href=\"{{ url_for('static', filename='vano-color-system.css')" in base
