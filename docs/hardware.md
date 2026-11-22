# Hardware log

What is actually wired to each sensor board, and how we know. Modules are often
not what the listing says, so record what the chip proved to be, not what it was
sold as. The `identify-sensor` skill (`.claude/skills/identify-sensor`) has the
procedure and the identification sketch.

## Board 1 (ESP32 DevKit, CH340, on the dev laptop's COM9)

| Part | Sold as | Actually is | How it was proved | Sample reading | Status |
|---|---|---|---|---|---|
| Temperature/humidity module | BME280 | **Sensirion SHT3x** (SHT30/31/35), I²C `0x44`, serial `2E1D79B9` | Answered SHT3x command 0x3780 with a valid Sensirion CRC; nothing at the BME280 addresses 0x76/0x77 | 25.5 °C, 59.8% RH | Verified in production with `hitl-1.4.0`. SDA GPIO21, SCL GPIO22. No pressure reading. |
| CO₂ module | "CO2-C8 V4" | **Shenzhen Shenchen SC8-CO2-5K**, NDIR, UART 9600 | 16-byte `42 4D` frames with a valid checksum, matching the vendor specification | 413 ppm | Verified in production. 5 V supply; ESP32 receives SC8 TX on GPIO16 (`CO2_RX_PIN`). See the [SC8 wiring guide](../firmware/README.md#optional-sc8-co2-5k-sensor). |

Production registration: `esp32-lvl21-prod-a` in `L21-CIDEX`. COM9 was the port on the dev laptop during verification, not a stable board identifier. For the latest documented telemetry and flash history, see [Current state](current-state.md#verified-in-production).

### Timeline

- **2026-11-22**: The temperature module did not answer at all. Header pins were not soldered; tilting it produced random addresses that changed every scan (a flickering contact).
- **2026-11-22**: The CO2 module answered with `42 4D` frames instead of the MH-Z19 format we first assumed. Identified from the seller's page and the SC8-CO2-5K specification.
- **2026-11-23**: After soldering, a device answered steadily at 0x44, not 0x76/0x77. The identification test showed an SHT3x. The wiring was correct all along once soldered; the firmware was looking for the wrong chip.
