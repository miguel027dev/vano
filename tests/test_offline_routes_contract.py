"""Regression contracts for offline route memory, avoiding production API changes."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAP = (ROOT / "static/vano-map.js").read_text(encoding="utf-8")
INDEX = (ROOT / "templates/index.html").read_text(encoding="utf-8")
SW = (ROOT / "static/vano-sw.js").read_text(encoding="utf-8")
STORE = (ROOT / "static/vano-offline-routes.js").read_text(encoding="utf-8")
SHELL = (ROOT / "static/vano-offline.html").read_text(encoding="utf-8")


def test_save_only_after_real_navigation_start():
    assert "vano:offline-route-used" in MAP
    assert MAP.index("await activateNavigationAt(p,{simulated:false})") < MAP.index(
        "vano:offline-route-used"
    )
    assert "vano:offline-route-used" in STORE
    assert "if(!enabled())return false" in STORE


def test_cold_start_has_independent_offline_document():
    assert "req.mode==='navigate'" in SW
    assert "url.pathname==='/'" in SW
    assert "url.pathname==='/mobile/entry'" in SW
    assert "vano-offline.html" in SW
    assert "vano-offline-routes.js" in SW
    assert "/api/" not in SHELL
    assert "vano-offline-view.js" in SHELL


def test_history_has_user_control_and_bounded_storage():
    assert "MAX_ROUTES=30" in STORE
    assert "MAX_POINTS=1400" in STORE
    assert "indexedDB.open" in STORE
    assert "await clear()" in STORE
    assert "offlineOptIn" in SHELL
    assert "Rotas offline" in INDEX
