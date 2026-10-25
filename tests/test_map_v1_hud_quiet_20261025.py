"""Regression checks for the quiet V1 navigation HUD."""
from pathlib import Path
import re

MAP_SOURCE = (Path(__file__).resolve().parents[1] / "static" / "vano-map.js").read_text(encoding="utf-8")


def test_lane_recommendation_banner_is_removed():
    assert "FAIXA RECOMENDADA" not in MAP_SOURCE
    assert "faixas válidas para a manobra" not in MAP_SOURCE
    assert "const risk=nextRiskAhead(m);" in MAP_SOURCE


def test_technical_failures_do_not_reach_bottom_toast():
    assert "toast-suppressed" in MAP_SOURCE
    assert "showToast(e.message" not in MAP_SOURCE
    assert "showToast(e?.message" not in MAP_SOURCE
    assert "${esc(e.message)}" not in MAP_SOURCE


def test_reroute_keeps_navigation_on_failure():
    assert "motionSwapText(noticeCopy,'Rota atual mantida')" in MAP_SOURCE
    assert "console.warn('[VANO MAPS:reroute]',e)" in MAP_SOURCE


def test_quick_alert_confirmation_is_not_optimistic():
    assert "showToast('Alerta adicionado ao mapa.')" not in MAP_SOURCE
    assert "showToast(d.duplicate?'Alerta já confirmado nesta área.':'Alerta publicado no mapa.')" in MAP_SOURCE
