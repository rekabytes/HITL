# Environment variables

`pnpm env:setup` copies [`.env.example`](../.env.example) to `.env` and fills every secret with random values. `.env` is git-ignored; never commit it.

| Variable | Used by | Default | Notes |
|---|---|---|---|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | compose | `hitl`, none, `hitl` | Postgres container |
| `DATABASE_URL` | web, db scripts | none | Compose sets this for containers |
| `REDIS_URL` | web | `redis://localhost:6379` | |
| `APP_URL` | web | `http://localhost:3000` | Links in alert emails; `https://` turns on secure cookies |
| `AUTH_SECRET` | web | none | Keys the HMAC for sessions and device keys. At least 32 characters. Changing it signs everyone out and breaks every device key |
| `ML_URL` | web | `http://localhost:8000` | |
| `ML_TOKEN` | web, ml | none | Shared secret between the two |
| `ML_MIN_TRAINING_ROWS` | ml | `30` | Votes needed before the model trains |
| `ML_HEURISTIC_SETPOINT_C` | ml | `24.5` | Centre of the fallback estimate |
| `COMFORT_TEMP_MIN_C`, `COMFORT_TEMP_MAX_C` | web | `23`, `26` | Comfort band for advice and alerts |
| `COMFORT_HUMIDITY_MIN_PCT`, `COMFORT_HUMIDITY_MAX_PCT` | web | `40`, `70` | |
| `TZ_DISPLAY` | web | `Asia/Kuala_Lumpur` | Display times and the model's hour feature |
| `ALERT_ESCALATE_AFTER_MIN` | web | `5` | Open alerts nobody acknowledged by then become critical and are emailed again as an escalation |
| `READINGS_RETENTION_DAYS` | db prune | `180` | |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | web | off | Alert emails to persons in charge. Leave `SMTP_HOST` empty to turn off |
| `LEGACY_MONGODB_URI`, `LEGACY_MONGODB_DB` | import script | none | Only for the one-off import |
