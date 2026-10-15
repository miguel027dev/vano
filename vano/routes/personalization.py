"""Rotas com personalidade e rotinas descobertas (opt-in).

Todas as rotas são associadas à sessão autenticada. Não usa route_history:
o histórico antigo também contém pesquisas e prévias, não viagens concluídas.
"""
import json
import math
import re
from datetime import datetime, timedelta, timezone
from statistics import median
from vano.bootstrap import inject as _vano_inject
from vano.services.personality import interpret_preference_text

_vano_inject(globals())
del _vano_inject


def _now():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _point(raw):
    if not isinstance(raw, dict):
        raise ValueError("Ponto inválido.")
    try:
        lat, lon = float(raw.get("lat")), float(raw.get("lon"))
    except (ValueError, TypeError):
        raise ValueError("Coordenadas ausentes.") from None
    if not math.isfinite(lat) or not math.isfinite(lon) or abs(lat) > 90 or abs(lon) > 180:
        raise ValueError("Coordenadas inválidas.")
    if abs(lat) < 0.00001 and abs(lon) < 0.00001:
        raise ValueError("Localização inválida.")
    return {"lat": round(lat, 6), "lon": round(lon, 6),
            "label": str(raw.get("label") or "").strip()[:140]}


def _distance_m(a, b):
    p1, p2 = math.radians(a["lat"]), math.radians(b["lat"])
    dp = p2 - p1
    dl = math.radians(b["lon"] - a["lon"])
    x = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 12742000 * math.asin(min(1, math.sqrt(x)))


def _own(uid):
    return get_db().execute(
        "SELECT free_text,interpreted_json,history_enabled FROM route_personality WHERE user_id=?",
        (uid,),
    ).fetchone()


def _consent(uid):
    row = _own(uid)
    return bool(row and row["history_enabled"])


def _write_consent(uid, enabled):
    db = get_db()
    row = _own(uid)
    if row:
        db.execute("UPDATE route_personality SET history_enabled=?,updated_at=? WHERE user_id=?",
                   (int(enabled), _now(), uid))
    else:
        db.execute(
            "INSERT INTO route_personality(user_id,free_text,interpreted_json,history_enabled,updated_at) VALUES(?,?,?,?,?)",
            (uid, "", "{}", int(enabled), _now()),
        )
    if not enabled:
        db.execute("DELETE FROM completed_optin_trips WHERE user_id=?", (uid,))
    db.commit()


def _groups_for(uid):
    if not _consent(uid):
        return 0, []
    since = (datetime.now(timezone.utc) - timedelta(days=45)).isoformat()
    rows = get_db().execute(
        """SELECT origin_label,origin_lat,origin_lon,destination_label,destination_lat,
                  destination_lon,local_weekday,local_hour,created_at
             FROM completed_optin_trips
             WHERE user_id=? AND created_at>=? ORDER BY created_at DESC LIMIT 160""",
        (uid, since),
    ).fetchall()
    groups = []
    for row in rows:
        a = {"lat": float(row["origin_lat"]), "lon": float(row["origin_lon"]), "label": row["origin_label"]}
        b = {"lat": float(row["destination_lat"]), "lon": float(row["destination_lon"]), "label": row["destination_label"]}
        chosen = None
        for candidate in groups:
            # Same origin/destination can be a morning and an evening routine.
            if (_distance_m(a, candidate["origin"]) <= 150
                and _distance_m(b, candidate["destination"]) <= 150
                and abs(int(row["local_hour"]) - candidate["reference_hour"]) <= 1):
                chosen = candidate
                break
        if chosen is None:
            chosen = {"origin": a, "destination": b, "samples": [], "created": set(),
                      "reference_hour": int(row["local_hour"])}
            groups.append(chosen)
        chosen["samples"].append((int(row["local_weekday"]), int(row["local_hour"])))
        chosen["created"].add(str(row["created_at"])[:10])
    result = []
    if len(rows) < 15:
        return len(rows), result
    for group in groups:
        if len(group["samples"]) < 4 or len(group["created"]) < 2:
            continue
        hours = [h for _, h in group["samples"]]
        local_hour = int(median(hours))
        nearby = [(d, h) for d, h in group["samples"] if abs(h - local_hour) <= 1]
        if len(nearby) < 4:
            continue
        days = sorted({d for d, _ in nearby})
        result.append({
            "origin": group["origin"], "destination": group["destination"],
            "count": len(nearby), "weekdays": days, "hour": local_hour,
        })
    result.sort(key=lambda x: x["count"], reverse=True)
    return len(rows), result


