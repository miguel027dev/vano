from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_responsive_contract_defines_all_primary_device_classes():
    css = read("static/vano.css")
    assert "VANO RESPONSIVE CONTRACT V520" in css
    for query in (
        "@media(max-width:359px)",
        "@media(min-width:360px) and (max-width:599px)",
        "@media(min-width:600px) and (max-width:767px)",
        "@media(min-width:768px) and (max-width:1023px)",
        "@media(min-width:1024px) and (max-width:1439px)",
        "@media(min-width:1440px)",
        "@media(min-width:1800px)",
    ):
        assert query in css


def test_mobile_contract_covers_safe_area_keyboard_and_touch_zoom():
    css = read("static/vano.css")
    assert "env(safe-area-inset-bottom)" in css
    assert "var(--vano-visible-vh,100dvh)" in css
    assert "var(--vano-keyboard-bottom,0px)" in css
    assert "html.vano-keyboard-open" in css
    assert "@media(max-width:767px) and (pointer:coarse)" in css
    assert "font-size:16px!important" in css
    assert "min-block-size:44px" in css


def test_tablet_notebook_desktop_use_side_rail_layout():
    css = read("static/vano.css")
    assert "width:clamp(360px,43vw,420px)!important" in css
    assert "width:430px!important" in css
    assert "width:470px!important" in css
    assert "width:500px!important" in css
    assert "#planSheet .vano-planner-toggle-v221{display:none!important}" in css


def test_short_landscape_uses_compact_side_panel():
    css = read("static/vano.css")
    assert "@media(max-width:899px) and (orientation:landscape) and (max-height:560px)" in css
    assert "width:min(400px,52vw)!important" in css


def test_runtime_exposes_viewport_band_and_orientation():
    js = read("static/vano-map.js")
    assert "dataset.vanoViewport" in js
    assert "dataset.vanoOrientation" in js
    for band in ("phone-xs", "phone", "phone-lg", "tablet", "notebook", "desktop"):
        assert f"'{band}'" in js
    assert "--vano-layout-w" in js
    assert "--vano-layout-h" in js


def test_route_framing_uses_actual_panel_geometry():
    js = read("static/vano-map.js")
    assert "function fitEndpoints()" in js
    assert "function routeOverviewPadding()" in js
    assert "planSheet?.getBoundingClientRect?.()" in js
    assert "panelRight=sheet&&sheet.width>0" in js
    assert "bottomCover=Math.max(0" in js


def test_map_root_uses_dynamic_and_small_viewport_units():
    css = read("static/vano.css")
    assert "height:var(--vano-vh,100dvh)!important" in css
    assert "min-height:100svh!important" in css
