"""Behavioral regression coverage for the shared preference and every button variant."""
from pathlib import Path
import shutil
import subprocess
import re
import pytest

ROOT = Path(__file__).resolve().parents[1]

def test_theme_preference_behavior():
    node = shutil.which('node')
    if not node:
        pytest.skip('Node.js not installed')
    result = subprocess.run([node, 'tests/theme_controls.cjs'], cwd=ROOT,
                            capture_output=True, text=True, timeout=20)
    assert result.returncode == 0, result.stdout + result.stderr

def test_no_theme_variant_is_left_without_the_shared_icon():
    controls = []
    for page in (ROOT / 'templates').glob('*.html'):
        for button in re.findall(r'<button[^>]*data-vano-theme-toggle[^>]*>.*?</button>', page.read_text(), re.S):
            controls.append((page.name, button))
            assert 'vano-theme-control' in button, page.name
            assert "include '_theme_icon.html'" in button, page.name
            assert 'aria-pressed=' in button, page.name
    assert len(controls) == 7
    for name in ('base', 'login', 'live_trip', 'shared_route'):
        page = (ROOT / 'templates' / (name + '.html')).read_text()
        assert "include '_theme_boot.html'" in page, name
        assert 'vanoFoundation, vanoLegacy' in page, name
