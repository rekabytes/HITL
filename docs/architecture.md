# Architecture

```
 ESP32 + BME280 ──POST /api/sensor──┐
                                     │
 Mobile app ──POST /api/feedback─────┤            ┌──────────┐
            ──/api/auth/*, /api/rooms┤            │  ml      │
                                     ▼            │ FastAPI  │
                              ┌─────────────┐     │ sklearn  │
 Admin / FM browser ◀──SSR──▶ │  web        │────▶│          │
                  ◀──SSE────  │  Next.js    │     └──────────┘
                              └──┬───────┬──┘
                                 │       │
                          ┌──────▼──┐ ┌──▼─────┐
                          │Postgres │ │ Redis  │
                          └─────────┘ └────────┘
```

## Request flows

**Sensor reading.** The ESP32 posts JSON with its device key. `web` looks up the key's HMAC in `sensors`, so the reading lands in the right room. It writes the row to `sensor_readings`, stores the latest reading in Redis, publishes it on the `hitl:live` channel and checks the comfort band for alerts.

**Occupant vote.** The mobile app scans the room's QR code (it holds the room code) and posts the vote with a bearer token. `web` attaches the room's current temperature and humidity to the vote if the last reading is under 30 minutes old. That pairing is the training data. It then checks whether most recent votes say too hot or too cold, which opens an alert, and starts a retrain once 50 new labelled votes have come in.

**Dashboard.** The facility manager dashboard renders from Postgres and Redis on the server, then opens `/api/stream`. That route subscribes to `hitl:live` and forwards readings, votes and alerts as server-sent events, so the room cards update without polling.

**Recommendations.** Rules in `@hitl/shared` turn the reading, the comfort band and recent votes into advice. Votes win over the sensor when at least three people agree. The `ml` service adds a comfort score next to the advice. Predictions are cached for 30 seconds per room.

## What Redis is for

Redis is a cache, never the source of truth. If it goes down, ingest, votes and pages keep working from Postgres; only the live feed stops and rate limits fail open.

| Key | Use | TTL |
|---|---|---|
| `hitl:room:<id>:latest` | Latest reading per room | 15 min |
| `hitl:room:<id>:status` | Model prediction per room | 30 s |
| `hitl:session:<hash>` | Session lookup | 60 s |
| `hitl:rate:<bucket>` | Login, sign-up, sensor and vote rate limits | window |
| `hitl:ml:train-lock` | One training run at a time | 10 min |
| `hitl:live` (channel) | Live dashboard events | — |

## Auth

One `sessions` table for both clients. The web portal keeps the token in an httpOnly cookie, the mobile app sends it as `Authorization: Bearer`. Only an HMAC of the token is stored. Passwords use bcrypt. Roles are `admin`, `facility_manager` and `occupant`; the portal only lets in the first two, and admins see the facility manager pages as well.

Device keys work the same way: the plain key is shown once, and only its HMAC is stored.

## Changes from the old project

- MongoDB became Postgres with a real schema and foreign keys; three feedback shapes became one.
- Each sensor is tied to a room through its key, where the old code labelled every reading "Unassigned".
- The comfort model trains on occupant votes. The old model trained on a made-up formula around 24 °C.
- Passwords are hashed everywhere, and no credentials live in code.
- Old readings are pruned by age (`pnpm db:prune`), where the old code deleted 1,000 rows whenever the total reached 5,000.
