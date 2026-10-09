# VANO Voice — offline-first, providers opt-in

## State (2026-10-09)
This module is a **safe integration scaffold**, not an activated NVIDIA/ElevenLabs production subscription. It does not create third-party accounts or obtain API keys. No provider trial may be used in production without appropriate rights.

- Web companion loads on public/non-admin pages, excluded from onboarding and navigation driving mode.
- Browser SpeechRecognition where supported; candidate Android WebView provides an explicit user-initiated system recognizer. On Android API 31+, on-device speech is requested when supported and installed; older devices may require network. No audio is uploaded to VANO.
- Offline fallback: **typed questions, a small local Portuguese phrasebook**, and offline Android TTS only with installed local language voices. General translation, AI answers, new map routes, and cloud speech generation are **not** available without connectivity.
- Cloud: NVIDIA NIM chat completions (text response and translation), ElevenLabs TTS. The backend stores neither prompts nor speech audio. Cloud requests are limited, server-side authenticated and CSRF protected. Never embed API tokens in the app.
- Voice is opt-in. Users must explicitly click the microphone or 'Ouvir resposta'; recognized words remain editable before submission.

## Activation (only after authorized provider accounts and permitted production licensing)
Provide Render environment variables **via Render Secrets**, never commit them:
- `VANO_VOICE_CLOUD_ENABLED=1`
- `VANO_NVIDIA_API_KEY=...`
- `VANO_NVIDIA_MODEL=...` — exact model ID from an available, authorized NVIDIA endpoint
- `VANO_NVIDIA_PRODUCTION_AUTHORIZED=1` — production/redistribution rights verified, not a trial-only token
- `VANO_ELEVENLABS_API_KEY=...`
- `VANO_ELEVENLABS_VOICE_ID=...`
- `VANO_ELEVENLABS_MODEL=eleven_multilingual_v2` (optional)
- `VANO_ELEVENLABS_LICENSED=1` — operator has verified age/account eligibility and commercial license for VANO production

If authorization/keys aren't present, cloud operations stay disabled (HTTP 503 with stable codes). The default local UI still works. Do not enable trial-only APIs for public Play Store traffic. For third-party vendors, use an account held by an eligible person/entity according to provider terms.

## Security and scope
Cloud endpoints:
- `GET /api/voice/capabilities`: exposes readiness booleans, not secrets
- `POST /api/voice/message`: requires session, CSRF, shared rate limit; accepts at most 700 characters and a supported locale; does not access real-time GPS or create routes
- `POST /api/voice/speech`: requires session, CSRF, quota guard, commercial entitlement; 700 characters max, bounded MP3 response

No secret content appears in responses. Provider failures are logged by **exception type**, not raw URLs or authorization headers. Both results and audio have `Cache-Control: no-store`.

External data processing: text explicitly submitted to NVIDIA and text to ElevenLabs when separately requested. Privacy and terms disclosures should be reviewed before any public activation.

## Release gates
- CI + Android candidate build; physical-device test of permission granted/denied, airplane mode with installed speech pack, voice data missing, text fallback, native map rendering, and stop/cancel.
- Android candidate `com.vano.maps.fluidez` is **not** the Play package; do not treat the generated APK as an authorized Play Store update.
- Revisit API costs and quota; free trials are evaluation-only and/or not licensed for commercial use.

Docs: https://docs.api.nvidia.com/nim/reference/llm-apis and https://elevenlabs.io/docs/api-reference/text-to-speech/convert .
