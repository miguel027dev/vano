# MAVI full-duplex voice — architecture and rollout (2026-10-18)

## Confirmed baseline
- Render: Miguel PNXS, service `vanu`, branch `preview/vano-react-v2-7`, manual deploy.
- The browser uses SpeechRecognition with fallback to a recorded-audio STT endpoint. Recognition stops during `PROCESSING` and `SPEAKING`.
- NVIDIA NIM `/v1/chat/completions` currently uses non-streaming JSON for **intent validation**. This protects navigation/map changes from direct model execution.
- Cartesia `/tts/bytes` is already proxied through a signed, single-use ticket and streamed as MP3; the browser attempts MediaSource playback before falling back to a blob.
- Navigation guidance preempts MAVI responses. Do not change this.
- STT upstream currently supports optional batch Groq/OpenAI only; it is NOT a continuous STT connection.

## Phase 1 — guarded local barge-in (this PR)
- Keep echo-cancelled microphone measurement running only after explicit MAVI activation.
- While MAVI is processing or speaking, use a speech-band energy threshold, learned ambient floor, grace window and sustained detection to interrupt.
- Abort the current NVIDIA/Cartesia HTTP requests, invalidate old turn sequence numbers, stop only MAVI's own audio and restart the existing recognizer.
- Do not interrupt navigation guidance, request GPS changes or upload microphone samples with this monitor.
- If Web Audio, microphone or echo cancellation is unavailable, retain the original flow.
- A level-based VAD cannot reliably distinguish all speech from road noise or residual speaker echo: **this is a foundation, not end-to-end full-duplex ASR**.

## Phase 2 — full-duplex transport (not included yet)
```text
Browser (user opt-in)
  AudioWorklet PCM16 16 kHz, 20-40 ms frames
      ├── uplink: secure WebSocket ──> session/STT streaming ──> stable partial/final text
      └── downlink: PCM/Opus audio chunks <── Cartesia TTS streaming <── NVIDIA text deltas
                                          └── deterministic map intents still validated server-side
```
- Use an authenticated one-time, short-lived session ticket obtained via CSRF-protected HTTP. Validate Origin, session, rate limits, frame size and expiration during the WebSocket handshake.
- One WebSocket carries simultaneous uplink audio and downlink audio/events; independent abort controllers per turn. Never put provider keys in the browser.
- A server-controlled STT streaming service (e.g. Cartesia Ink, contingent on account support) is required. Do not silently reinterpret the batch STT endpoint as streaming.
- Use ASR interim transcripts for *display/endpointing*, not immediate map commands. Accept final/stable text before routing and require existing approval flows for navigation modifications.
- Use NVIDIA SSE `stream:true` for conversational, read-only turns; buffer and validate individual complete sentences before forwarding to TTS. Keep the current strict JSON interpreter for route/street/POI intents.
- Use Cartesia's WebSocket context/chunk streaming for low first-audio latency; cancel obsolete contexts on barge-in. Avoid generating synthetic 'thinking' phrases during real provider delays.
- Playback jitter buffer target 100-200 ms and bounded queues. Preserve ordering by `session_id/turn_id/chunk_id`, discard stale chunks, apply backpressure, timeouts and reconnect using idempotent handshake.
- Speech starts only on fresh user action or an active user-enabled MAVI voice session. Respect browser background/microphone policies.

## Time budget / instrumentation
Instrument separate `stt_first_partial_ms`, `stt_final_ms`, `nim_first_token_ms`, `nim_total_ms`, `tts_first_audio_ms`, `playback_first_audio_ms`, `barge_in_cancel_ms`, `voice_turn_total_ms` and error/circuit counters. Record numbers and failure codes only: no speech, utterance, GPS, identifiers, token, voice blobs or raw NIM response. Establish current p50/p95 from test samples before choosing thresholds.
- Timeouts are **per stage**, not one blanket deadline. Abort canceled turns immediately and use bounded fallback only on true upstream failure.
- Do not change NVIDIA temperature, existing model, voice IDs, navigation speech or legal/privacy text as part of latency tuning.

## Test and release gates
1. Gate tests: ambient road noise, short horn, sustained speech, disarm, cooldown.
2. Browser device matrix: Android Chromium/WebView, Chrome desktop, headset, speakerphone, background, denied mic, audio AEC unavailable.
3. Integration: interrupt during NVIDIA delay, during Cartesia streaming, during local browser TTS; stale responses must never resume.
4. Regression: road/POI/route confirmation unchanged; navigation has priority; audio fallback works.
5. Network: throttled 3G, high RTT, disconnections/reconnects, unavailable NVIDIA and Cartesia; no leaked streams or unhandled rejections.
6. CI `v2/npm test` and `npm run build`, then private canary testing. No direct deploy from feature branch.
7. Rollback: return Render to `preview/vano-react-v2-7` commit `653bcb8d652c9f2b283ab8637a4d1e32921bd1e6` (backup: `backup/vanu-20261018-pre-duplex`).

## Security/privacy
Browser mic runs only after explicit toggle; release all tracks on shutdown or unmount. Never log or persist audio. Maintain server-only NVIDIA/Cartesia keys, signed tickets, CSRF protections, and existing deterministic map action validation.
