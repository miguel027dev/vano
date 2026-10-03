"""IndexNow notifications for VANO public discovery pages.

Only sitemap URLs whose lastmod matches today's UTC date are submitted. This
keeps deploy notifications focused on content that actually changed.
"""
from __future__ import annotations

import os
import threading
import time
import xml.etree.ElementTree as ET

import requests

_started = False
_lock = threading.Lock()


def _changed_urls(base_dir: str, public_site_url: str) -> list[str]:
    sitemap_path = os.path.join(base_dir, "sitemap.xml")
    try:
        root = ET.parse(sitemap_path).getroot()
    except (OSError, ET.ParseError):
        return []
    ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    today = time.strftime("%Y-%m-%d", time.gmtime())
    urls = []
    for node in root.findall("sm:url", ns):
        loc = (node.findtext("sm:loc", default="", namespaces=ns) or "").strip()
        lastmod = (node.findtext("sm:lastmod", default="", namespaces=ns) or "").strip()
        if not loc or lastmod != today:
            continue
        urls.append(loc.replace("__PUBLIC_SITE_URL__", public_site_url.rstrip("/")))
    return list(dict.fromkeys(urls))


def start_indexnow_submitter(app, *, base_dir: str, public_site_url: str) -> bool:
    global _started
    key = str(os.environ.get("INDEXNOW_KEY") or "").strip()
    if not key or len(key) < 8 or not public_site_url.startswith(("http://", "https://")):
        return False
    with _lock:
        if _started:
            return True
        _started = True

    def worker():
        # Let the new web process become healthy before inviting crawlers.
        time.sleep(12)
        urls = _changed_urls(base_dir, public_site_url)
        if not urls:
            return
        host = public_site_url.split("://", 1)[-1].split("/", 1)[0]
        payload = {
            "host": host,
            "key": key,
            "keyLocation": public_site_url.rstrip("/") + "/indexnow-key.txt",
            "urlList": urls[:10000],
        }
        try:
            response = requests.post("https://api.indexnow.org/indexnow", json=payload, timeout=8)
            if response.status_code not in {200, 202}:
                app.logger.warning("IndexNow submission returned HTTP %s", response.status_code)
            else:
                app.logger.info("IndexNow submitted %s changed public URLs", len(urls))
        except requests.RequestException as exc:
            app.logger.warning("IndexNow submission failed: %s", exc)

    threading.Thread(target=worker, name="vano-indexnow", daemon=True).start()
    return True
