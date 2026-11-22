# Database

Postgres 17, schema in [`packages/db/src/schema.ts`](../packages/db/src/schema.ts), migrations in `packages/db/migrations`.

| Table | Holds |
|---|---|
| `users` | Admins, facility managers and occupants. bcrypt hash, role, active flag, must-change-password flag |
| `sessions` | Web and mobile sessions. Only an HMAC of the token is stored |
| `buildings` | Buildings by unique name |
| `rooms` | Rooms in a building. `code` (for example `L21`) is unique and goes into the door QR code as `APP_URL/r/CODE` |
| `sensors` | ESP32 units: device id, HMAC of the device key, label, firmware version, last seen |
| `sensor_rooms` | Which rooms each sensor reports for. Usually one; a sensor in a shared space can cover several, and each reading is stored once per room |
| `sensor_readings` | Temperature, humidity and pressure over time. Indexed by room and time |
| `feedback` | Occupant votes (`too_cold`, `perfect`, `too_hot`), comfortable yes or no, comment, and the room's temperature and humidity at that moment |
| `pics` | One person in charge per room |
| `alerts` | Automatic and manual alerts, with how many times the person in charge was emailed and when it was escalated. A partial unique index allows one unresolved automatic alert per room and kind |
| `actions` | What staff did, linked to a room and optionally an alert |
| `model_runs` | Each training run: status, row count, metrics, error |
| `ai_insights` | AI notes per room: a summary, and suggestions staff accept or dismiss. `source` is `demo`, `model` or `llm`, and demo text is labelled as such in the portal. Accepting a suggestion also writes it to `actions` |

## Retention

`pnpm db:prune` deletes readings older than `READINGS_RETENTION_DAYS` (default 180). Votes keep their own snapshot of conditions, so pruning readings never loses training data. Run it from cron, for example daily:

```bash
docker compose run --rm migrate pnpm run prune-readings
```

## Making a schema change

1. Edit `packages/db/src/schema.ts`.
2. `pnpm db:generate` writes a SQL migration.
3. Commit both. CI fails if the schema and migrations disagree.
4. `pnpm db:migrate` (or the `migrate` service in Docker) applies it.
