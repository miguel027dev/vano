"""Search latency regressions for first- and repeat-user geocoding."""
from pathlib import Path
import ast
import shutil
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[1]


def test_search_input_does_not_wait_on_optional_provider():
    node = shutil.which("node")
    if not node:
        pytest.skip("Node.js is required for the client-side search test")
    run = subprocess.run(
        [node, "tests/search_latency_behavior.cjs"], cwd=ROOT,
        capture_output=True, text=True, timeout=15, check=False,
    )
    assert run.returncode == 0, run.stdout + "\n" + run.stderr
    assert "PASS: input debounce" in run.stdout


def _search_function():
    source = (ROOT / "vano/services/search.py").read_text(encoding="utf-8")
    module = ast.parse(source)
    fn = next(n for n in module.body if isinstance(n, ast.FunctionDef) and n.name == "smart_location_search")
    standalone = ast.Module(body=[fn], type_ignores=[])
    code = compile(ast.fix_missing_locations(standalone), "search_service.py", "exec")
    return code


def test_search_skips_second_provider_for_valid_address_and_poi():
    calls = []
    intent = {"kind": "street", "meta": {}, "wanted_category": ""}
    street = {"lat": -23.6, "lon": -46.7, "label": "Rua Exemplo", "type": "street", "match_kind": "primary"}
    poi = {"lat": -23.6, "lon": -46.7, "label": "Shopping Exemplo", "type": "poi", "match_kind": "primary"}
    first = [street]

    def geocode(*args, **kwargs):
        calls.append("geocode")
        return first

    def searchbox(*args, **kwargs):
        calls.append("searchbox")
        return first

    env = {
        "_search_cache_key": lambda *args: "test",
        "_search_cache_get": lambda *args: None,
        "_search_cache_set": lambda *args: None,
        "_query_search_intent": lambda q: intent,
        "_international_query_context": lambda q: {},
        "preferred_language": lambda: "pt-BR",
        "mapbox_ready": lambda: True,
        "mapbox_forward_geocode": geocode,
        "mapbox_searchbox_forward": searchbox,
        "SEARCHBOX_CATEGORY_FILTERS": {"mall": "shopping_mall"},
        "_search_normalize": lambda s: str(s).lower(),
        "_combined_search_rank": lambda *args: 0,
    }
    exec(_search_function(), env)

    result = env["smart_location_search"]("Rua Exemplo")
    assert len(result) == 1
    assert calls == ["geocode"], "Exact street should not need sequential Search Box"

    calls.clear()
    intent.update(kind="poi", wanted_category="mall")
    first = [poi]
    result = env["smart_location_search"]("Shopping Exemplo")
    assert len(result) == 1
    assert calls == ["searchbox"], "Primary category result should not trigger two more providers"

    calls.clear()
    first = []
    result = env["smart_location_search"]("Shopping desconhecido")
    assert result == []
    assert calls == ["searchbox", "searchbox", "geocode"], "Weak results retain all fallback providers"


def test_structured_postcode_still_checks_house_number():
    source = (ROOT / "vano/services/search.py").read_text(encoding="utf-8")
    assert "wanted_number = str(query_meta.get(\"number\") or \"\").lower()" in source
    assert "if not structured_answer:" in source
    assert 'str(item.get("address_number") or "").lower() == wanted_number' in source
