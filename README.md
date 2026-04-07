# MARS Discord Voice Agent Platform

Production-oriented monorepo for a Discord AI voice moderation product deployed as two Railway services:

1. **Bot Service (`@mars/bot`)**
- Consumes transcript events (LiveKit webhook or manual dispatch)
- Performs intent extraction through LiveKit Inference (with rule fallback)
- Executes Discord moderation actions (mute, unmute, deafen, undeafen, move)
- Replies by Discord text fallback, VC beep acknowledgement, or LiveKit Inference TTS playback

2. **Control Plane (`@mars/control-plane`)**
- Web dashboard to manage per-guild policy
- Internal API for bot config reads
- Dispatch console for live command tests
- Persistent storage with Prisma + Postgres

## Architecture

```text
Discord VC user speech
  -> LiveKit STT
  -> Bot /v1/livekit/webhook
  -> Intent engine (LiveKit inference/rules)
  -> Discord action execution
  -> Response bridge (text / beep / TTS)

Control Plane Dashboard
  -> /api/guilds (policy CRUD)
  -> /api/dispatch (test command)
  -> Bot /v1/dispatch
  -> Dispatch logs persisted in Postgres
```

## Monorepo Layout

- `apps/bot` - Discord runtime + AI action orchestrator
- `apps/control-plane` - Fastify control-plane API + static dashboard + Prisma
- `packages/contracts` - shared schemas/types (Zod)

## Local Development

### 1) Install dependencies

```bash
npm install
```

### 2) Configure environment files

```bash
cp apps/bot/.env.example apps/bot/.env
cp apps/control-plane/.env.example apps/control-plane/.env
```

Required values:
- Bot: `DISCORD_BOT_TOKEN`, `DISCORD_APPLICATION_ID`, `INTERNAL_API_KEY`
- Control Plane: `DATABASE_URL`, `BOT_SERVICE_URL`, `INTERNAL_API_KEY`
- Bot LiveKit inference: `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`

### 3) Prepare database

From `apps/control-plane`:

```bash
npm run prisma:migrate --workspace @mars/control-plane
```

### 4) Run services

Bot:

```bash
npm run dev:bot
```

Control Plane:

```bash
npm run dev:web
```

## Railway Deployment (Two Services)

Create two Railway services from the same repo.

### Service A: `bot`
- Start command: `npm run railway:bot`
- Variables from `apps/bot/.env.example`
- Expose port `8080`

### Service B: `control-plane`
- Start command: `npm run railway:web`
- Variables from `apps/control-plane/.env.example`
- Attach Postgres plugin
- Expose port `3000`

Set shared secret key:
- `INTERNAL_API_KEY` must match in both services.

Set bot-control plane connectivity:
- In bot service: `CONTROL_PLANE_URL=https://<your-control-plane-domain>`
- In control plane: `BOT_SERVICE_URL=https://<your-bot-domain>`

## Security Notes

- Internal bot/control-plane APIs are protected by `x-api-key`.
- Add Discord OAuth admin auth in control plane before public release.
- Add audit trails and role checks for production moderation teams.
- Tune response behavior per server (text-only, beep acknowledgement, or full TTS).

## Next Market-Level Upgrades

1. LiveKit webhook signature verification.
2. Real Discord OAuth and team RBAC in control plane.
3. Redis queue + retry strategy for action execution.
4. Observability (OpenTelemetry, structured trace IDs, alerting).
5. Policy simulator + approval workflow for risky actions.

