from pathlib import Path
import subprocess


def test_map_fluidity_behavior():
    root = Path(__file__).resolve().parents[1]
    result = subprocess.run(["node", "tests/map_fluidity_behavior.cjs"], cwd=root, capture_output=True, text=True, timeout=20)
    assert result.returncode == 0, result.stdout + result.stderr
