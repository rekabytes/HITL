# HITL Smart Building

Human-in-the-loop environmental monitoring for buildings. ESP32 devices with SHT3x or BME280 sensors report temperature and humidity, occupants scan the QR code on the door and vote on comfort from their phone, and facility managers see both side by side with alerts and advice. A comfort model learns from the votes what people in these rooms actually call comfortable.

This repo is the rewrite of the Streamlit + Flutter + FastAPI + MongoDB final-year project into one monorepo. The Flutter app is replaced by an installable web app (PWA) in the same Next.js project.

Production: [https://hitl.reka-bytes.my](https://hitl.reka-bytes.my) · [Public API reference](https://hitl.reka-bytes.my/docs) · [Current state and changelog](docs/current-state.md)

## Packages

| Package | What it is |
|---|---|
| [`packages/web`](packages/web) | Next.js: the occupant PWA (`/app`, `/r/:code`), the portal for admins and facility managers, and the HTTP API for sensors |
| [`packages/db`](packages/db) | Postgres schema and migrations (Drizzle), retention and Mongo import scripts |
| [`packages/shared`](packages/shared) | Zod schemas, roles, vote types and the rule-based recommendation logic |
| [`packages/ml`](packages/ml) | Python FastAPI service holding the random forest comfort model |

## Stack

- Next.js 16 (App Router, server actions, route handlers), React 19, TypeScript
- Occupant app as a PWA: web app manifest, hand-written service worker, offline vote queue, QR scanning with `BarcodeDetector` or `jsqr`
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

## Occupant app (PWA)

Occupants use the same site on their phone. Sign in at `/login` (or create an account at `/signup`) and you land on `/app`: scan a room's QR code, vote too cold / perfect / too hot, see your past votes. From the browser menu choose **Install app** (Android) or **Share → Add to Home Screen** (iPhone) to get it as an app icon.

On a laptop, `http://localhost:3000/app` works as is. On a real phone, the camera, install and offline support all need **HTTPS**, so put the dev server behind a tunnel and point `APP_URL` at it so the door QR codes use that address:

```bash
cloudflared tunnel --url http://localhost:3000
```

The service worker only runs in production builds (`docker compose up --build`), or in dev with `NEXT_PUBLIC_PWA_DEV=1`.

## First steps after sign-in

1. **Rooms and sensors:** add a building, then rooms. Each room has a code such as `L21`; print its QR code for the door. The QR opens `APP_URL/r/L21`, so set `APP_URL` to the address phones will use before printing.
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
