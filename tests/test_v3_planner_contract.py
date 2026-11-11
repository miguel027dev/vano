"""Contract checks for the VANO V2 fullscreen planner and optional transit API.

The transit handler is compiled from its AST to avoid live network/database access.
"""
import ast
from pathlib import Path
from types import SimpleNamespace

import pytest


ROOT = Path(__file__).resolve().parents[1]


def _transit_handler(args):
    source = (ROOT / "vano/routes/routing.py").read_text(encoding="utf-8")
    tree = ast.parse(source)
    function = next(
        node for node in tree.body
        if isinstance(node, ast.FunctionDef) and node.name == "api_transit_itineraries"
    )
    function.decorator_list = []
    isolated = ast.Module(body=[function], type_ignores=[])
    namespace = {
        "request": SimpleNamespace(args=args),
        "jsonify": lambda payload: payload,
        "rate_limit": lambda *args, **kwargs: True,
    }
    exec(compile(ast.fix_missing_locations(isolated), "transit_api.py", "exec"), namespace)
    return namespace["api_transit_itineraries"]


def _coordinates():
    return {
        "start_lat": "-23.5", "start_lon": "-46.7",
        "end_lat": "-23.6", "end_lon": "-46.6",
    }


def test_transit_never_invents_itineraries_when_unconfigured(monkeypatch):
    monkeypatch.delenv("VANO_TRANSIT_PLANNER_URL", raising=False)
    response, status = _transit_handler(_coordinates())()
    assert status == 503
    assert response["routes"] == []
    assert response["code"] == "transit_not_configured"


@pytest.mark.parametrize("bad", [
    {"start_lat": "nan"},
    {"end_lon": "999"},
    {"start_lon": "not-a-coordinate"},
])
def test_transit_rejects_invalid_coordinates(monkeypatch, bad):
    monkeypatch.delenv("VANO_TRANSIT_PLANNER_URL", raising=False)
    response, status = _transit_handler({**_coordinates(), **bad})()
    assert status == 400
    assert response["code"] == "invalid_coordinates"


def test_transit_adapts_upstream_without_synthesizing_data(monkeypatch):
    import requests
    monkeypatch.setenv("VANO_TRANSIT_PLANNER_URL", "https://transit.example.invalid/routes")
    received = []

    def fake_get(url, params, timeout, allow_redirects, headers):
        received.append((url, params, timeout, allow_redirects))
        return SimpleNamespace(
            status_code=200,
            json=lambda: {"routes": [{
                "id": "gtfs-1", "label": "Ônibus 101",
                "duration_seconds": 1920,
                "walking_seconds": 360, "transfers": 0,
                "legs": [{"mode": "BUS", "line": "101",
                          "from": "Origem", "to": "Destino"}]
            }, {"id": "bad", "duration_seconds": -90}]}
        )

    monkeypatch.setattr(requests, "get", fake_get)
    response = _transit_handler(_coordinates())()
    assert "code" in response and response["code"] == "ok"
    assert len(response["routes"]) == 1
    assert response["routes"][0]["duration_seconds"] == 1920
    assert response["routes"][0]["walking_seconds"] == 360
    assert response["routes"][0]["transfers"] == 0
    assert received[0][3] is False


def test_planner_keeps_original_search_and_existing_mode_handlers():
    index = (ROOT / "templates/index.html").read_text(encoding="utf-8")
    ui = (ROOT / "static/vano-v2.js").read_text(encoding="utf-8")
    core = (ROOT / "static/vano-map.js").read_text(encoding="utf-8")
    assert "vano-v2.js" in index
    assert 'id="destinationInput"' in index
    assert "fieldSlot.appendChild(searchRow)" in ui
    assert "resultSlot.appendChild(results)" in ui
    assert "data.vanoTransit" not in core
    assert "getPlannerSnapshot" in core
    assert "setRoutePreviewVisibility(false)" in ui
    assert "/api/transit/itineraries?" in ui
