# API

All bodies are JSON. Errors look like `{"error": "message"}`, and invalid bodies return 422 with `details`.

## Sensors

### `POST /api/sensor`

Header `X-Device-Key: <key>` (or `Authorization: Bearer <key>`).

Current firmware reports every minute. A successful BME280 read sends:

```json
{ "sensorStatus": "online", "firmwareVersion": "hitl-1.2.0", "reading": { "temperature": 27.4, "humidity": 66.1, "pressure": 1008.2 } }
```

If the hardware is unavailable, send a heartbeat without measurements:

```json
{ "sensorStatus": "offline", "firmwareVersion": "hitl-1.2.0" }
```

The failure report returns `{"status":"heartbeat","sensorStatus":"offline"}` and stores no reading. A successful read returns `{"status":"stored","roomIds":["..."],"assigned":true}`; an assigned reading is stored once per room. Up to 120 reports per minute are accepted per device. Legacy flat reading bodies still work during rollout, but do not confirm BME280 health. The firmware requires pressure for a valid read; legacy requests may omit it.

## Occupant app

The occupant app is the PWA in `packages/web` (`/app`, `/r/:code`). It signs in through the normal `/login` and `/signup` pages and calls these endpoints with the session cookie. Any other client (a script, a kiosk, a future native app) can sign in through the API instead and send `Authorization: Bearer <token>` on every call.

| Method and path | Body | Returns |
|---|---|---|
| `POST /api/auth/register` | `{name, email, password}` | `{token, expiresAt, user}`; always an occupant |
| `POST /api/auth/login` | `{email, password}` | `{token, expiresAt, user}` |
| `POST /api/auth/password` | `{currentPassword, newPassword}` | `{status: "changed"}`; ends the user's other sessions |
| `POST /api/auth/logout` | none | `{status: "signed_out"}` |
| `GET /api/rooms` | none | `{items: [{code, name, building, floor}]}` |
| `GET /api/rooms/:code` | none | `{code, name, building, floor, conditions}`; `conditions` is null when no sensor reported in the last 30 minutes |
| `POST /api/feedback` | `{roomCode, vote, comfortable, comment?, votedAt?}` | `201 {status, id, room}` |

`vote` is `too_cold`, `perfect` or `too_hot`. Votes are limited to 10 per user per 10 minutes.

`votedAt` (ISO 8601) is for votes that were queued offline and sent later. The vote is stored at that time and paired with the room's readings from then, not from when it arrived, so late votes still train the model correctly. A `votedAt` in the future counts as now; one more than 7 days old is refused with 422.

When `user.mustChangePassword` is true (an admin reset it), the client should send the user to change it.

## Staff

These accept the portal cookie or a staff bearer token.

| Method and path | Who | What |
|---|---|---|
| `GET /api/feedback?room=&vote=&limit=&offset=` | staff | Feedback list |
| `GET /api/stream` | staff | Server-sent events: `reading`, `feedback`, `alert` |
| `GET /fm/feedback/export?room=&vote=&from=&to=` | staff | Feedback as CSV |
| `POST /api/ml/retrain` | admin | Retrain the comfort model now |
| `GET /admin/rooms/:id/qr` | admin | Printable SVG QR code for a room. It holds `APP_URL/r/CODE` |

## Health

`GET /api/health` returns `{status, database, redis, ml}` and 503 when Postgres is down.

## Public v1 status API

These unauthenticated read-only endpoints are intended for backend monitoring. Responses are not cached and are rate-limited to 60 requests per client IP per minute. They never return device keys, key hashes, database UUIDs, user data, or internal error details.

| Method and path | Purpose | Query |
|---|---|---|
| `GET /v1/health` | Database, Redis, and ML service health | none |
| `GET /v1/esp32-status` | ESP32 connectivity for all registered devices | optional `deviceId` |
| `GET /v1/sensor-status` | BME280 hardware status for all registered devices | optional `deviceId` |

`deviceId` filters to one device. It returns `400` for invalid values and `404` when the device does not exist. Status endpoints return `503` when their database query fails.

The ESP32 is `online` if its heartbeat is less than 3 minutes old, or if a legacy device was seen within that window. Other states are `offline`, `never_reported`, and `inactive`. The BME280 is `online` after a successful check or `offline` after a failed check while the board is online. It is `unknown` if the ESP32 is offline or has not explicitly reported sensor health, and `inactive` if disabled.

`/v1/esp32-status` exposes `lastSeenAt` and `lastHeartbeatAt`. `/v1/sensor-status` exposes `lastReadingAt` and the last explicitly reported real measurements; these are historical values, not proof of current health. The sensor endpoint's previous `healthy` and `stale` statuses and counters have been replaced by `online`, `offline`, and `unknown`.
