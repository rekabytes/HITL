# Current state

Last reviewed **2026-11-22 (UTC)**. This is a project status snapshot and operations changelog, not a release manifest. A feature in the repo is not necessarily deployed or verified in production.

## Verified in production

The [L21 production status API](https://hitl.reka-bytes.my/v1/sensor-status?deviceId=esp32-lvl21-prod-a) reported `esp32-lvl21-prod-a` in `L21-CIDEX` online on firmware `hitl-1.4.0`. The API check at **19:01:14 UTC** returned these readings, all recorded at **19:00:54 UTC**:

| Component | Verified result |
|---|---|
| ESP32 | Online; two post-flash serial reports returned HTTP `200` |
| SHT3x | **22.19 °C**, **65.15% RH**; pressure is `null` because this sensor does not measure it |
| SC8 CO₂ | **678 ppm**, status `online` |

The CO₂ restore changed the build setting, not the device key, Wi-Fi settings, or endpoint. The SC8 moved from `warming_up` to `online`; its first verified post-flash reading was **507 ppm at 18:56:53 UTC**. These checks verified telemetry for this board, not the signed-in dashboard or long-term uptime.

## In the repo and what still needs checking

| Area | State |
|---|---|
| Live-only analytics | `3e5e0e8` removed demo seed scripts and setup options. [`/fm/analytics`](../packages/web/src/app/fm/analytics/page.tsx) already reads stored temperature, humidity, CO₂, and occupant votes. The signed-in analytics UI was not checked in production. |
| Demo cleanup | Verified in the **local Docker Compose dev database only**. No production purge was performed. The local database did not have [`0005_co2_sensor`](../packages/db/migrations/0005_co2_sensor.sql) applied at the time, so there was no local CO₂ table to check. |
| Production flash workflow | The [Windows flash checklist](../.claude/skills/windows-esp32-flash/SKILL.md) and updates to the [Arduino CLI](../.claude/skills/arduino-cli/SKILL.md) and [sensor identification](../.claude/skills/identify-sensor/SKILL.md) skills document how to handle multiple boards and sensors. There is no automated upload guard or reusable machine-readable inventory yet. |
| AI recommendations | The [staff recommendations page](../packages/web/src/app/fm/recommendations/page.tsx) and Accept/Dismiss actions exist. Scheduled generation of new per-room insights from live data is a proposal, not a verified feature. |

## Changelog

### 2026-11-22 (UTC)

- **Restored SC8 CO₂ reporting on L21.** The earlier key-only build omitted the `CO2_RX_PIN` build flag, and the private config did not define it. That compiled out CO₂ reporting even though temperature and humidity still arrived. The restore put `#define CO2_RX_PIN 16` in the board's private config and verified both sensors in production after the upload. There was no evidence that a sensor was unplugged.
- **Removed demo seeding** and verified the local-only cleanup described above. Live charts should reflect stored readings and votes, not sample data.
- **Documented production flash checks.** Match the physical board to its registered ID, check every expected sensor against the effective build inputs, compile and upload separately, then verify fresh telemetry for each sensor. Treat warm-up as pending, not passing. See the [hardware log](hardware.md) and [firmware setup](../firmware/README.md#optional-sc8-co2-5k-sensor) for L21 wiring and CO₂ warm-up behavior.

## Next checks

1. Verify `/fm/analytics` while signed in as staff: check room filtering, fresh chart data, and an empty range. For local testing, confirm `0005_co2_sensor` is applied first. `pnpm check` was not run during the earlier live-data change because `pnpm` was unavailable on the WSL PATH.
2. Before another production flash, confirm the board-specific inventory and preserve the known-good configuration. Use the [unfiltered status list](https://hitl.reka-bytes.my/v1/sensor-status) to confirm the exact registered ID. Keep keys, private configs, backups, and firmware build artifacts out of Git.
3. For live recommendations, start with deterministic rules over real per-room aggregates, require enough evidence, and deduplicate suggestions in a protected scheduled job. Reuse `ai_insights` and the staff review flow. Consider the comfort model and optional wording assistance later; do not automate HVAC changes.
