from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
TEMPLATES = ROOT / "templates"
STATIC = ROOT / "static"

CSS_LINK_RE = re.compile(
    r'<link\b[^>]*url_for\(\s*[\'\"]static[\'\"]\s*,\s*filename\s*=\s*[\'\"][^\'\"]+\.css[\'\"][^)]*\)[^>]*>',
    re.I,
)

CANONICAL_LINK = '<link rel="stylesheet" href="{{ url_for(\'static\', filename=\'vano.css\') }}?v={{ vano_build_id }}">'

for path in TEMPLATES.glob("*.html"):
    text = path.read_text(encoding="utf-8")
    text = CSS_LINK_RE.sub("", text)

    if path.name == "base.html":
        anchor = "{% block tail_head %}{% endblock %}"
        text = re.sub(
            r'\s*<link\b[^>]*filename=[\'\"]vano\.css[\'\"][^>]*>',
            "",
            text,
            flags=re.I,
        )
        if anchor not in text:
            raise SystemExit("base.html tail_head anchor not found")
        text = text.replace(anchor, anchor + "\n  " + CANONICAL_LINK, 1)

    if path.name in {"login.html", "live_trip.html", "shared_route.html"}:
        if "filename='vano.css'" not in text and 'filename="vano.css"' not in text:
            if "</head>" not in text:
                raise SystemExit(f"{path}: missing </head>")
            text = text.replace("</head>", "  " + CANONICAL_LINK + "\n</head>", 1)

    path.write_text(text, encoding="utf-8")

sw = STATIC / "vano-sw.js"
text = sw.read_text(encoding="utf-8")
match = re.search(r"const PRECACHE=\[.*?\];", text, flags=re.S)
if not match:
    raise SystemExit("service worker PRECACHE not found")
precache = match.group(0)
precache = re.sub(r"(?m)^\s*'/static/[^']+\.css',?\s*$", "", precache)
precache = precache.replace("const PRECACHE=[", "const PRECACHE=[\n  '/static/vano.css',", 1)
text = text[: match.start()] + precache + text[match.end() :]
text = re.sub(
    r"const CORE_RE=.*?;",
    r"const CORE_RE=/\/static\/(vano\.css|vano-runtime\.js|vano-theme\.js|vano-map\.js|vano-access\.js)$/;",
    text,
    count=1,
)
sw.write_text(text, encoding="utf-8")

canonical_css = STATIC / "vano.css"
if not canonical_css.exists():
    raise SystemExit("static/vano.css missing")
css = canonical_css.read_text(encoding="utf-8")
css = re.sub(r"/\* ===== static/[^*]+?\.css ===== \*/\s*", "", css)
canonical_css.write_text(css, encoding="utf-8")

for path in STATIC.glob("*.css"):
    if path.name != "vano.css":
        path.unlink()

for path in STATIC.glob(".vano-css-part*.tmp"):
    path.unlink()

orphan_js = STATIC / "vano-profile-polish.js"
if orphan_js.exists():
    orphan_js.unlink()

docs = ROOT / "docs"
if docs.exists():
    for path in docs.iterdir():
        if path.is_file():
            path.unlink()
    try:
        docs.rmdir()
    except OSError:
        pass

perf = ROOT / "tests" / "test_frontend_performance.py"
perf.write_text(
    """from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def test_localization_does_not_block_first_paint_for_pt_br():
    base = (ROOT / "templates" / "base.html").read_text(encoding="utf-8")
    assert "active_locale != 'pt-BR'" in base
    assert "<script defer src=\\\"{{ url_for('static', filename='vano-i18n.js')" in base


def test_repository_has_one_canonical_stylesheet():
    css_files = sorted(p.name for p in (ROOT / "static").glob("*.css"))
    assert css_files == ["vano.css"]


def test_templates_reference_only_canonical_local_stylesheet():
    refs = set()
    pattern = re.compile(r"filename=['\\\"]([^'\\\"]+\\.css)['\\\"]")
    for path in (ROOT / "templates").glob("*.html"):
        refs.update(pattern.findall(path.read_text(encoding="utf-8", errors="ignore")))
    assert refs == {"vano.css"}


def test_onboarding_stays_lightweight_outside_shared_stylesheet():
    page = (ROOT / "templates" / "onboarding.html").read_text(encoding="utf-8")
    assert "vano-maps-banner.png" not in page
    assert "vano-maps-banner-dark.png" not in page
    assert "vano-maps-icon-64.png" in page
    js = ROOT / "static" / "vano-onboarding.js"
    assert js.stat().st_size < 25_000


def test_canonical_stylesheet_has_reasonable_repository_budget():
    css = ROOT / "static" / "vano.css"
    assert css.exists()
    assert css.stat().st_size < 3_000_000
""",
    encoding="utf-8",
)

smoke = ROOT / "tests" / "test_repository_smoke.py"
smoke_text = smoke.read_text(encoding="utf-8")
if "def test_single_canonical_stylesheet_only():" not in smoke_text:
    smoke_text += """


def test_single_canonical_stylesheet_only():
    css_files = sorted(p.name for p in (ROOT / "static").glob("*.css"))
    assert css_files == ["vano.css"]
"""
smoke.write_text(smoke_text, encoding="utf-8")

# Repository-wide guard: no deleted local stylesheet may remain referenced.
offenders: list[tuple[str, str]] = []
ref_patterns = [
    re.compile(r"filename=['\"]([^'\"]+\.css)['\"]"),
    re.compile(r"/static/([A-Za-z0-9_./-]+\.css)"),
]
for base in (ROOT / "templates", ROOT / "static", ROOT / "vano"):
    for path in base.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in {".py", ".html", ".js", ".json", ".xml", ".svg"}:
            continue
        body = path.read_text(encoding="utf-8", errors="ignore")
        for pattern in ref_patterns:
            for ref in pattern.findall(body):
                if Path(ref).name != "vano.css":
                    offenders.append((str(path.relative_to(ROOT)), ref))
if offenders:
    raise SystemExit(f"legacy stylesheet references remain: {offenders[:20]}")

# One-shot files delete themselves before the final commit.
(ROOT / ".github" / "workflows" / "repo-cleanup.yml").unlink(missing_ok=True)
Path(__file__).unlink(missing_ok=True)
