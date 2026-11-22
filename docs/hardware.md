# Hardware log

What is actually wired to each sensor board, and how we know. Modules are often
not what the listing says, so record what the chip proved to be, not what it was
sold as. The `identify-sensor` skill (`.claude/skills/identify-sensor`) has the
procedure and the identification sketch.

## Board 1 (ESP32 DevKit, CH340, on the dev laptop's COM9)

| Part | Sold as | Actually is | How it was proved | Sample reading | Status |
|---|---|---|---|---|---|
| Temperature/humidity module | BME280 | **Sensirion SHT3x** (SHT30/31/35), I2C 0x44, serial `2E1D79B9` | Answered SHT3x command 0x3780 with a valid Sensirion CRC; nothing at the BME280 addresses 0x76/0x77 | 25.5 °C, 59.8 %RH | Works, but the firmware only supports the BME280, so it reports "BME280 offline". Needs an SHT3x driver; it has no pressure reading |
| CO2 module | "CO2-C8 V4" | **Shenzhen Shenchen SC8-CO2-5K**, NDIR, UART 9600 | 16-byte `42 4D` frames with a valid checksum, matching the vendor specification | 413 ppm | Works. GPIO 16/17, powered from 5V |

### Timeline

- **2026-11-22**: The temperature module did not answer at all. Header pins were not soldered; tilting it produced random addresses that changed every scan (a flickering contact).
- **2026-11-22**: The CO2 module answered with `42 4D` frames instead of the MH-Z19 format we first assumed. Identified from the seller's page and the SC8-CO2-5K specification.
- **2026-11-23**: After soldering, a device answered steadily at 0x44, not 0x76/0x77. The identification test showed an SHT3x. The wiring was correct all along once soldered; the firmware was looking for the wrong chip.
