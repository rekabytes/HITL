# @hitl/db

Postgres schema and migrations, written with Drizzle.

| Command | What it does |
|---|---|
| `pnpm db:generate` | Write a new SQL migration after changing `src/schema.ts` |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:studio` | Open Drizzle Studio |
| `pnpm db:prune` | Delete readings older than `READINGS_RETENTION_DAYS` |
| `pnpm db:import-mongo` | One-off copy from the old MongoDB (see `scripts/import-mongo.ts`) |

All commands read `DATABASE_URL` from the repo-root `.env`.

See [docs/database.md](../../docs/database.md) for the tables.
