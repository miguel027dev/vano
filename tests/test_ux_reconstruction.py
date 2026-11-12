"""Runtime and source regressions for the first UX reliability reconstruction pack.

These tests use the production JavaScript source, not a separately reimplemented
normalization function. Device FPS, GPS and actual taps still require Android QA.
"""
from pathlib import Path
import shutil
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize("test_script", [
    "tests/routine_validation_behavior.cjs",
    "tests/ux_lifecycle_contract.cjs",
])
def test_reconstruction_behavior(test_script):
    node = shutil.which("node")
    if not node:
        pytest.skip("Node.js is required to exercise the production frontend")
    outcome = subprocess.run(
        [node, test_script], cwd=ROOT, capture_output=True,
        text=True, check=False, timeout=20,
    )
    assert outcome.returncode == 0, outcome.stdout + "\n" + outcome.stderr
    assert "PASS:" in outcome.stdout


def test_no_empty_coordinates_can_be_used_as_saved_places():
    source = (ROOT / "static/vano-routine.js").read_text(encoding="utf-8")
    assert "const validCoordinate=" in source
    assert "const rawLat=r?.dataset.lat,rawLon=r?.dataset.lon" in source
    assert "if(p.label&&(!validCoordinate(p.lat,p.lon)))" in source
    assert "invalidateAddressSearch()" in source
    assert "revision!==searchRevision" in source


def test_mavi_companion_is_scoped_without_restoring_removed_map_buttons():
    assert (ROOT / "static/vano-voice-companion.js").exists()
    base = (ROOT / "templates/base.html").read_text(encoding="utf-8")
    page = (ROOT / "templates/index.html").read_text(encoding="utf-8")
    assert "vano-voice-companion.js" in base
    assert "{% if vano_endpoint in ['index', 'map_page'] %}" in base
    assert 'id="voiceSearchBtn"' not in page
    assert 'id="soundBtn"' not in page
