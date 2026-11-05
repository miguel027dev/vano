"""Regression guards for touch interaction in the VANO partner embed."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_embed_assets_are_isolated_to_the_embed_endpoint():
    base = (ROOT / "templates" / "base.html").read_text(encoding="utf-8")
    assert "{% if vano_endpoint == 'embed_entry' %}" in base
    assert "vano-embed-touch.css" not in base
    assert "vano-embed-touch.js" in base


def test_embed_visual_layers_do_not_intercept_map_touches():
    css = (ROOT / "static" / "vano-foundation.css").read_text(encoding="utf-8")
    assert "body.vano-route-embed-entry.vano-map-surface" in css
    assert "touch-action: none !important" in css
    assert "pointer-events: auto !important" in css
    for visual_only in (".map-mood-fade", ".map-vignette", ".ambient-halo", ".road-mood-hint"):
        assert visual_only in css


def test_embed_resizes_and_restores_mapbox_gestures():
    js = (ROOT / "static" / "vano-embed-touch.js").read_text(encoding="utf-8")
    for capability in ("dragPan", "touchZoomRotate", "scrollZoom", "doubleClickZoom"):
        assert capability in js
    assert "ResizeObserver" in js
    assert "touchAction = 'none'" in js
    assert "preventDefault" not in js
