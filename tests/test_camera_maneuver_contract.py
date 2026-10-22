from __future__ import annotations

from pathlib import Path
import shutil
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize("script_name", [
    "camera_maneuver_focus_contract.cjs",
    "ux_lifecycle_contract.cjs",
])
def test_navigation_camera_js_contract(script_name: str) -> None:
    node = shutil.which("node")
    if node is None:
        pytest.skip("Node.js is not available on this host")
    result = subprocess.run(
        [node, str(ROOT / "tests" / script_name)],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=20,
        check=False,
    )
    assert result.returncode == 0, (
        f"{script_name} failed\n{result.stdout}\n{result.stderr}"
    )
