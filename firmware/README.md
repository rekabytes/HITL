# Sensor firmware (ESP32 + BME280)

`hitl-sensor/` posts temperature, humidity and pressure to `POST /api/sensor` every minute. See [docs/sensors.md](../docs/sensors.md) for the API side.

## Parts

- ESP32 dev board (ESP32-WROOM-32 DevKit, or ESP32-S3)
- BME280 module. Not a BMP280: it looks the same but has no humidity sensor. The firmware tells you if you have one.
- 4 jumper wires and a USB data cable

| BME280 | ESP32 |
|---|---|
| VIN / VCC | 3V3 |
| GND | GND |
| SCL | GPIO 22 |
| SDA | GPIO 21 |

## Setup

1. In the portal, **Rooms and sensors**: register the sensor with firmware version `hitl-1.1.0`, pick its room, copy the key.
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
| `Found a BMP280` | Wrong chip, no humidity |
| `No sensor found` | Check the four wires |
| `[post] ... -> 200 {"status":"heartbeat"...}` | Board online; no valid BME280 reading |

The board restarts itself if no report gets through for 15 minutes, and reconnects Wi-Fi on its own.

## Testing without a sensor

Without a working BME280, the board continues sending authenticated heartbeats and retries sensor detection on each report. HITL shows ESP32 Online / BME280 Offline. No simulated measurements are sent. Deploy a backend that supports heartbeat reports before flashing this version.

## Dev server in WSL

The ESP32 cannot reach a server inside WSL 2 by default. Turn on mirrored networking in `%UserProfile%\.wslconfig`, run `wsl --shutdown`, then allow port 3000 through the Windows firewall:

```ini
[wsl2]
networkingMode=mirrored
```

Then use `http://<laptop Wi-Fi IP>:3000/api/sensor` as `ENDPOINT`.
