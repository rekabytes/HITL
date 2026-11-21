# Moving data from the old MongoDB

The old Streamlit site and Flutter app shared one MongoDB Atlas database, `hitl_smart_building`. [`packages/db/scripts/import-mongo.ts`](../packages/db/scripts/import-mongo.ts) copies it into Postgres once.

**Before anything else, rotate the old credentials.** The Atlas connection string and a Gmail app password were committed in the old code (Flutter `mongodb_service.dart`, the mobile backend's `database.py` and `main.py`) and `.env` files were inside the shared zip. Change the Atlas user's password and revoke the Gmail app password, then use the new connection string below.

```bash
pnpm db:migrate
LEGACY_MONGODB_URI='mongodb+srv://...' pnpm db:import-mongo
```

The script refuses to run when Postgres already has feedback. Pass `--force` to run it anyway.

## How old data maps

| Mongo | Postgres | Notes |
|---|---|---|
| `users` | `users` | Passwords cannot be carried over (the site used pbkdf2, the mobile backend stored plain text). Every imported user gets a random password and must-change-password. Reset each one from **Users**. `student` becomes `occupant` |
| room ids in `feedback`, `pics`, `alerts`, `actions` | `buildings`, `rooms` | `bk-01` becomes building `BK`, room `01`, code `BK-01` |
| `sensor_data` | `sensor_readings` | All old readings were labelled "Unassigned", so they go to room `UNASSIGNED` in building `Imported` |
| `feedback` (both shapes) | `feedback` | Each vote gets the temperature and humidity of the nearest reading within 15 minutes |
| `pics` | `pics` | |
| `alerts` | `alerts` | As manual warnings, with resolution notes |
| `actions` | `actions` | Summary, recommendation and notes become one note |

`July Data.xlsx` from the old project is not imported. Its rows can be added to `sensor_readings` by hand if they are needed for analysis.
