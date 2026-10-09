"""Ensure clicking Continue in the profile personalization flow really advances."""
from pathlib import Path
import shutil
import subprocess
import pytest

ROOT = Path(__file__).resolve().parents[1]

def test_onboarding_continue_button_behavior():
    node = shutil.which("node")
    if not node:
        pytest.skip("Node.js not installed")
    result = subprocess.run(
        [node, "tests/onboarding_continue.cjs"],
        cwd=ROOT, text=True, capture_output=True,
        check=False, timeout=20,
    )
    assert result.returncode == 0, result.stdout + "\n" + result.stderr
    assert "PASS: first-run Continue button" in result.stdout
