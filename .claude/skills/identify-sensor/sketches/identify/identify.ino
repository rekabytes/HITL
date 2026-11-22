// Sensor identification for the HITL board. Answers "what chip is actually
// wired up?", whatever the listing or the module's silkscreen claims.
//
// I2C (SDA = GPIO 21, SCL = GPIO 22): scans every address, then asks each
// device for something only one chip family can answer correctly (a chip id
// register, or a serial number protected by a CRC) and takes one reading.
// UART (sensor TX -> GPIO 16): listens for 3 s without sending anything and
// recognises streaming sensors by their frame header.
//
// It never sends commands on the UART: some sensors (the SC8-CO2) stop
// streaming after any query until they are power-cycled.
// Temporary diagnostic: flash the real firmware back afterwards.
#include <Wire.h>

static const int SDA_PIN = 21, SCL_PIN = 22, UART_RX = 16, UART_TX = 17;
HardwareSerial uart(2);

// Sensirion CRC-8 (poly 0x31, init 0xFF): SHT3x, SHT4x, SCD30, SCD4x, SGP30.
uint8_t crc8(const uint8_t* d, int n) {
  uint8_t c = 0xFF;
  for (int i = 0; i < n; i++) {
    c ^= d[i];
    for (int b = 0; b < 8; b++) c = (c & 0x80) ? (c << 1) ^ 0x31 : (c << 1);
  }
  return c;
}

bool present(uint8_t a) {
  Wire.beginTransmission(a);
  return Wire.endTransmission() == 0;
}

// Writes a command (1 or 2 bytes), waits, reads n bytes. False on any bus error.
bool xfer(uint8_t a, const uint8_t* c, int clen, int waitMs, uint8_t* out, int n) {
  Wire.beginTransmission(a);
  Wire.write(c, clen);
  if (Wire.endTransmission() != 0) return false;
  delay(waitMs);
  if (Wire.requestFrom(a, (uint8_t)n) != n) return false;
  for (int i = 0; i < n; i++) out[i] = Wire.read();
  return true;
}

// Sensirion reply: groups of 2 data bytes + 1 CRC byte. True if every CRC matches.
bool sensirionOk(const uint8_t* r, int n) {
  for (int i = 0; i + 2 < n; i += 3)
    if (crc8(r + i, 2) != r[i + 2]) return false;
  return true;
}

bool readReg8(uint8_t a, uint8_t reg, uint8_t& v) {
  uint8_t r[1];
  if (!xfer(a, &reg, 1, 2, r, 1)) return false;
  v = r[0];
  return true;
}

void identify(uint8_t a) {
  Serial.printf("[identify] 0x%02X: ", a);
  uint8_t r[9];

  if (a == 0x76 || a == 0x77) {
    uint8_t id;
    if (readReg8(a, 0xD0, id)) {
      if (id == 0x60) Serial.println("Bosch BME280 (chip id 0x60): temperature, humidity, pressure");
      else if (id == 0x58) Serial.println("Bosch BMP280 (chip id 0x58): temperature and pressure only, NO humidity");
      else if (id == 0x61) Serial.println("Bosch BME680/688 (chip id 0x61): temperature, humidity, pressure, gas");
      else if (id == 0x55) Serial.println("Bosch BMP180 (chip id 0x55): temperature and pressure only");
      else Serial.printf("answers at a Bosch address but chip id is 0x%02X: unknown or counterfeit\n", id);
      return;
    }
  }

  if (a == 0x44 || a == 0x45 || a == 0x46) {
    const uint8_t sht4Serial[] = {0x89}, sht4Measure[] = {0xFD};
    const uint8_t sht3Serial[] = {0x37, 0x80}, sht3Measure[] = {0x24, 0x00};
    if (xfer(a, sht4Serial, 1, 10, r, 6) && sensirionOk(r, 6)) {
      Serial.printf("Sensirion SHT4x (SHT40/41/45), serial %02X%02X%02X%02X", r[0], r[1], r[3], r[4]);
      if (xfer(a, sht4Measure, 1, 10, r, 6) && sensirionOk(r, 6))
        Serial.printf(": %.2f C, %.1f %%RH", -45 + 175 * ((r[0] << 8 | r[1]) / 65535.0f), constrain(-6 + 125 * ((r[3] << 8 | r[4]) / 65535.0f), 0.0f, 100.0f));
      Serial.println(" (temperature and humidity, no pressure)");
      return;
    }
    if (xfer(a, sht3Serial, 2, 10, r, 6) && sensirionOk(r, 6)) {
      Serial.printf("Sensirion SHT3x (SHT30/31/35), serial %02X%02X%02X%02X", r[0], r[1], r[3], r[4]);
      if (xfer(a, sht3Measure, 2, 20, r, 6) && sensirionOk(r, 6))
        Serial.printf(": %.2f C, %.1f %%RH", -45 + 175 * ((r[0] << 8 | r[1]) / 65535.0f), 100 * ((r[3] << 8 | r[4]) / 65535.0f));
      Serial.println(" (temperature and humidity, no pressure)");
      return;
    }
  }

  if (a == 0x62) {
    const uint8_t stop[] = {0x3F, 0x86}, serial[] = {0x36, 0x82};
    Wire.beginTransmission(a);
    Wire.write(stop, 2);
    Wire.endTransmission();
    delay(500);  // SCD4x needs 500 ms after stopping periodic measurement
    if (xfer(a, serial, 2, 2, r, 9) && sensirionOk(r, 9)) {
      Serial.println("Sensirion SCD40/SCD41: true NDIR-style CO2, plus temperature and humidity");
      return;
    }
  }

  if (a == 0x61) {
    const uint8_t fw[] = {0xD1, 0x00};
    if (xfer(a, fw, 2, 5, r, 3) && sensirionOk(r, 3)) {
      Serial.printf("Sensirion SCD30, firmware %u.%u: NDIR CO2, plus temperature and humidity\n", r[0], r[1]);
      return;
    }
  }

  if (a == 0x58) {
    const uint8_t serial[] = {0x36, 0x82};
    if (xfer(a, serial, 2, 10, r, 9) && sensirionOk(r, 9)) {
      Serial.println("Sensirion SGP30: TVOC and estimated eCO2 (NOT a real CO2 sensor)");
      return;
    }
  }

  if (a == 0x5A || a == 0x5B) {
    uint8_t id;
    if (readReg8(a, 0x20, id) && id == 0x81) {
      Serial.println("ams CCS811 (hardware id 0x81): TVOC and estimated eCO2 (NOT a real CO2 sensor)");
      return;
    }
  }

  if (a == 0x40) {
    uint8_t reg = 0xFF;
    if (xfer(a, &reg, 1, 15, r, 2) && r[0] == 0x10 && r[1] == 0x50) {
      Serial.println("TI HDC1080 (device id 0x1050): temperature and humidity");
      return;
    }
    const uint8_t eid[] = {0xFC, 0xC9};
    if (xfer(a, eid, 2, 5, r, 6)) {
      if (r[0] == 0x15) { Serial.println("Silicon Labs Si7021: temperature and humidity"); return; }
      if (r[0] == 0x14) { Serial.println("Silicon Labs Si7020: temperature and humidity"); return; }
      if (r[0] == 0x0D) { Serial.println("Silicon Labs Si7013: temperature and humidity"); return; }
    }
    Serial.println("probably HTU21D / SHT21 / SHT20 (temperature and humidity); this family has no reliable id command");
    return;
  }

  if (a == 0x38) {
    uint8_t s;
    Wire.requestFrom(a, (uint8_t)1);
    s = Wire.available() ? Wire.read() : 0xFF;
    Serial.printf("probably Aosong AHT10/AHT20/AHT21 (status 0x%02X): temperature and humidity; no id command\n", s);
    return;
  }

  if (a == 0x10) {
    uint8_t reg = 0x07;
    if (xfer(a, &reg, 1, 2, r, 2) && r[0] == 0x81) {
      Serial.println("Vishay VEML7700 (id 0x81): light level (lux)");
      return;
    }
  }

  if (a == 0x23 || a == 0x5C) {
    Serial.println("probably ROHM BH1750 light sensor (lux); it has no id command");
    return;
  }

  Serial.println("unknown device. Look up the address in the identify-sensor skill's table and the module's markings");
}

