# Bot Service

Runtime service that receives transcript events and executes Discord moderation actions.

## Endpoints

- `GET /health`
- `POST /v1/transcript` (internal)
- `POST /v1/dispatch` (internal)
- `POST /v1/livekit/webhook` (internal)

All non-health endpoints require header:

- `x-api-key: <INTERNAL_API_KEY>`

## Voice Response Modes

1. Beep mode (default)
- Keep `ENABLE_VOICE_BEEP=true` and `ENABLE_VOICE_TTS=false`
- Bot joins the source voice channel and plays a short beep acknowledgement.

2. Voice TTS mode
- Set `ENABLE_VOICE_TTS=true`
- Provide `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`
- Bot joins the source voice channel and plays synthesized reply audio.

3. Text-only mode
- Set `ENABLE_VOICE_BEEP=false` and `ENABLE_VOICE_TTS=false`
- Bot posts `Agent: ...` into an available guild text channel.

## Environment

Use `.env.example` as template.
