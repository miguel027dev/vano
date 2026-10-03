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



def test_motion_refinement_contract():
    css = (ROOT / "static" / "vano.css").read_text(encoding="utf-8")
    onboarding = (ROOT / "static" / "vano-onboarding.js").read_text(encoding="utf-8")
    map_js = (ROOT / "static" / "vano-map.js").read_text(encoding="utf-8")
    assert "VANO EXPERIENCE REFINEMENT" in css
    assert "vano.motion.handoff.v1" in onboarding
    assert "vano.motion.handoff.v1" in map_js
    assert "settleMeters" in map_js
    assert "fitEndpoints()" in map_js
    assert "$$(\'.ob500-launch-screen\')" in onboarding
    assert "document.body.appendChild(splash)" in map_js
    assert ".vano-onboarding-v500.is-launching .ob500-shell" in css
    assert ".ob500-map-card.is-selected" in css
    assert '[data-profile-root][data-save-state="saving"]' in css
    assert "*::before,*::after" not in css.split("/* VANO EXPERIENCE REFINEMENT",1)[1]
