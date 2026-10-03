from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_navigation_motion_v400_contract():
    map_js = (ROOT / "static" / "vano-map.js").read_text(encoding="utf-8")
    css = (ROOT / "static" / "vano.css").read_text(encoding="utf-8")
    index = (ROOT / "templates" / "index.html").read_text(encoding="utf-8")

    assert "showArrivalExperience(m);return" in map_js
    assert "setNavMotionIntent('reroute')" in map_js
    assert "setNavMotionIntent('arrival')" in map_js
    assert "setNavMotionIntent('report')" in map_js
    assert "setNavMotionIntent('decision')" in map_js
    assert "motionSwapText" in map_js

    assert "VANO NAV MOTION V400" in css
    assert "--vano-motion-fast:180ms" in css
    assert "--vano-motion-normal:240ms" in css
    assert "--vano-motion-slow:280ms" in css
    assert "vano-nav-text-swap" in css
    assert 'data-nav-motion="arrival"' in css

    assert 'id="rerouteNotice" role="status" aria-live="polite" aria-busy="false"' in index
