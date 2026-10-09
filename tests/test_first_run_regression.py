"""Exercise the real first-run JavaScript inside the normal pytest/CI pipeline."""
from pathlib import Path
import shutil
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[1]


def test_onboarding_and_guest_route_regressions():
    node = shutil.which("node")
    if not node:
        pytest.skip("Node.js is required for the JavaScript runtime regression check")
    result = subprocess.run(
        [node, "tests/first_run_regression.cjs"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=20,
        check=False,
    )
    assert result.returncode == 0, result.stdout + "\n" + result.stderr
    assert "PASS: onboarding" in result.stdout
