"""Behavioral contract for the legacy VANO navigation voice."""
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def test_navigation_voice_bounded_audio_and_fallback():
    node = shutil.which("node")
    assert node, "Node.js is required to execute navigation voice regression cases."
    result = subprocess.run(
        [node, "tests/navigation_voice_regression.cjs"],
        cwd=ROOT, capture_output=True, text=True, timeout=20, check=False,
    )
    assert result.returncode == 0, result.stdout + "\n" + result.stderr


def test_navigation_voice_keeps_speech_eligible_and_sound_settings():
    src = (ROOT / "static/vano-map.js").read_text(encoding="utf-8")
    assert "if(speak(vp.announcement,key))spokenMilestones.add(key)" in src
    assert "if(speak(`${prefix}, ${step.instruction||'siga pela rota'}`,key))spokenMilestones.add(key)" in src
    assert "spokenMilestones.clear();lastSpokenInstruction='';navAudioCooldown.clear()" in src
    assert "spokenMilestones.delete(key);" in src
    assert "localStorage.setItem('vano-navigation-sound-v1'" in src
    assert "window.VANO_NATIVE_SPEECH?.stop?.()" in src
