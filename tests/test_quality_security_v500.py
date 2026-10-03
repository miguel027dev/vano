import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_csp_uses_nonce_for_script_and_style_elements():
    headers = read("vano/security/headers.py")
    assert "prepare_security_nonce" in headers
    assert "script-src 'self' 'nonce-{nonce}'" in headers
    assert "script-src 'self' 'unsafe-inline'" not in headers
    assert "style-src-elem 'self' 'nonce-{nonce}'" in headers
    assert "style-src-attr 'unsafe-inline'" in headers
    assert 'response.headers["X-Frame-Options"] = "SAMEORIGIN"' in headers
    assert "frame_ancestors = FRAME_ANCESTORS if embed_surface else" in headers


def test_templates_have_no_inline_html_event_handlers():
    event_attr = re.compile(r"<[^>]+\son[a-z]+\s*=", re.IGNORECASE)
    offenders = []
    for path in (ROOT / "templates").glob("*.html"):
        text = path.read_text(encoding="utf-8")
        if event_attr.search(text):
            offenders.append(path.name)
    assert not offenders, f"inline executable HTML handlers remain: {offenders}"


def test_map_dialogs_have_modal_semantics_and_keyboard_trap():
    index = read("templates/index.html")
    js = read("static/vano-map.js")
    for dialog_id in ("accountDrawer", "safetyDrawer", "prefsDrawer", "quickAlertSheet"):
        assert f'id="{dialog_id}"' in index
    assert index.count('role="dialog"') >= 5
    assert "function dialogFocusable" in js
    assert "function focusDialogOpen" in js
    assert "function focusDialogClose" in js
    assert "function activeDialog" in js
    assert "e.key==='Tab'" in js


def test_search_combobox_has_roving_keyboard_semantics():
    index = read("templates/index.html")
    js = read("static/vano-map.js")
    assert 'role="combobox"' in index
    assert 'aria-controls="searchResults"' in index
    assert 'role="listbox"' in index
    assert "function decorateSearchOptions" in js
    assert "aria-activedescendant" in js
    assert "aria-selected" in js
    assert "e.key==='Home'" in js
    assert "e.key==='End'" in js


def test_all_map_motion_respects_reduced_motion():
    js = read("static/vano-map.js")
    live = read("templates/live_trip.html")
    assert "function mapMotionDuration" in js
    assert "essential:true" not in js
    assert "essential:!REDUCED_MOTION" in js
    assert "duration:REDUCED_MOTION?0:900" in live
    assert "essential:!REDUCED_MOTION" in live
    assert "@media(prefers-reduced-motion:reduce)" in live


def test_frontend_asset_budgets():
    budgets = {
        "static/vano.css": 2_500_000,
        "static/vano-map.js": 390_000,
        "static/vano-map-fallback.js": 290_000,
        "static/vano-i18n.js": 220_000,
        "templates/index.html": 65_000,
    }
    exceeded = []
    for rel, max_bytes in budgets.items():
        size = (ROOT / rel).stat().st_size
        if size > max_bytes:
            exceeded.append((rel, size, max_bytes))
    assert not exceeded, f"frontend budget exceeded: {exceeded}"


def test_ci_runs_security_audits():
    workflow = read(".github/workflows/ci.yml")
    dev = read("requirements-dev.txt")
    assert "pip-audit -r requirements.txt" in workflow
    assert "bandit -q -lll" in workflow
    assert "pip-audit" in dev
    assert "bandit" in dev


def test_default_trusted_hosts_are_bounded():
    app = read("app.py")
    assert "_public_host" in app
    assert '"vaigo-1.onrender.com"' in app
    assert "TRUSTED_HOSTS=VANO_TRUSTED_HOSTS or None" in app
