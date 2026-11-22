---
name: identify-sensor
description: Work out which sensor chip is really wired to the HITL ESP32, and debug a sensor the firmware cannot find. Use when the firmware says "No sensor found" or a sensor is "offline" although it is wired, when an I2C scan shows an unexpected address, when a UART sensor sends data the firmware does not understand, when a new or unlabelled module arrives, or when asked to check a sensor's model.
---

# Identify the sensor before debugging it

Cheap modules are often not what the listing, the bag or even the silkscreen
says. On this project a module bought as a "BME280" turned out to be a
**Sensirion SHT3x**: the wiring and soldering were fine, but the firmware kept
saying `No sensor found` because it only looks for a BME280. Hours went into
re-wiring before anyone checked the chip itself. So:

> When a sensor "is not found", first prove **what chip is there**, then debug.

Run everything from Windows PowerShell; see the `arduino-cli` skill for the
board, the COM port, `serial-log.ps1` and the build copy. Flashing a diagnostic
replaces the firmware, so **ask the user first** and flash `hitl-sensor` back at
the end.

## Step 1: read what the firmware already says (no flashing)

Follow the [Arduino CLI serial-log steps](../arduino-cli/SKILL.md#read-the-serial-log-the-main-way-to-check-anything): run the Windows-local copy of the helper on the confirmed port with `-NoReset`.

Note the firmware version and any sensor detection lines, including `[sht3x]`, `[bme]`, and `[co2]` where applicable. `No sensor found`
only means "no BME280 at 0x76/0x77". It does not mean "nothing is there".

## Step 2: run the identification sketch

`sketches/identify/identify.ino` (next to this file) scans I2C on GPIO 21/22,
asks every device for its chip id or serial number, takes one reading, then
listens on the UART (GPIO 16) for 3 seconds without sending anything.

```powershell
Set-Location $env:USERPROFILE
$a = "$env:ProgramFiles\Arduino CLI\arduino-cli.exe"
$dir = "$env:USERPROFILE\hitl-firmware\identify"
New-Item -ItemType Directory -Force $dir | Out-Null
Copy-Item "\\wsl.localhost\ubuntu\home\cidex\Github\HITL\.claude\skills\identify-sensor\sketches\identify\identify.ino" $dir -Force
```

Follow the [mandatory flash workflow](../windows-esp32-flash/SKILL.md) for a separate diagnostic compile and upload. Use the confirmed board and port, get explicit approval, and have the production restoration build ready first. Check the sketch's bus and pins against the selected board before running it; the values above are not universal. After uploading, read the confirmed port with `serial-log.ps1 -Port <confirmed-port> -Seconds 20` and look for `[identify]`. Use `-NoReset` when a reset is not authorized. Verify each expected sensor after restoring the production firmware.

Typical output:
```
[identify] 0x44: Sensirion SHT3x (SHT30/31/35), serial 2E1D79B9: 25.54 C, 59.8 %RH (temperature and humidity, no pressure)
[identify] UART on GPIO16 at 9600: 16-byte 42 4D frame with valid checksum: SC8-CO2 style NDIR CO2 sensor, 413 ppm
```

## Step 3: read the result

**Trust a chip id or a CRC-checked serial number, not the address alone.**
Several chips share an address (0x44 is both SHT3x and SHT4x; 0x76 is BME280,
BMP280 and BME680). The sketch only names a chip after it has answered a
question only that family can answer correctly.

| Result | What it means |
|---|---|
| The expected chip, with a sensible reading | Hardware is fine; the problem is firmware, config or network |
| A **different chip** than expected | Wrong or mislabelled module. Record it (step 5) and decide: support it, or replace it |
| A Bosch address with an odd chip id | Counterfeit or damaged part |
| `probably ...` | Family with no id command; confirm from the module's markings |
| Device found only with SDA/SCL swapped | Swap the two wires |
| Random addresses that change each scan | Loose contact: solder the header pins |
| Nothing on I2C | No power or no contact: 3V3 (not EN or VIN), GND, solder joints, breadboard rows |
| UART `silent` | Nothing wired, TX/RX swapped, wrong supply (CO2 sensors need 5 V), or a request/response sensor |
| `eCO2` / `NOT a real CO2 sensor` | CCS811/SGP30-type chip: estimates CO2 from gases. Not acceptable as a CO2 measurement for this project |

### Common I2C addresses

| Address | Candidates | How they are told apart |
|---|---|---|
| 0x76, 0x77 | BME280, BMP280, BME680/688, BMP180 | Register 0xD0: 0x60 BME280, 0x58 BMP280, 0x61 BME680, 0x55 BMP180 |
| 0x44, 0x45 | Sensirion SHT3x, SHT4x | SHT4x answers command 0x89, SHT3x answers 0x3780, both with CRC |
| 0x40 | HDC1080, Si7021/7020/7013, HTU21D/SHT21 | HDC1080 register 0xFF = 0x1050; Si70xx electronic id; HTU21D has none |
| 0x38 | AHT10/AHT20/AHT21 | No id command |
| 0x62 | SCD40/SCD41 (real CO2) | Serial 0x3682 with CRC |
| 0x61 | SCD30 (real CO2) | Firmware version 0xD100 with CRC |
| 0x58 | SGP30 (eCO2 only) | Serial 0x3682 with CRC |
| 0x5A, 0x5B | CCS811 (eCO2 only) | Register 0x20 = 0x81 |
| 0x23, 0x5C | BH1750 light | No id command |
| 0x10 | VEML7700 light | Register 0x07 = 0x81 |

### UART frame headers (9600 baud)

| First bytes | Sensor | Notes |
|---|---|---|
| `42 4D`, 16 bytes, byte 15 = sum of bytes 0..14 | SC8-CO2-5K ("C8") NDIR CO2 | Streams every second. ppm = byte6 × 256 + byte7. Never send it a query: it stops streaming until power-cycled |
| `42 4D 00 1C`, 32 bytes | Plantower PMS5003/7003 particulates | Not a CO2 sensor |
| Nothing until asked; reply `FF 86` | Winsen MH-Z19 | Request/response. Only send its query after you know it is an MH-Z19 |
| Nothing until asked; Modbus `FE 04` | SenseAir S8 | Request/response |

Never decode an unknown format by guessing which bytes are the value. Find
the datasheet first (search the exact model, the seller's page, and the
watermark or company name on the product photos), check the frame against the
datasheet's worked example and checksum, and only then write a parser.

## Step 4: decide what to do

- **Same measurements, different chip** (SHT3x instead of BME280): the module
  is usable, but the firmware needs a driver for it, and the backend must accept
  its readings. The SHT3x has no pressure, and the current report format
  requires pressure on an `online` reading. Treat this as a firmware and
  backend change, agreed with the user, not a quick fix.
- **Missing a measurement the project needs** (BMP280 has no humidity): replace it.
- **Fake or estimated CO2** (CCS811, SGP30): replace with an NDIR sensor (SC8-CO2, SCD4x, SCD30, MH-Z19).

## Step 5: write it down

Add what you found to [docs/hardware.md](../../../docs/hardware.md): the date,
what it was sold as, what it really is, how you proved it (chip id or serial
number), a sample reading, and what was decided. The next person then does not
repeat the same hunt.

## Step 6: put the firmware back

Sync and flash `hitl-sensor` as in the `arduino-cli` skill, then read the serial
log again and confirm the version line and that reports get `-> 200`.
