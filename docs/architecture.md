# Architecture

```
 ESP32 + BME280 ──POST /api/sensor──┐
                                     │
 Occupant PWA ◀──SSR /app, /r/:code──┤            ┌──────────┐
 (phone)      ──POST /api/feedback───┤            │  ml      │
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

**Sensor reading.** The ESP32 posts JSON with its device key. `web` looks up the key's HMAC in `sensors`, so the reading lands in the rooms that sensor covers. It writes one row per room to `sensor_readings`, then works out the room's current conditions: the latest reading from each sensor that reported in the last 15 minutes, averaged. A large room with two sensors therefore shows one value for the whole room. That average goes into Redis, out on the `hitl:live` channel, into the comfort-band alert check, and onto any vote cast in the room.

**Occupant vote.** The QR code on each door holds the room's URL, `APP_URL/r/CODE`. Scanning it with any phone camera opens the vote screen; a signed-out visitor signs in (or signs up) and lands straight back on it. The PWA's own scanner reads the same codes, and old door signs that hold only the bare code. The vote screen posts to `/api/feedback` with the session cookie. `web` attaches the room's temperature and humidity to the vote if the last reading is under 30 minutes old. That pairing is the training data. It then checks whether most recent votes say too hot or too cold, which opens an alert, and starts a retrain once 50 new labelled votes have come in.

**Offline votes.** With no signal, the PWA keeps the vote in `localStorage` (tagged with the user, so a shared phone never sends it under someone else) and sends it when the connection returns or the app is reopened. It carries `votedAt`, and `web` stores it at that time, paired with the room's readings averaged over the 15 minutes before it, so a late vote trains the model as if it had arrived on time.

## Occupant app (PWA)

The occupant app is part of `web`, not a separate project: `/app` (home, scan, my votes, account) and `/r/:code` (vote) are phone-first pages that share the API, auth and styles with the portal.

- **Install.** `src/app/manifest.ts` makes it installable (Android prompts, iPhone uses Share → Add to Home Screen). Icons are drawn at build time by `src/lib/app-icon.tsx`, so no image files are committed.
- **Service worker.** `public/sw.js`, hand-written. Occupant pages are network-first with the last copy kept for offline use, hashed build assets are cache-first, and the portal and API are never cached. It registers in production builds only (`NEXT_PUBLIC_PWA_DEV=1` turns it on in dev). Signing out clears the cached pages and the user's unsent votes.
- **Camera.** The scanner uses the browser's `BarcodeDetector` where it exists (Chrome on Android) and `jsqr` elsewhere (Safari, Firefox). Camera access and service workers need HTTPS or `localhost`.

**Dashboard.** The facility manager dashboard renders from Postgres and Redis on the server, then opens `/api/stream`. That route subscribes to `hitl:live` and forwards readings, votes and alerts as server-sent events, so the room cards update without polling.

**Alerts.** Alerts open automatically (out-of-band readings, most recent votes too hot or too cold, a sensor gone quiet) or by hand. Either way the room's person in charge gets an email, staff can send it again with Re-notify, and an alert still unacknowledged after `ALERT_ESCALATE_AFTER_MIN` minutes becomes critical and is emailed again as an escalation. The escalation check runs on each sensor reading and when the dashboard or alerts page loads; one database update claims each alert, so it is never sent twice.

**Recommendations.** Rules in `@hitl/shared` turn the reading, the comfort band and recent votes into advice. Votes win over the sensor when at least three people agree. The `ml` service adds a comfort score next to the advice. Predictions are cached for 30 seconds per room. An energy line shows overcooling: degrees below the comfort band times about 7% extra cooling per degree, a common facility rule of thumb. It is an estimate from temperature, not a meter reading.

## What Redis is for

Redis is a cache, never the source of truth. If it goes down, ingest, votes and pages keep working from Postgres; only the live feed stops and rate limits fail open.

| Key | Use | TTL |
|---|---|---|
| `hitl:room:<id>:latest` | Current room conditions (average of each sensor's latest reading) | 15 min |
| `hitl:room:<id>:status` | Model prediction per room | 30 s |
| `hitl:session:<hash>` | Session lookup | 60 s |
| `hitl:rate:<bucket>` | Login, sign-up, sensor and vote rate limits | window |
| `hitl:ml:train-lock` | One training run at a time | 10 min |
| `hitl:live` (channel) | Live dashboard events | — |

## Auth

One `sessions` table for every client. The browser (portal and occupant PWA) keeps the token in an httpOnly cookie; API clients send it as `Authorization: Bearer`. Only an HMAC of the token is stored. Passwords use bcrypt. Roles are `admin`, `facility_manager` and `occupant`. Everyone signs in at `/login`: staff land on the portal, occupants on `/app`. The portal pages only let in staff, and admins see the facility manager pages as well. Any role may use the occupant app, which is handy for staff checking a room.

Device keys work the same way: the plain key is shown once, and only its HMAC is stored.

## Changes from the old project

- MongoDB became Postgres with a real schema and foreign keys; three feedback shapes became one.
- Each sensor is tied to a room through its key, where the old code labelled every reading "Unassigned".
- The comfort model trains on occupant votes. The old model trained on a made-up formula around 24 °C.
- Passwords are hashed everywhere, and no credentials live in code.
- Old readings are pruned by age (`pnpm db:prune`), where the old code deleted 1,000 rows whenever the total reached 5,000.
