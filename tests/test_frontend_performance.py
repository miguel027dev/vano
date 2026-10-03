from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def test_localization_does_not_block_first_paint_for_pt_br():
    base = (ROOT / "templates" / "base.html").read_text(encoding="utf-8")
    assert "active_locale != 'pt-BR'" in base
    assert "<script defer src=\"{{ url_for('static', filename='vano-i18n.js')" in base


def test_repository_has_one_canonical_stylesheet():
    css_files = sorted(p.name for p in (ROOT / "static").glob("*.css"))
    assert css_files == ["vano.css"]


def test_templates_reference_only_canonical_local_stylesheet():
    refs = set()
    pattern = re.compile(r"filename=['\"]([^'\"]+\.css)['\"]")
    for path in (ROOT / "templates").glob("*.html"):
        refs.update(pattern.findall(path.read_text(encoding="utf-8", errors="ignore")))
    assert refs == {"vano.css"}


def test_onboarding_stays_lightweight_outside_shared_stylesheet():
    page = (ROOT / "templates" / "onboarding.html").read_text(encoding="utf-8")
    assert "vano-maps-banner.png" not in page
    assert "vano-maps-banner-dark.png" not in page
    assert "vano-maps-icon-64.png" in page
    js = ROOT / "static" / "vano-onboarding.js"
    assert js.stat().st_size < 25_000


def test_canonical_stylesheet_has_reasonable_repository_budget():
    css = ROOT / "static" / "vano.css"
    assert css.exists()
    assert css.stat().st_size < 3_000_000
