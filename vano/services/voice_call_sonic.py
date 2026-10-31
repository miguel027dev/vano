"""Admin-only streaming voice call: NVIDIA text + Cartesia Sonic PCM playback.

This is a two-way *application* pipeline (continuous browser recognition with
interruptible streamed responses), not a native speech-to-speech model.
It is disabled by default and never invokes navigation actions.
"""
import base64
import json
import os
import re

import requests
from flask import Response, jsonify, request, session, stream_with_context

from vano.services.voice_assistant import NVIDIA_URL, _cloud_ready

CARTESIA_URL = "https://api.cartesia.ai/tts/bytes"
SAMPLE_RATE = 24000
MAX_INPUT = 700
MAX_RESPONSE_CHARS = 1200
MAX_PCM_BYTES = 8_000_000


def _flag(name):
    return os.getenv(name, "").strip().lower() in {"1", "true", "yes", "on"}


def ready():
    return bool(
        _flag("VANO_SONIC_CALL_ENABLED")
        and _cloud_ready()
        and _flag("VANO_CARTESIA_COMMERCIAL_AUTHORIZED")
        and os.getenv("VANO_CARTESIA_API_KEY")
        and os.getenv("VANO_CARTESIA_VOICE_ID")
    )


def _event(kind, **data):
    return json.dumps({"type": kind, **data}, ensure_ascii=False, separators=(",", ":")) + "\n"


def _clean_history(raw):
    if not isinstance(raw, list):
        return []
    result = []
    for item in raw[-8:]:
        if not isinstance(item, dict):
            continue
        role = item.get("role")
        content = item.get("content")
        if role in {"user", "assistant"} and isinstance(content, str):
            content = content.strip()
            if 0 < len(content) <= MAX_INPUT:
                result.append({"role": role, "content": content})
    return result


def _segments(pending, *, final=False):
    """Emit speakable pieces without waiting for all LLM tokens."""
    chunks = []
    while pending:
        match = re.search(r"(?<=[.!?;:])\s+", pending)
        if match:
            cut = match.end()
        elif len(pending) > 145:
            cut = pending.rfind(" ", 70, 146)
            if cut < 70:
                break
            cut += 1
        elif final:
            cut = len(pending)
        else:
            break
        part, pending = pending[:cut].strip(), pending[cut:]
        if part:
            chunks.append(part)
    return chunks, pending


def _sonic_pcm(text):
    """Yield even-sized PCM s16le chunks, closing upstream on interruption."""
    voice_id = os.environ["VANO_CARTESIA_VOICE_ID"].strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]{8,100}", voice_id):
        raise ValueError("Invalid Sonic voice ID")
    response = requests.post(
        CARTESIA_URL,
        headers={
            "X-API-Key": os.environ["VANO_CARTESIA_API_KEY"],
            "Cartesia-Version": os.getenv("VANO_CARTESIA_API_VERSION", "2025-04-16"),
            "Content-Type": "application/json",
            "Accept": "audio/octet-stream",
        },
        json={
            "model_id": os.getenv("VANO_CARTESIA_MODEL", "sonic-3.6"),
            "transcript": text,
            "voice": {"mode": "id", "id": voice_id},
            "language": "pt",
            "output_format": {
                "container": "raw",
                "encoding": "pcm_s16le",
                "sample_rate": SAMPLE_RATE,
            },
        },
        stream=True,
        timeout=(4, 20),
    )
    try:
        response.raise_for_status()
        total, carry = 0, b""
        for block in response.iter_content(chunk_size=4096):
            if not block:
                continue
            joined = carry + block
            even = len(joined) & ~1
            carry = joined[even:]
            if even:
                audio = joined[:even]
                total += len(audio)
                if total > MAX_PCM_BYTES:
                    raise ValueError("Sonic audio budget exceeded")
                yield audio
    finally:
        response.close()