@app.post("/api/personal-routes/interpret")
@login_required
def personal_route_interpret():
    if not validate_csrf():
        return jsonify({"error": "Sessão inválida."}), 400
    if not rate_limit("personal-route-interpret", 30, 3600):
        return jsonify({"error": "Muitas solicitações."}), 429
    data = request.get_json(silent=True) or {}
    try:
        result = interpret_preference_text(data.get("text", ""))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(result)


@app.get("/api/personal-routes/settings")
@login_required
def personal_route_settings():
    uid = current_user()["id"]
    row = _own(uid)
    return jsonify({"history_enabled": _consent(uid),
                    "text": str(row["free_text"] or "") if row else ""})


@app.put("/api/personal-routes/consent")
@login_required
def personal_route_consent():
    if not validate_csrf():
        return jsonify({"error": "Sessão inválida."}), 400
    if not rate_limit("personal-route-consent", 12, 3600):
        return jsonify({"error": "Muitas alterações."}), 429
    data = request.get_json(silent=True) or {}
    if type(data.get("enabled")) is not bool:
        return jsonify({"error": "Consentimento inválido."}), 400
    _write_consent(current_user()["id"], data["enabled"])
    return jsonify({"ok": True, "history_enabled": data["enabled"]})


@app.post("/api/personal-routes/completions")
@login_required
def personal_route_completed():
    if not validate_csrf():
        return jsonify({"error": "Sessão inválida."}), 400
    if not rate_limit("personal-route-completed", 45, 3600):
        return jsonify({"error": "Limite de registros atingido."}), 429
    uid = current_user()["id"]
    if not _consent(uid):
        return jsonify({"error": "Ative o histórico antes de registrar viagens."}), 403
    data = request.get_json(silent=True) or {}
    trip_id = str(data.get("trip_id") or "")
    if not re.fullmatch(r"[A-Za-z0-9_-]{16,80}", trip_id):
        return jsonify({"error": "Viagem inválida."}), 400
    try:
        origin, destination = _point(data.get("origin")), _point(data.get("destination"))
        day, hour = int(data.get("weekday")), int(data.get("hour"))
        if day not in range(7) or hour not in range(24):
            raise ValueError("Data local inválida.")
        if _distance_m(origin, destination) < 120:
            raise ValueError("Viagem curta demais para reconhecer uma rotina.")
    except (ValueError, TypeError) as exc:
        return jsonify({"error": str(exc)}), 400
    db = get_db()
    # Avoid counting duplicate arrival callbacks and rapid replays as separate travels.
    latest = db.execute(
        """SELECT destination_lat,destination_lon,created_at FROM completed_optin_trips
           WHERE user_id=? ORDER BY created_at DESC LIMIT 1""", (uid,),
    ).fetchone()
    if latest:
        last = {"lat": float(latest["destination_lat"]), "lon": float(latest["destination_lon"])}
        try:
            ago = (datetime.now(timezone.utc) - datetime.fromisoformat(latest["created_at"])).total_seconds()
        except (ValueError, TypeError):
            ago = 100000
        if ago < 600 and _distance_m(destination, last) <= 150:
            return jsonify({"ok": True, "saved": False, "reason": "duplicate"})
    if db.execute("SELECT 1 FROM completed_optin_trips WHERE user_id=? AND trip_id=?",
                  (uid, trip_id)).fetchone():
        return jsonify({"ok": True, "saved": False, "reason": "duplicate"})
    db.execute(
        """INSERT INTO completed_optin_trips
           (user_id,trip_id,origin_label,origin_lat,origin_lon,destination_label,
            destination_lat,destination_lon,local_weekday,local_hour,created_at)
           VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
        (uid, trip_id, origin["label"], origin["lat"], origin["lon"],
         destination["label"], destination["lat"], destination["lon"], day, hour, _now()),
    )
    cutoff = (datetime.now(timezone.utc) - timedelta(days=60)).isoformat()
    db.execute("DELETE FROM completed_optin_trips WHERE user_id=? AND created_at<?", (uid, cutoff))
    db.commit()
    return jsonify({"ok": True, "saved": True})


@app.get("/api/personal-routes/suggestion")
@login_required
def personal_route_suggestion():
    uid = current_user()["id"]
    count, candidates = _groups_for(uid)
    saved = get_db().execute(
        "SELECT origin_lat,origin_lon,destination_lat,destination_lon FROM saved_smart_routines WHERE user_id=?",
        (uid,),
    ).fetchall()
    for candidate in candidates:
        if not any(
            _distance_m(candidate["origin"], {"lat": s["origin_lat"], "lon": s["origin_lon"]}) < 150
            and _distance_m(candidate["destination"], {"lat": s["destination_lat"], "lon": s["destination_lon"]}) < 150
            for s in saved
        ):
            return jsonify({"enabled": _consent(uid), "completed": count, "minimum": 15,
                            "suggestion": candidate})
    return jsonify({"enabled": _consent(uid), "completed": count,
                    "minimum": 15, "suggestion": None})


@app.route("/api/personal-routes/routines", methods=["GET", "POST"])
@login_required
def personal_route_routines():
    uid = current_user()["id"]
    db = get_db()
    if request.method == "GET":
        rows = db.execute(
            """SELECT id,name,origin_label,origin_lat,origin_lon,destination_label,
                      destination_lat,destination_lon,weekdays_json,local_hour,stops_json
               FROM saved_smart_routines WHERE user_id=? ORDER BY created_at DESC LIMIT 20""",
            (uid,),
        ).fetchall()
        return jsonify({"items": [
            {"id": r["id"], "name": r["name"],
             "origin": {"lat": r["origin_lat"], "lon": r["origin_lon"], "label": r["origin_label"]},
             "destination": {"lat": r["destination_lat"], "lon": r["destination_lon"], "label": r["destination_label"]},
             "weekdays": json.loads(r["weekdays_json"]), "hour": r["local_hour"],
             "stops": json.loads(r["stops_json"])} for r in rows
        ]})
    if not validate_csrf():
        return jsonify({"error": "Sessão inválida."}), 400
    if not rate_limit("personal-route-save", 20, 3600):
        return jsonify({"error": "Muitas alterações."}), 429
    count, candidates = _groups_for(uid)
    data = request.get_json(silent=True) or {}
    if not candidates:
        return jsonify({"error": "Ainda não há uma rotina recorrente validada."}), 409
    candidate = candidates[0]
    name = str(data.get("name") or "Minha rotina").strip()[:55]
    if not name:
        return jsonify({"error": "Informe o nome da rotina."}), 400
    weekdays = data.get("weekdays", candidate["weekdays"])
    if not isinstance(weekdays, list) or len(weekdays) > 7 or any(type(v) is not int or v not in range(7) for v in weekdays):
        return jsonify({"error": "Dias inválidos."}), 400
    try:
        hour = int(data.get("hour", candidate["hour"]))
    except (TypeError, ValueError):
        return jsonify({"error": "Horário inválido."}), 400
    if hour not in range(24):
        return jsonify({"error": "Horário inválido."}), 400
    stops = data.get("stops") or []
    if not isinstance(stops, list) or len(stops) > 2:
        return jsonify({"error": "Máximo de duas paradas."}), 400
    try:
        stops = [_point(x) for x in stops]
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    a, b = candidate["origin"], candidate["destination"]
    if db.execute("SELECT COUNT(*) AS total FROM saved_smart_routines WHERE user_id=?", (uid,)).fetchone()["total"] >= 20:
        return jsonify({"error": "Limite de 20 rotinas alcançado."}), 409
    db.execute(
        """INSERT INTO saved_smart_routines
           (user_id,name,origin_label,origin_lat,origin_lon,destination_label,
            destination_lat,destination_lon,weekdays_json,local_hour,stops_json,created_at)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
        (uid, name, a["label"], a["lat"], a["lon"], b["label"], b["lat"], b["lon"],
         json.dumps(sorted(set(weekdays))), hour, json.dumps(stops), _now()),
    )
    db.commit()
    return jsonify({"ok": True}), 201


@app.delete("/api/personal-routes/routines/<int:rid>")
@login_required
def personal_route_delete_routine(rid):
    if not validate_csrf():
        return jsonify({"error": "Sessão inválida."}), 400
    db = get_db()
    db.execute("DELETE FROM saved_smart_routines WHERE id=? AND user_id=?",
               (rid, current_user()["id"]))
    db.commit()
    return jsonify({"ok": True})


@app.delete("/api/personal-routes/data")
@login_required
def personal_route_erase():
    if not validate_csrf():
        return jsonify({"error": "Sessão inválida."}), 400
    uid = current_user()["id"]
    db = get_db()
    db.execute("DELETE FROM saved_smart_routines WHERE user_id=?", (uid,))
    db.execute("DELETE FROM completed_optin_trips WHERE user_id=?", (uid,))
    db.execute("DELETE FROM route_personality WHERE user_id=?", (uid,))
    db.commit()
    return jsonify({"ok": True})
