# API

All bodies are JSON. Errors look like `{"error": "message"}`, and invalid bodies return 422 with `details`.

## Sensors

### `POST /api/sensor`

Header `X-Device-Key: <key>` (or `Authorization: Bearer <key>`).

```json
{ "temperature": 27.4, "humidity": 66.1, "pressure": 1008.2 }
```

`pressure` is optional. Returns `{"status": "stored", "roomIds": ["..."], "assigned": true}`; a sensor covering several rooms stores the reading once per room. Limited to 120 readings a minute per sensor.

## Mobile app

Sign in, then send `Authorization: Bearer <token>` on every call.

| Method and path | Body | Returns |
|---|---|---|
| `POST /api/auth/register` | `{name, email, password}` | `{token, expiresAt, user}`; always an occupant |
| `POST /api/auth/login` | `{email, password}` | `{token, expiresAt, user}` |
| `POST /api/auth/password` | `{currentPassword, newPassword}` | `{status: "changed"}`; ends the user's other sessions |
| `POST /api/auth/logout` | none | `{status: "signed_out"}` |
| `GET /api/rooms` | none | `{items: [{code, name, building, floor}]}` |
| `GET /api/rooms/:code` | none | Room details and current conditions, after a QR scan |
| `POST /api/feedback` | `{roomCode, vote, comfortable, comment?}` | `201 {status, id, room}` |

`vote` is `too_cold`, `perfect` or `too_hot`. Votes are limited to 10 per user per 10 minutes.

When `user.mustChangePassword` is true (an admin reset it), the app should send the user to change it.

## Staff

These accept the portal cookie or a staff bearer token.

| Method and path | Who | What |
|---|---|---|
| `GET /api/feedback?room=&vote=&limit=&offset=` | staff | Feedback list |
| `GET /api/stream` | staff | Server-sent events: `reading`, `feedback`, `alert` |
| `GET /fm/feedback/export?room=&vote=&from=&to=` | staff | Feedback as CSV |
| `POST /api/ml/retrain` | admin | Retrain the comfort model now |
| `GET /admin/rooms/:id/qr` | admin | Printable SVG QR code for a room |

## Health

`GET /api/health` returns `{status, database, redis, ml}` and 503 when Postgres is down.
