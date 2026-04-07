# Control Plane

TypeScript Fastify service for bot management with a minimal Discord-style dashboard.

## Stack

- Fastify (HTTP + static hosting)
- Prisma + PostgreSQL
- Vanilla frontend (HTML/CSS/JS) served from `public/`

## Features

- Guild policy CRUD
- Test dispatch to bot runtime
- Dispatch log timeline
- Internal config endpoint for bot fetch

## Environment

Use `.env.example` as template.

## Database

- Prisma schema: `prisma/schema.prisma`
- Run migrations: `npm run prisma:migrate --workspace @mars/control-plane`