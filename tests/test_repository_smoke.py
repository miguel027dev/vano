from __future__ import annotations

import os
import re
from pathlib import Path

os.environ.setdefault("VANO_SKIP_DB_INIT", "1")
os.environ.setdefault("VANO_DB_INIT_ONLY", "1")
os.environ.setdefault("VANO_KEEPALIVE_ENABLED", "0")

ROOT = Path(__file__).resolve().parents[1]


def test_no_versioned_static_files():
    offenders = [
        str(p.relative_to(ROOT))
        for p in (ROOT / "static").rglob("*")
        if p.is_file() and re.search(r"-v\d+", p.name)
    ]
    assert offenders == []


def test_no_obsolete_static_references():
    pattern = re.compile(
        r"vano[^\"'`\s)<>{}]*?-v\d+[^\"'`\s)<>{}]*?\.(?:js|css|png|svg|webp|jpg|jpeg|mp3)",
        re.I,
    )
    offenders = []
    for base in (ROOT / "templates", ROOT / "static", ROOT / "vano"):
        for p in base.rglob("*"):
            if p.is_file() and p.suffix.lower() in {".py", ".html", ".css", ".js", ".json", ".xml", ".svg"}:
                text = p.read_text(encoding="utf-8", errors="ignore")
                if pattern.search(text):
                    offenders.append(str(p.relative_to(ROOT)))
    assert offenders == []


def test_no_legacy_brand_names_in_runtime():
    legacy = re.compile(r"\b(?:RAIRO|RAIGO|VIENNA|rairo|raigo|vienna)\b")
    offenders = []
    candidates = [
        ROOT / "app.py",
        ROOT / "db_backend.py",
        ROOT / "mobile_routes.py",
        ROOT / "render.yaml",
        ROOT / "vano_ai_routing.py",
    ]
    candidates += list((ROOT / "vano").rglob("*.py"))
    for p in candidates:
        if legacy.search(p.read_text(encoding="utf-8", errors="ignore")):
            offenders.append(str(p.relative_to(ROOT)))
    assert offenders == []


def test_flask_import_routes_and_templates():
    import app as vano_app

    rules = list(vano_app.app.url_map.iter_rules())
    endpoints = [rule.endpoint for rule in rules]
    unique_rules = {
        (rule.rule, tuple(sorted(rule.methods - {"HEAD", "OPTIONS"})), rule.endpoint)
        for rule in rules
    }
    assert len(unique_rules) == len(rules)
    assert {"index", "map_page", "api_route", "healthz"}.issubset(set(endpoints))

    for template in (ROOT / "templates").glob("*.html"):
        vano_app.app.jinja_env.parse(template.read_text(encoding="utf-8"))

    client = vano_app.app.test_client()
    response = client.get("/api/keepalive")
    assert response.status_code == 200
    assert response.get_json()["service"] == "vano"


def test_literal_static_references_exist():
    """Every literal static asset reference in runtime code must resolve."""
    refs = set()
    url_for_re = re.compile(
        r"url_for\(\s*['\"]static['\"]\s*,\s*filename\s*=\s*['\"]([^'\"]+)['\"]"
    )
    absolute_re = re.compile(
        r"['\"](/static/[^'\"?#)<>\s]+)"
    )

    scan_roots = [ROOT / "templates", ROOT / "static", ROOT / "vano"]
    scan_files = [
        ROOT / "app.py",
        ROOT / "mobile_routes.py",
        ROOT / "vano_osint_bridge.py",
        ROOT / "vano_ai_routing.py",
    ]
    for base in scan_roots:
        scan_files.extend(
            p for p in base.rglob("*")
            if p.is_file() and p.suffix.lower() in {".py", ".html", ".css", ".js", ".json", ".xml", ".svg"}
        )

    for p in scan_files:
        text = p.read_text(encoding="utf-8", errors="ignore")
        refs.update(url_for_re.findall(text))
        refs.update(ref.removeprefix("/static/") for ref in absolute_re.findall(text))

    missing = sorted(ref for ref in refs if ref and not (ROOT / "static" / ref).exists())
    assert missing == []



def test_controlled_stylesheet_layers_only():
    css_files = sorted(p.name for p in (ROOT / "static").glob("*.css"))
    assert css_files == ["vano-foundation.css", "vano.css"]
