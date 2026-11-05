"""Contract checks for the VANO administration glass/3D dashboard.

These tests do not require external Mapbox credentials or live network access.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_admin_dashboard_preserves_existing_modules():
    html = (ROOT / "templates" / "admin.html").read_text(encoding="utf-8")
    for marker in [
        'id="adminDashboardView"',
        'id="adminRoutesView"',
        'id="infrastructure"',
        'id="serverGrid"',
        'id="nodeConfigForm"',
        'id="testAllNodes"',
        'data-admin-reset-form',
        "url_for('admin_users')",
        "url_for('admin_reports')",
        "url_for('admin_finance')",
        "url_for('admin_dev_sync')",
        "url_for('admin_benchmark')",
        "url_for('admin_audit_logs')",
    ]:
        assert marker in html, marker


def test_admin_uses_existing_vano_mapbox_3d_style():
    html = (ROOT / "templates" / "admin.html").read_text(encoding="utf-8")
    routes = (ROOT / "vano" / "routes" / "admin.py").read_text(encoding="utf-8")
    js = (ROOT / "static" / "vano-admin-glass.js").read_text(encoding="utf-8")
    assert 'id="adminRouteMap"' in html
    assert 'mapbox_gl' not in html.lower()  # Use the same Mapbox GL API, not a placeholder iframe.
    assert 'mapbox_token=MAPBOX_ACCESS_TOKEN if mapbox_ready() else ""' in routes
    assert 'mapbox_style=url_for("vano_mapbox_style", mode="black")' in routes
    assert 'new window.mapboxgl.Map' in js
    assert 'pitch: 62' in js
    assert 'touchZoomRotate: true' in js
    assert 'new window.mapboxgl.LngLatBounds' in js
    assert 'data-admin-route' in html
    assert 'data-origin-lat' in html and 'data-destination-lon' in html


def test_route_history_does_not_claim_live_tracking():
    html = (ROOT / "templates" / "admin.html").read_text(encoding="utf-8")
    js = (ROOT / "static" / "vano-admin-glass.js").read_text(encoding="utf-8")
    assert 'O histórico não contém a geometria do trajeto nem GPS ao vivo' in html
    assert 'fonte de telemetria autorizada' in html
    assert 'Pontos de origem e destino exibidos' in js


def test_glass_dashboard_has_brand_and_motion_guards():
    css = (ROOT / "static" / "vano-admin-glass.css").read_text(encoding="utf-8")
    html = (ROOT / "templates" / "admin.html").read_text(encoding="utf-8")
    assert '--vano-admin-orange:#f59a62' in css
    assert 'prefers-reduced-motion:reduce' in css
    assert 'vano-admin-glass.css' in html and 'vano-admin-glass.js' in html