// Listens on the UART without sending anything, and names what it hears.
void listenUart() {
  uart.begin(9600, SERIAL_8N1, UART_RX, UART_TX);
  uint8_t b[64];
  int n = 0;
  uint32_t until = millis() + 3000;
  while (millis() < until && n < (int)sizeof b) {
    if (uart.available()) b[n++] = uart.read();
  }
  uart.end();
  Serial.printf("[identify] UART on GPIO%d at 9600: ", UART_RX);
  if (n == 0) {
    Serial.println("silent. Either nothing is wired, or it is a request/response sensor (MH-Z19, SenseAir S8) that only talks when asked");
    return;
  }
  // Find a 42 4D ("BM") frame start.
  for (int i = 0; i + 4 < n; i++) {
    if (b[i] != 0x42 || b[i + 1] != 0x4D) continue;
    if (b[i + 2] == 0x00 && b[i + 3] == 0x1C) {
      Serial.println("Plantower PMS5003/PMS7003 particulate sensor (PM1/PM2.5/PM10), frame length 28");
      return;
    }
    if (i + 16 <= n) {
      uint8_t sum = 0;
      for (int k = 0; k < 15; k++) sum += b[i + k];
      if (sum == b[i + 15]) {
        Serial.printf("16-byte 42 4D frame with valid checksum: SC8-CO2 style NDIR CO2 sensor, %d ppm\n", b[i + 6] * 256 + b[i + 7]);
        return;
      }
    }
    Serial.println("42 4D (\"BM\") frames of an unrecognised layout: a Plantower-style sensor. Find its datasheet before decoding");
    return;
  }
  Serial.printf("%d bytes of an unrecognised format, first bytes:", n);
  for (int i = 0; i < n && i < 16; i++) Serial.printf(" %02X", b[i]);
  Serial.println();
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n[identify] HITL sensor identification");
}

void loop() {
  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(100000);
  int found = 0;
  for (uint8_t a = 1; a < 127; a++) {
    if (!present(a)) continue;
    found++;
    identify(a);
  }
  if (!found) {
    Wire.end();
    Wire.begin(SCL_PIN, SDA_PIN);  // swapped, to catch crossed wires
    int swapped = 0;
    for (uint8_t a = 1; a < 127; a++) {
      if (!present(a)) continue;
      swapped++;
      Serial.printf("[identify] 0x%02X answers only with SDA and SCL swapped: swap the two wires\n", a);
    }
    if (!swapped) Serial.println("[identify] I2C: nothing answers on GPIO 21/22. Check power (3V3), GND and solder joints");
  }
  Wire.end();
  listenUart();
  Serial.println("[identify] ---");
  delay(5000);
}
