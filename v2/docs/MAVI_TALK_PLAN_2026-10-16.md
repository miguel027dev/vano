# MAVI Talk — release plan and integration (2026-10-16)

## Goal
Turn the existing MAVI into a helpful conversational voice assistant in Brazilian Portuguese, not just a route-command parser. Allow low-stakes conversation, normal general knowledge and empathetic responses to "Hoje meu dia foi triste" using the configured NVIDIA NIM model, while all route changes and live navigation readings stay deterministic.

## Existing flow / bugs identified
- The frontend short-circuited virtually every greeting as a canned response. "Oi MAVI, você tá bem?" would never reach NVIDIA.
- The backend sent only the current sentence to NVIDIA, so "E depois?" lost context.
- The NVIDIA schema restricted general talk to 180 characters and treated many ordinary conversations as unsupported.
- NVIDIA timeout must not stall turn-by-turn route commands.

## Implementation
- Transient per-tab history (up to three recent user/assistant exchanges), cleared on account changes; no database retention of conversations.
- Social-turn recognizer shared by browser and server, ensuring "Oi MAVI!" and route commands still return immediately.
- NVIDIA GPT-OSS/optional configured model with constrained JSON output, bounded talk budget, Portuguese short, variable, context-aware replies; verify server origin/identity and avoid direct navigation actions on conversational turns.
- Privacy: NVIDIA receives only the spoken text, short previous dialogue and sanitized boolean intent metadata; never GPS coordinates, addresses, email, user IDs or route geometries.
- On NVIDIA timeout/auth failure, give a limited empathetic fallback instead of an irrelevant list of map commands. Do not fabricate knowledge, emotions, web access or live conditions.
- Existing browser microphone/STT and server Cartesia/ElevenLabs TTS paths remain intact; maneuver speech continues to preempt chat audio.

## Test matrix
1. Opening greetings remain local; social questions go to NVIDIA.
2. "Como você tá?", bad-day disclosures, open conversation and short follow-ups work coherently.
3. Current ETA and GPS are only answered by deterministic VANO data, not NVIDIA claims.
4. Prompt injection cannot issue route/POI changes during conversational messages.
5. Chat history is bounded, stripped of extraneous fields and never written to PostgreSQL.
6. NVIDIA disabled, timeout, invalid JSON and interrupted speech recover without navigational state corruption.
7. All V2 npm tests, build, main Python CI and Render build before production.

## Backup, deploy and rollback
- Previous production commit: `7ddfb8b4b587339bb3478a3f22d72bf1e8c23325`.
- Backup branch: `backup/vanu-20261016-before-mavi-talk`.
- Work branch: `feat/mavi-talk-20261016`.
- Merge via PR into `preview/vano-react-v2-7` only after green CI.
- Render service: `vanu` (manual deployment, autoDeploy disabled).
- Roll back to the backup commit if build, response latency or turn-by-turn routing regresses.

## Known limits
- Model intelligence and conversation depend on NVIDIA credentials, feature flag, upstream availability and latency; retries and fallback do not substitute for the hosted model.
- The browser may restrict the mic when backgrounded, the device locks or permission is revoked; MAVI does not provide true always-on operating-system assistant access.
- Hosted speech content is sent to NVIDIA for generation only when the user starts a conversational request. Explicit opt-in and privacy notice should accompany MAVI Talk UI as the feature matures.
