"""Public, read-only publication of benchmark measurements.

This surface does not execute routes, read user trip history, or infer Google
times. It only serves operator-published, non-personal measurements.
"""
from vano.bootstrap import inject as _vano_inject
_vano_inject(globals())
del _vano_inject

from datetime import datetime, timedelta, timezone

_BENCH_CATEGORIES = {
    "centro": "Centro e áreas densas",
    "residencial": "Bairros residenciais",
    "avenidas": "Grandes avenidas",
    "travessias": "Pontes e túneis",
    "congestionamento": "Trânsito intenso",
}
_BENCH_SOURCES = {
    "vano_fastest": "Rota padrão (VANO Fastest)",
    "google_maps": "Google Maps (referência externa)",
}
_BENCH_PERIODS = {"7d": 7, "30d": 30, "all": None}


def _public_benchmark_filters():
    category = str(request.args.get("category") or "").lower()
    source = str(request.args.get("source") or "vano_fastest").lower()
    period = str(request.args.get("period") or "30d").lower()
    if category not in _BENCH_CATEGORIES:
        category = ""
    if source not in (*_BENCH_SOURCES, "all"):
        source = "vano_fastest"
    if period not in _BENCH_PERIODS:
        period = "30d"
    clauses = ["published = 1"]
    params = []
    if category:
        clauses.append("category = ?")
        params.append(category)
    if source != "all":
        clauses.append("baseline_source = ?")
        params.append(source)
    if _BENCH_PERIODS[period]:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=_BENCH_PERIODS[period])).replace(microsecond=0).isoformat()
        clauses.append("recorded_at >= ?")
        params.append(cutoff)
    return category, source, period, " AND ".join(clauses), params


def _bench_public_records(where, params, page, page_size):
    db = get_db()
    total = db.execute("SELECT COUNT(*) AS n FROM benchmark_publications WHERE " + where, params).fetchone()["n"]
    rows = db.execute(
        "SELECT * FROM benchmark_publications WHERE " + where +
        " ORDER BY recorded_at DESC, run_id DESC LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    stats = db.execute(
        """SELECT
             COUNT(*) AS n,
             AVG(CASE WHEN baseline_eta_min > 0 AND vano_eta_min IS NOT NULL
                 THEN baseline_eta_min - vano_eta_min END) AS avg_minutes_saved,
             AVG(CASE WHEN baseline_eta_min > 0 AND vano_eta_min IS NOT NULL
                 THEN 100.0 * (baseline_eta_min - vano_eta_min) / baseline_eta_min END) AS avg_pct_saved,
             PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY
                 CASE WHEN baseline_eta_min > 0 AND vano_eta_min IS NOT NULL
                   THEN baseline_eta_min - vano_eta_min END) AS median_minutes_saved,
             AVG(latency_ms) AS avg_latency_ms,
             PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_latency_ms
           FROM benchmark_publications WHERE """ + where,
        params,
    ).fetchone()
    return int(total), [dict(row) for row in rows], dict(stats)


def _bench_metric(row):
    before = row.get("baseline_eta_min")
    after = row.get("vano_eta_min")
    distance_before = row.get("baseline_distance_km")
    distance_after = row.get("vano_distance_km")
    row["delta_eta_min"] = round(float(before) - float(after), 3) if before is not None and after is not None else None
    row["delta_eta_pct"] = round(100 * row["delta_eta_min"] / float(before), 2) if row["delta_eta_min"] is not None and float(before) > 0 else None
    row["delta_distance_km"] = round(float(distance_before) - float(distance_after), 3) if distance_before is not None and distance_after is not None else None
    row["delta_distance_pct"] = round(100 * row["delta_distance_km"] / float(distance_before), 2) if row["delta_distance_km"] is not None and float(distance_before) > 0 else None
    row["category_label"] = _BENCH_CATEGORIES.get(row.get("category"), "Outra")
    row["baseline_label"] = _BENCH_SOURCES.get(row.get("baseline_source"), "Referência não informada")
    return row


def _bench_published_payload():
    category, source, period, where, params = _public_benchmark_filters()
    try:
        page = max(1, min(10000, int(request.args.get("page", "1"))))
    except (ValueError, TypeError):
        page = 1
    size = 25
    try:
        total, raw_rows, stats = _bench_public_records(where, params, page, size)
        rows = [_bench_metric(row) for row in raw_rows]
        available = True
    except Exception:
        # A new deployment may precede the additive schema migration. Fail
        # closed: never replace missing measurements with invented results.
        app.logger.exception("Public benchmark results not available")
        total, rows, stats, available = 0, [], {}, False
    return {
        "protocol": "vano-public-benchmark-results",
        "version": "1.0",
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "data_available": available,
        "total": total,
        "page": page,
        "page_size": size,
        "category": category,
        "source": source,
        "period": period,
        "stats": stats,
        "records": rows,
        "units": {"eta": "minutes", "distance": "kilometers", "latency": "milliseconds"},
        "delta_definition": "positive = reference value minus VANO value (VANO is lower)",
        "limitations": [
            "Estimated times are not proof of actual arrival time.",
            "VANO fastest is an internal baseline, never Google Maps.",
            "Only validated, explicitly published, non-personal runs appear here.",
            "Missing measurements are null, not zero.",
            "Traffic and safety scores are signals, not guarantees.",
            "Results collected at different times may not be comparable.",
        ],
    }


@app.route("/benchmark-resultados")
def benchmark_public_results_page():
    payload = _bench_published_payload()
    return render_template(
        "benchmark_resultados.html",
        data=payload,
        categories=_BENCH_CATEGORIES,
        sources=_BENCH_SOURCES,
        periods={"7d": "7 dias", "30d": "30 dias", "all": "Todo o histórico"},
    )


@app.route("/api/benchmark/v1/results")
def benchmark_public_results_json():
    payload = _bench_published_payload()
    response = jsonify(payload)
    response.headers["Cache-Control"] = "public, max-age=120"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response
