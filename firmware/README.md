# Sensor firmware (ESP32 + SHT3x or BME280)

`hitl-sensor/` posts temperature and humidity (with numeric pressure for BME280 or `null` for SHT3x) to `POST /api/sensor` every minute. See [docs/sensors.md](../docs/sensors.md) for the API side.

## Parts

- ESP32 dev board (ESP32-WROOM-32 DevKit, or ESP32-S3)
- SHT3x module (L21 uses `0x44`), or a BME280 module. A BMP280 does not measure humidity and is not supported.
- 4 jumper wires and a USB data cable

| SHT3x / BME280 | ESP32 |
|---|---|
| VIN / VCC | 3V3 |
| GND | GND |
| SCL | GPIO 22 |
| SDA | GPIO 21 |

## Setup

1. In the portal, **Rooms and sensors**: register the sensor with firmware version `hitl-1.4.0`, pick its room, copy the key.
2. `cp hitl-sensor/config.example.h hitl-sensor/config.h` and fill in Wi-Fi, `ENDPOINT` and `DEVICE_KEY`. `config.h` is git-ignored.
3. Flash it. With [arduino-cli](https://arduino.github.io/arduino-cli/) on the machine the board is plugged into (on Windows, not WSL: WSL cannot see USB ports without extra tools):

```bash
arduino-cli core install esp32:esp32
arduino-cli lib install "Adafruit BME280 Library" "Adafruit Unified Sensor"
arduino-cli compile --fqbn esp32:esp32:esp32 hitl-sensor
arduino-cli upload  --fqbn esp32:esp32:esp32 -p COM5 hitl-sensor
arduino-cli monitor -p COM5 -c baudrate=115200
```

Use your board's COM port (`arduino-cli board list`). For an ESP32-S3 use `--fqbn esp32:esp32:esp32s3`. If upload stalls at `Connecting...`, hold the **BOOT** button until it starts.

## Reading the serial log

| Message | Meaning |
|---|---|
| `[post] ... -> 200 {"status":"stored"...}` | Working. The LED blinks once per accepted report |
| `-> 401` | Wrong or replaced device key |
| `-> -1` (connection refused) | `ENDPOINT` unreachable from this Wi-Fi. A dev server inside WSL needs mirrored networking and a firewall rule for port 3000 |
| `"assigned":false` | Stored, but the sensor has no room in the portal yet |
| `[sensor] No SHT3x or BME280 found` | Check the four wires and verify the sensor model |
| `[post] ... -> 200 {"status":"heartbeat"...}` | Board online; no valid environmental reading |

The board restarts itself if no report gets through for 15 minutes, and reconnects Wi-Fi on its own.

## Testing without a sensor

Without a working environmental sensor, the board continues sending authenticated heartbeats and retries sensor detection on each report. HITL shows ESP32 Online / Environmental sensor Offline. No simulated measurements are sent. Before flashing `hitl-1.4.0`, deploy a backend that accepts heartbeat reports and online readings with `pressure: null`.

## Dev server in WSL

The ESP32 cannot reach a server inside WSL 2 by default. Turn on mirrored networking in `%UserProfile%\.wslconfig`, run `wsl --shutdown`, then allow port 3000 through the Windows firewall:

```ini
[wsl2]
networkingMode=mirrored
```

Then use `http://<laptop Wi-Fi IP>:3000/api/sensor` as `ENDPOINT`.

## Optional SC8-CO2-5K sensor

Deploy the updated backend and apply migration `0005_co2_sensor` before flashing a build with CO₂ monitoring enabled. In the private `hitl-sensor/config.h`, add `#define CO2_RX_PIN 16` to enable the module. Leave this undefined on boards without the module.

| SC8-CO2-5K pin | Connect to ESP32 |
| --- | --- |
| 6 (+5 V) | Regulated 5 V supply (rated for at least 150 mA for the sensor) |
| 7 (GND) | GND, common to the ESP32 |
| 3 (TX, 3.3 V logic) | GPIO 16 (or the configured UART RX) |
| 2 (RX) | Leave unconnected; the module broadcasts automatically |

Keep the module away from the environmental sensor to avoid biasing temperature readings. Power-cycle the module if earlier testing switched it to query mode. The firmware waits for three minutes of valid frames before publishing ppm (full accuracy takes about ten minutes after power-on). It reports `warming_up` without ppm during warm-up, and `offline` after five seconds without a valid frame. CO₂ and environmental measurements are independent; no simulated values are sent.
