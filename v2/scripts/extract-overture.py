#!/usr/bin/env python3
"""Offline regional Overture Places extractor (NOT a live API).
Requires the official Overture CLI: pip install overturemaps
Usage: python scripts/extract-overture.py -46.69 -23.60 -46.59 -23.50 output.geojson
Official source: https://docs.overturemaps.org/getting-data/
Run in a separate workstation/job, then host the small validated regional
GeoJSON on an HTTPS object store or CDN. Do not fetch global parquet on Render.
"""
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

def main(args):
    if len(args) != 5:
        raise ValueError("Expected west south east north output.geojson")
    w, s, e, n = (float(x) for x in args[:4])
    if not (-180 <= w < e <= 180 and -85 <= s < n <= 85
            and e-w <= 0.5 and n-s <= 0.5):
        raise ValueError("Extracts must be valid regional bboxes <=0.5 degrees")
    dest = Path(args[4])
    dest.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as d:
        raw = Path(d) / "places.geojson"
        command = ["overturemaps", "download", "--bbox=" +
                   ",".join(str(x) for x in (w,s,e,n)),
                   "-f", "geojson", "--type=place", "-o", str(raw)]
        subprocess.run(command, check=True, timeout=220)
        if raw.stat().st_size > 90_000_000:
            raise ValueError("Extract unexpectedly large; reduce bbox")
        data = json.loads(raw.read_text(encoding="utf-8"))
        features = data.get("features", [])
        if data.get("type") != "FeatureCollection" or not isinstance(features, list):
            raise ValueError("Expected Overture GeoJSON FeatureCollection")
        selected = []
        for feat in features:
            if not isinstance(feat, dict) or feat.get("geometry", {}).get("type") != "Point":
                continue
            point = feat["geometry"].get("coordinates", [])
            if len(point) < 2 or not (w <= point[0] <= e and s <= point[1] <= n):
                continue
            props = feat.get("properties", {})
            names = props.get("names") or {}
            categories = props.get("categories") or {}
            name = names.get("primary") if isinstance(names, dict) else None
            category = categories.get("primary") if isinstance(categories, dict) else None
            if not isinstance(name, str) or not name.strip():
                continue
            selected.append({"type": "Feature", "id": feat.get("id"),
                             "geometry": {"type": "Point", "coordinates": point[:2]},
                             "properties": {"name": name[:100], "category": str(category or "")[:60]}})
            if len(selected) >= 10000:
                break
        payload = {"type": "FeatureCollection", "features": selected,
                   "metadata": {"provider": "Overture Maps", "asOf": None,
                                "note": "Static licensed regional extract, not real time"}}
        temp = dest.with_suffix(dest.suffix + ".tmp")
        temp.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        os.replace(temp, dest)
        print("Overture points exported:", len(selected), "to", str(dest))

if __name__ == "__main__":
    try:
        main(sys.argv[1:])
    except (ValueError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        print("Failed:", exc, file=sys.stderr)
        sys.exit(1)
