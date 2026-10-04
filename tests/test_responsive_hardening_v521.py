from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_v521_covers_remaining_real_device_edges():
    css = read("static/vano.css")
    assert "VANO RESPONSIVE HARDENING V521" in css
    assert "@media(max-width:599px) and (max-height:620px) and (orientation:portrait)" in css
    assert "@media(max-width:899px) and (orientation:landscape) and (max-height:560px)" in css
    assert "@media(min-width:1024px) and (max-width:1366px) and (pointer:coarse)" in css
    assert "@media(min-width:900px) and (max-height:720px)" in css
    assert "@media(min-width:2200px)" in css
    assert "overflow-y:auto!important" in css
    assert "overscroll-behavior:contain!important" in css


def test_active_navigation_has_explicit_phone_and_landscape_geometry():
    css = read("static/vano.css")
    assert "body.vano-map-surface.body-nav #navManeuverTop" in css
    assert "body.vano-map-surface.body-nav #activeNav.nav-panel.nav-minimal" in css
    assert "max-height:min(42dvh,360px)!important" in css
    assert "width:min(390px,46vw)!important" in css
    assert "#navStreetChip" in css


def test_runtime_detects_touch_tablet_keyboard_not_only_phone_width():
    js = read("static/vano-map.js")
    assert "dataset.vanoPointer" in js
    assert "navigator.maxTouchPoints>0" in js
    assert "matchMedia?.('(pointer:coarse)')" in js
    assert "touchViewport||window.innerWidth<900" in js
    assert "window.visualViewport?.height" in js


def test_shared_route_has_modern_viewport_and_tablet_layout():
    html = read("templates/shared_route.html")
    assert "interactive-widget=resizes-content" in html
    assert "@media(pointer:coarse)" in html
    assert "@media(min-width:700px) and (max-width:1100px)" in html
    assert "overscroll-behavior:contain" in html


def test_live_trip_has_complete_responsive_contract():
    html = read("templates/live_trip.html")
    assert "interactive-widget=resizes-content" in html
    assert "LIVE TRIP RESPONSIVE V521" in html
    assert "@media(max-width:359px)" in html
    assert "@media(min-width:360px) and (max-width:699px)" in html
    assert "@media(min-width:700px) and (max-width:1099px)" in html
    assert "@media(min-width:1100px)" in html
    assert "@media(orientation:landscape) and (max-height:560px)" in html
    assert "@media(pointer:coarse)" in html


def test_safe_area_is_applied_to_top_and_bottom_map_controls():
    css = read("static/vano.css")
    assert "--vano-safe-top:max(8px,env(safe-area-inset-top))" in css
    assert "--vano-safe-right:max(8px,env(safe-area-inset-right))" in css
    assert "--vano-safe-bottom:max(8px,env(safe-area-inset-bottom))" in css
    assert "--vano-safe-left:max(8px,env(safe-area-inset-left))" in css
    assert "top:var(--vano-safe-top)!important" in css
