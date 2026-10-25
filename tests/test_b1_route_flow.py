"""Contracts for the standard (B1) progressive route-planning experience."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def file(name):
    return (ROOT / name).read_text(encoding="utf-8")


def test_b1_flow_is_loaded_only_outside_admin_v2_preview():
    html = file("templates/index.html")
    assert "{% if not v2_preview|default(false) %}" in html
    assert "window.VANO_B1_FLOW=true;" in html
    assert "vano-b1-flow.js" in html
    assert "{% else %}\n<link rel=\"stylesheet\" href=\"{{ url_for('static', filename='vano-b1-flow.css') }}" in html
    assert "vano-v2.js" in html
    assert "vano-foundation.css" not in html or "vano-b1-flow.css" not in html


def test_b1_keeps_the_engine_route_contract():
    core = file("static/vano-map.js")
    js = file("static/vano-b1-flow.js")
    assert "bindClick('confirmDestinationBtn',confirmDestination)" in core
    assert "window.__vanoB1Flow.onRouteDrawn({map,route:selectedRoute,origin,reducedMotion:REDUCED_MOTION})" in core
    assert "existing.click();" in js
    assert "confirmButton.click();" in js
    assert 'data-b1-transport="driving"' in js
    assert 'data-b1-transport="motorcycle"' in js
    assert 'data-b1-transport="walking"' in js
    assert 'data-route-mode="fastest"' in js
    assert 'data-route-mode="safest"' in js
    assert "pendingCamera = true;" in js
    assert "map.once('moveend', descend)" in js
    assert "map.on('dragstart'" in js
    assert "map.easeTo(camera)" in js
    assert "reducedMotion" in js


def test_b1_hides_unrequested_ui_without_deleting_base_engine():
    html = file("templates/index.html")
    css = file("static/vano-foundation.css")
    js = file("static/vano-b1-flow.js")
    assert 'id="routeVariants"' in html
    assert 'id="startTripBtn"' in html
    assert "routeState.prepend(preview)" in js
    assert "append(action)" in js
    assert "startTripBtn" in css
    assert "data-route-mode=\"smart\"" in css
    assert "#routeState > :not(#b1RoutePreview)" in css
    assert "body.vano-b1" in css
