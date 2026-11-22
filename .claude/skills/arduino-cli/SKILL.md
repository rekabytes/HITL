---
name: arduino-cli
description: Flash, monitor and diagnose the HITL ESP32 sensor board with arduino-cli on Windows. Use when asked to compile or upload the firmware, read the serial log, check whether the BME280 or the CO2 sensor is detected, find the board's COM port, or work out why the board is not reporting.
---

# arduino-cli for the HITL sensor board

The board is an ESP32 DevKit (CH340 USB chip) running `firmware/hitl-sensor`. It
plugs into the **Windows** side of the dev laptop. WSL cannot see USB serial
ports, so every arduino-cli and serial command runs in **Windows PowerShell**,
never in WSL bash.

## Ground rules

- **Read before you flash.** Most questions ("is the sensor detected?", "is it
  online?") are answered by the serial log of the firmware already on the board.
  Flashing anything replaces that firmware, so ask the user first, and say what
  you will put back afterwards.
- **Secrets stay out.** `config.h` holds the Wi-Fi password and the device key.
  It is git-ignored. Never print it, `cat` it, paste it into chat, commit it or
  copy it into the repo. To check a value, test for the placeholder instead, for
  example `(Get-Content config.h -Raw) -match 'hitl_paste-the-key-here'`.
- **One program per COM port.** If opening the port fails with "access denied"
  or "in use", another serial monitor (Arduino IDE, PuTTY, another session) has
  it. Ask the user to close it; do not kill unknown processes.
- **Start PowerShell commands with `Set-Location $env:USERPROFILE`.** When the
  working directory is a `\\wsl.localhost\...` path, redirects such as `2>$null`
  or `> nul` can create a real file named `nul` in the repo. A `nul` file inside
  `packages/web` once put the Next.js dev server into a rebuild loop.
- **Pass multi-line or quote-heavy commands to WSL as a script file**, not as
  `wsl -- bash -c '...'`: PowerShell strips the inner quotes.

## Where things are

| What | Where |
|---|---|
| arduino-cli | `C:\Program Files\Arduino CLI\arduino-cli.exe` (may not be on PATH in an old shell: call it by full path) |
| Board package / FQBN | `esp32:esp32` / `esp32:esp32:esp32` (ESP32-S3: `esp32:esp32:esp32s3`) |
| Libraries | `Adafruit BME280 Library`, `Adafruit Unified Sensor` (plus `Adafruit BusIO`) |
| Firmware source | `firmware/hitl-sensor/` in the repo (WSL) |
| Build copy | `%USERPROFILE%\hitl-firmware\hitl-sensor\` on Windows, with the real `config.h` |
| Serial speed | 115200 baud |
| Helpers | `scripts/serial-log.ps1` and `sketches/i2c-scan/` next to this file |

Compiling straight from `\\wsl.localhost\...` works but is slow, so the build
happens in the Windows copy. Sync the source into it before compiling, and never
overwrite its `config.h`:

```powershell
Set-Location $env:USERPROFILE
$src = "\\wsl.localhost\ubuntu\home\cidex\Github\HITL\firmware\hitl-sensor"
$dst = "$env:USERPROFILE\hitl-firmware\hitl-sensor"
New-Item -ItemType Directory -Force $dst | Out-Null
Get-ChildItem $src -File | Where-Object Name -ne 'config.h' | Copy-Item -Destination $dst -Force
if (-not (Test-Path "$dst\config.h")) { Copy-Item "$dst\config.example.h" "$dst\config.h" }  # then the user fills it in
```

Copy every file in the sketch folder (`*.ino` and every `*.h`, for example
`sc8-parser.h`), not just the `.ino`.

## Common tasks

### Find the board
```powershell
& "$env:ProgramFiles\Arduino CLI\arduino-cli.exe" board list
```
The ESP32 is the line whose type is `Serial Port (USB)`, usually `COM9` on this
laptop. COM3/COM6/COM7 are Bluetooth and Intel AMT, not the board. If no USB
line appears: cable unplugged, a charge-only cable, or a short on the board
(Windows cuts power to the port). Check for a missing driver with
`Get-CimInstance Win32_PnPEntity | Where-Object { $_.ConfigManagerErrorCode -ne 0 -or $_.PNPDeviceID -match 'VID_1A86|VID_10C4|VID_303A' }`.

### Read the serial log (the main way to check anything)
```powershell
Set-Location $env:USERPROFILE
& "\\wsl.localhost\ubuntu\home\cidex\Github\HITL\.claude\skills\arduino-cli\scripts\serial-log.ps1" -Seconds 75
```
The script finds the board, **restarts it** (so the start-up lines are
included) and prints the log. Use at least 70 seconds: after start-up the
firmware prints only once per report cycle (`POST_INTERVAL_S`, 60 s). A short
read that shows nothing usually just missed the cycle. `-NoReset` reads without
restarting.

### Compile and upload
```powershell
Set-Location $env:USERPROFILE
$a = "$env:ProgramFiles\Arduino CLI\arduino-cli.exe"
& $a compile --fqbn esp32:esp32:esp32 -u -p COM9 "$env:USERPROFILE\hitl-firmware\hitl-sensor"
```
`-u -p` uploads after a successful compile. Success ends with
`Hash of data verified.` and `Hard resetting via RTS pin...`. If it stalls at
`Connecting...`, hold the board's **BOOT** button until writing starts. Then read
the serial log to confirm the new version string (`HITL sensor hitl-x.y.z`).

### Install or update the toolchain
```powershell
$a = "$env:ProgramFiles\Arduino CLI\arduino-cli.exe"
& $a core update-index; & $a core install esp32:esp32
& $a lib install "Adafruit BME280 Library" "Adafruit Unified Sensor"
```
Installing arduino-cli itself: `winget install --id ArduinoSA.CLI -e`. Ask the user before installing anything.

## Reading the firmware log

| Line | Meaning |
|---|---|
| `HITL sensor hitl-x.y.z` | Board booted; this is the firmware version |
| `[bme] BME280 found at 0x76` / `0x77` | Temperature/humidity sensor detected |
| `[bme] No sensor found` | No BME280 at 0x76 or 0x77. Another chip may still be there: use the `identify-sensor` skill |
| `[bme] Found a BMP280` | Wrong chip: no humidity sensor |
| `[wifi] Connected, IP ...` | On Wi-Fi. Signal below about -80 dBm is unreliable |
| `[wifi] ... refused us` | Wrong password in the flashed build, or the router rejected it |
| `[wifi] -2 networks in range` | The scan itself failed (-2 is an error code), not a count |
| `[post] ... -> 200` | Server accepted the report |
| `-> 401` | Device key wrong or replaced in the portal |
| `-> 422` | Server does not understand the report: backend older than the firmware |
| `-> -1` | Server unreachable from this Wi-Fi |

A changed `config.h` has no effect until it is compiled and uploaded again.

## Diagnosing a sensor that is not found

**First prove which chip is there**: use the `identify-sensor` skill. A module
sold as a BME280 on this project was really an SHT3x, at a different address, so
"No sensor found" was the firmware looking for the wrong chip. The steps below
are the older wiring-only check.

The firmware's own check covers addresses 0x76 and 0x77 with the wires the right
way round. If it says `No sensor found`, an I2C scan gives more detail. **It
replaces the firmware, so ask first**, then flash the real firmware back.

```powershell
Set-Location $env:USERPROFILE
$a = "$env:ProgramFiles\Arduino CLI\arduino-cli.exe"
$scan = "$env:USERPROFILE\hitl-firmware\i2c-scan"
New-Item -ItemType Directory -Force $scan | Out-Null
Copy-Item "\\wsl.localhost\ubuntu\home\cidex\Github\HITL\.claude\skills\arduino-cli\sketches\i2c-scan\i2c-scan.ino" $scan -Force
& $a compile --fqbn esp32:esp32:esp32 -u -p COM9 $scan
& "\\wsl.localhost\ubuntu\home\cidex\Github\HITL\.claude\skills\arduino-cli\scripts\serial-log.ps1" -Seconds 15 -NoReset
```

| Scan result | Meaning |
|---|---|
| `0x76(chip id 0x60)` or `0x77(chip id 0x60)` on every line | Genuine BME280, wired right |
| chip id `0x58` | BMP280: no humidity |
| Found only with `SDA=GPIO22 SCL=GPIO21` | SDA and SCL wires are swapped |
| Random addresses that change every scan | Loose contact: pins not soldered, or a bad joint |
| `nothing` every time | No power or no contact: check 3V3 (not EN or VIN), GND, solder joints, breadboard rows, a power LED on the module, or measure about 3.3 V between its VIN and GND |

Then flash `hitl-sensor` back (Compile and upload above) and read the log again.

## The CO2 sensor (SC8-CO2-5K, "C8")

UART at 9600 baud: sensor TX to GPIO 16, sensor RX to GPIO 17, sensor +5V to
the ESP32 5V/VIN pin (not 3V3), GND to GND. It streams a 16-byte frame every
second, starting `42 4D`; CO2 ppm is byte 6 × 256 + byte 7; byte 15 is the low
byte of the sum of bytes 0 to 14. It needs about 3 minutes to warm up. Never
send it the query command: that turns off the streaming until it is
power-cycled. The firmware's `[co2]` log lines report what it sees.
