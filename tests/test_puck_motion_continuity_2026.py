"""Regression harness for main/fallback map puck animation."""
from pathlib import Path
import subprocess

ROOT=Path(__file__).resolve().parents[1]

def test_puck_animation_continuity_and_gps_loss():
    result=subprocess.run(
        ["node","tests/puck_motion_continuity_behavior.cjs"],
        cwd=ROOT,capture_output=True,text=True,timeout=15,check=False,
    )
    assert result.returncode==0, result.stdout+"\n"+result.stderr
