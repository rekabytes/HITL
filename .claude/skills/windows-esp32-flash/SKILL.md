---
name: windows-esp32-flash
description: Prevent Git Bash, WSL, and PowerShell command failures when preparing, compiling, or flashing HITL ESP32 firmware or rotating its device key. Use for quoting errors, WSL path errors, cancelled uploads, and post-flash verification.
---

# Reliable Windows ESP32 flashing

Read [the Arduino CLI skill](../arduino-cli/SKILL.md) for board setup and sensor diagnostics. This checklist covers shell boundaries and how to tell which step actually succeeded. Run only the steps the user requested. A request to diagnose is not approval to flash production.

## Hard rules — stop if a gate fails

These rules apply to every board, every key rotation, and every upload, including diagnostic sketches. The skill is a checklist, not an automated guard. A missing check is not a pass.

1. **Identify the target before staging or uploading.** Match the registered device ID and environment to the physical board using a known hardware identifier or explicit operator confirmation. Confirm its current USB port, FQBN, and board-specific private config path. A port number, USB VID/PID, or room name alone is not a unique identity. If the target is ambiguous, stop; never try ports by guesswork. Capture the board and sensor baselines before changing anything; record unavailable data as unknown, not as an empty inventory.
2. **Require a non-secret board inventory independent of the private config.** For each authorized board, record a stable identity, firmware target, and one entry per expected sensor instance. Each entry identifies the sensor and its bus/address/pins as applicable, required build settings or driver, expected measurements, and how to verify freshness and any warm-up deadline. Two sensors of the same type need distinct identities or distinct evidence. Get missing or conflicting inventory details confirmed by the operator. Do not infer what is installed from the config, the latest API response, or another board. Never silently remove a sensor from the inventory to make a check pass.
3. **Check all expected sensors before building.** Validate each inventory entry against the selected firmware and effective build inputs, including required drivers, enable flags, and relevant bus/pin/address settings. If an expected feature cannot be checked, is missing, or conflicts with another setting, stop before uploading and report it. Never silently repair settings outside the requested scope. There is no fixed sensor list in this workflow: use the selected board's inventory, not today's hardware examples.
4. **For a key-only change, prove that only the key changed.** Make a secure local backup of the board-specific private config before editing. Compare before/after locally, masking only the value of the single `DEVICE_KEY` definition; fail if any other content differs or the definition is missing or duplicated. Report only pass/fail and non-secret setting names. Do not introduce a firmware source, board setting, or toolchain change under key-only approval; if the previous build inputs are unknown or a mismatch is found, stop and obtain approval for a broader scope. Never print or commit a key, private config, or backup.
5. **Compile and upload separately.** Capture the selected target and build inputs and use only the exact fresh artifact from the successful compile. If the inputs or target change, invalidate the build. Verify identity and port again immediately before upload, and require explicit approval for that target and scope. A temporary diagnostic upload requires explicit approval for the interruption and a verified production restoration build ready before replacing the running firmware. The diagnostic sketch itself is not proof of a successful restoration.
6. **Verify board connectivity and each sensor separately.** After upload, verify accepted telemetry for the exact board in the intended environment. For every expected sensor, require a fresh, valid measurement tied to that sensor and newer than the pre-upload baseline and upload time, using the evidence source specified in its inventory. Mark each **passed**, **pending** (e.g. documented warm-up, with a deadline), or **failed** (e.g. absent, stale, invalid, or still pending at the deadline). If the available evidence cannot distinguish sensor instances, mark verification **unverified**; do not count an aggregate or unrelated reading as a pass. A successful upload or HTTP 200 alone does not prove telemetry from every sensor. Report **fully verified** only when connectivity and every expected sensor pass.

For a temporary diagnostic sketch, apply the full sensor inventory checks to the production restoration build. Check the diagnostic sketch separately against the confirmed board and its approved diagnostic scope, including bus and pin compatibility. It may intentionally omit normal telemetry while running; that is not an exception to verifying every sensor after restoration.

## 1. Use one shell for each job

- **Windows PowerShell:** Arduino CLI, COM ports, serial logs, and the Windows sketch copy. Start with `Set-Location -LiteralPath $env:USERPROFILE`, not a WSL UNC working directory.
- **WSL Bash:** Git and Linux files. For multi-line Linux commands, pass a script to `bash -s` over stdin or run it as a file. Don't wrap a heredoc inside `bash -lc '...'`.
- **From Git Bash to Windows:** Put multi-line PowerShell in a local `.ps1` file containing no credentials and invoke it with `powershell.exe -NoProfile -File`. Use `MSYS2_ARG_CONV_EXCL='*'` and pass an explicit Windows path, for example:

  ```bash
  MSYS2_ARG_CONV_EXCL='*' powershell.exe -NoProfile -File "$(cygpath -w "$script")"
  ```

  Here `$script` is the Git Bash path to a Windows-local `.ps1` file. If native PowerShell is already open, run the file there directly. Don't use Bash-style `\"` as a PowerShell escape, nest quote-heavy `-Command` strings, or pass WSL paths through Git Bash unprotected.