def _stream_call(text, history):
    messages = [{
        "role": "system",
        "content": (
            "Você é MAVI, assistente de voz do VANO Maps. Fale em português "
            "brasileiro, em frases curtas, naturais e úteis para conversa por áudio. "
            "Não invente localização, trânsito, rotas, alertas ou tempo de viagem. "
            "Não execute ações de GPS ou navegação: explique que mudanças de rota "
            "precisam ser confirmadas pelo aplicativo. Não use Markdown."
        ),
    }, *history, {"role": "user", "content": text}]
    response = None
    try:
        response = requests.post(
            NVIDIA_URL,
            headers={
                "Authorization": "Bearer " + os.environ["VANO_NVIDIA_API_KEY"],
                "Content-Type": "application/json",
            },
            json={
                "model": os.environ["VANO_NVIDIA_MODEL"],
                "messages": messages,
                "stream": True,
                "max_tokens": 260,
                "temperature": 0.35,
            },
            stream=True,
            timeout=(4, 35),
        )
        response.raise_for_status()
        yield _event("started")
        pending, total = "", 0
        for line in response.iter_lines(chunk_size=256):
            if not line or not line.startswith(b"data:"):
                continue
            data = line[5:].strip()
            if data == b"[DONE]":
                break
            try:
                payload = json.loads(data)
                delta = (payload.get("choices") or [{}])[0].get("delta") or {}
                token = delta.get("content") or ""
            except (ValueError, IndexError, AttributeError, TypeError):
                continue
            if not isinstance(token, str) or not token:
                continue
            token = token[: max(0, MAX_RESPONSE_CHARS - total)]
            total += len(token)
            pending += token
            parts, pending = _segments(pending)
            for part in parts:
                yield _event("text", text=part)
                for pcm in _sonic_pcm(part):
                    yield _event("audio", data=base64.b64encode(pcm).decode("ascii"))
            if total >= MAX_RESPONSE_CHARS:
                break
        parts, _ = _segments(pending, final=True)
        for part in parts:
            yield _event("text", text=part)
            for pcm in _sonic_pcm(part):
                yield _event("audio", data=base64.b64encode(pcm).decode("ascii"))
        yield _event("complete")
    except (requests.RequestException, ValueError, KeyError, TypeError, IndexError) as exc:
        # Never log provider response bodies, keys, transcripts, or raw URLs.
        from flask import current_app
        current_app.logger.warning("MAVI call upstream error: %s", type(exc).__name__)
        yield _event("error", code="provider_unavailable")
    finally:
        if response is not None:
            response.close()


def register_sonic_call(app, *, rate_limit, validate_csrf, is_admin):
    @app.get("/api/admin/sonic-call/capabilities")
    def sonic_call_capabilities():
        if not session.get("user_id") or not is_admin():
            return jsonify({"ok": False, "code": "forbidden"}), 403
        response = jsonify({"ok": True, "available": ready(), "requires_headphones": True})
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.post("/api/admin/sonic-call/stream")
    def sonic_call_stream():
        if not session.get("user_id") or not is_admin():
            return jsonify({"ok": False, "code": "forbidden"}), 403
        if not validate_csrf():
            return jsonify({"ok": False, "code": "invalid_csrf"}), 403
        if not rate_limit("sonic-call-admin", 12, 60, identity=session["user_id"], shared=True):
            return jsonify({"ok": False, "code": "rate_limited"}), 429
        if not ready():
            return jsonify({"ok": False, "code": "disabled"}), 503
        data = request.get_json(silent=True) or {}
        text = data.get("text")
        if not isinstance(text, str) or not 0 < len(text.strip()) <= MAX_INPUT:
            return jsonify({"ok": False, "code": "invalid_input"}), 400
        history = _clean_history(data.get("history"))
        return Response(
            stream_with_context(_stream_call(text.strip(), history)),
            mimetype="application/x-ndjson",
            headers={
                "Cache-Control": "no-store, no-transform",
                "X-Content-Type-Options": "nosniff",
                "X-Accel-Buffering": "no",
            },
        )
