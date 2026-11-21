# HITL Smart Building

Human-in-the-loop environmental monitoring for buildings. ESP32 + BME280 sensors report temperature and humidity, occupants vote on comfort from the mobile app, and facility managers see both side by side with alerts and advice. A comfort model learns from the votes what people in these rooms actually call comfortable.

This repo is the rewrite of the Streamlit + FastAPI + MongoDB final-year project into one monorepo.

## Packages

| Package | What it is |
|---|---|
| [`packages/web`](packages/web) | Next.js portal for admins and facility managers, plus the HTTP API for sensors and the mobile app |
| [`packages/db`](packages/db) | Postgres schema and migrations (Drizzle), retention and Mongo import scripts |
| [`packages/shared`](packages/shared) | Zod schemas, roles, vote types and the rule-based recommendation logic |
| [`packages/ml`](packages/ml) | Python FastAPI service holding the random forest comfort model |

The Flutter app moves in later as `packages/mobile` and talks to the web API instead of MongoDB.

## Stack

- Next.js 16 (App Router, server actions, route handlers), React 19, TypeScript
- PostgreSQL 17 with Drizzle ORM
- Redis 7: latest reading per room, prediction cache, session cache, rate limits, training lock and the live dashboard feed (pub/sub to server-sent events)
- Python 3.12, FastAPI, scikit-learn
- Docker Compose for the whole stack, GitHub Actions for CI

## Quick start (Docker)

```bash
pnpm env:setup
docker compose up --build
```

Open http://localhost:3000. The first visit asks you to create the first admin.

## Local development

Needs Node 22+, pnpm 11, Docker and Python 3.12.

```bash
pnpm install
pnpm env:setup
docker compose -f compose.yaml -f compose.dev.yaml up -d postgres redis migrate ml
pnpm dev
```

After changing `packages/db/src/schema.ts`, run `pnpm db:generate` and commit the new file in `packages/db/migrations`.

## First steps after sign-in

1. **Rooms and sensors:** add a building, then rooms. Each room has a code such as `L21`; print its QR code for the door.
2. Register each ESP32 under its room and copy the device key into the firmware (see [docs/sensors.md](docs/sensors.md)).
3. **Users:** create facility manager accounts.
4. **Persons in charge:** one contact per room, emailed when an alert opens there.

## Docs

- [Architecture](docs/architecture.md)
- [Database](docs/database.md)
- [API](docs/api.md)
- [Sensors (ESP32)](docs/sensors.md)
- [Environment variables](docs/environment.md)
- [Moving data from the old MongoDB](docs/migration.md)