## 2. Preflight before changing anything

Run read-only checks in Windows PowerShell. Substitute the selected board’s confirmed sketch directory before running this example; the source path is specific to the current HITL laptop:

```powershell
Set-Location -LiteralPath $env:USERPROFILE
$cli = Join-Path $env:ProgramFiles 'Arduino CLI\arduino-cli.exe'
$src = '//wsl.localhost/Ubuntu/home/cidex/Github/HITL/firmware/hitl-sensor'
# $sketch must be set to the confirmed board-specific sketch directory.
if (-not $sketch) { throw 'Confirmed board-specific sketch directory required' }
$config = Join-Path $sketch 'config.h'
if (-not (Test-Path -LiteralPath $cli -PathType Leaf)) { throw 'Arduino CLI not found' }
if (-not (Test-Path -LiteralPath $src -PathType Container)) { throw 'WSL sketch directory not accessible from Windows' }
if (-not (Test-Path -LiteralPath $config -PathType Leaf)) { throw 'Private Windows config.h missing' }
& $cli board list
if ($LASTEXITCODE -ne 0) { throw 'Arduino CLI board list failed' }
```

- Confirm the USB serial device before using its port. COM9 is typical on this laptop, not universal. Never try other ports by guesswork. If the port is busy, close the known serial monitor; don't kill unknown processes.
- Match the intended device against the production `/v1/sensor-status` list before filtering by ID. Capture its last reading as the baseline. Do not reuse an ID from an earlier session without checking.
- Stop at the first failing preflight. Fix the invocation or path and rerun that read-only check before moving on. A parser error is not a firmware or key failure.

## 3. Stage, compile, upload, and verify separately

| Stage | What to do | Evidence required before calling it done |
| --- | --- | --- |
| Stage | Use the approved board-specific source and private config. Never overwrite `config.h` when copying sources. Obtain keys through private local input, not commands, logs, chat, or Git. If a key was shared in chat, rotate it. | Inventory preflight passed. For a key-only change, the single key matches and the masked before/after comparison shows no other changes. Never print the config. |
| Compile | Use `arduino-cli compile --fqbn <confirmed-fqbn> --output-dir <fresh-build-dir> <sketch-dir>`. No `-u`. Poll a running compile instead of starting another. | Exit code `0` and artifacts in the new build directory. Check `$LASTEXITCODE` immediately; `$ErrorActionPreference` alone is not enough in Windows PowerShell. |
| Upload | Reconfirm target identity, port, approval, and artifact; close the serial monitor. Use `arduino-cli upload --fqbn <confirmed-fqbn> --port <confirmed-port> --input-dir <same-build-dir> <sketch-dir>`. Record the upload time for verification. | Exit code `0` and verified-write output. If interrupted, mark upload **unverified**; inspect serial/status before retrying. |
| Verify | Read the confirmed port at the configured baud rate. Use `-NoReset` unless a restart is authorized. Check the exact device in the intended environment and use each inventory entry’s evidence source and deadline. | Fresh accepted telemetry for the board **and** fresh valid evidence for every expected sensor. A firmware version, HTTP `200`, or a single fresh reading does not verify the full inventory. |

## 4. Report the first failing step

| Signal | Interpretation / next check |
| --- | --- |
| `ParserError`, unterminated heredoc, or UNC path becomes `C:\wsl.localhost\...` | Shell boundary failure. Use a native script and validate the path in the shell that will consume it. |
| Key matches on disk, last command cancelled | Config was staged; flash is unverified. Don't repeat the config edit or claim rollback without checking. |
| Serial POST `401` | Backend rejected authentication. Check the active key, target environment, and the uploaded artifact without printing the key. |
| Status API `404` with `Device not found` | This ID wasn't found by the status lookup. Check the unfiltered list; it does not establish whether upload or authentication succeeded. |
| Device exists, `lastReadingAt` is null or stale | No fresh measurement confirmed. Check serial reports and sensor detection separately. |
| SC8 reports `warming_up` after boot | Wait for about three minutes of valid frames before expecting ppm. Verify environmental readings independently. |

Handoff format: `Device ID / environment: … | Confirmed port: … | Inventory preflight: … | Config change check: … | Compile: … | Upload: … | Connectivity: …`. Then list each expected sensor with its result, evidence timestamp or failure reason, and deadline if pending. Use **not run** or **unverified** where appropriate. Don't include secrets.
