// I2C wiring check for the HITL sensor board. Scans every address on GPIO 21/22,
// both ways round (to catch swapped SDA/SCL), and reads the chip id of anything
// at 0x76/0x77: 0x60 = BME280, 0x58 = BMP280 (no humidity).
// Temporary diagnostic: flash the real firmware back afterwards.
#include <Wire.h>

void scan(int sda, int scl) {
  Wire.end();
  Wire.begin(sda, scl);
  Wire.setClock(100000);
  int found = 0;
  Serial.printf("[scan] SDA=GPIO%d SCL=GPIO%d:", sda, scl);
  for (uint8_t a = 1; a < 127; a++) {
    Wire.beginTransmission(a);
    if (Wire.endTransmission() == 0) {
      Serial.printf(" 0x%02X", a);
      found++;
      if (a == 0x76 || a == 0x77) {
        Wire.beginTransmission(a);
        Wire.write(0xD0);
        Wire.endTransmission();
        if (Wire.requestFrom(a, (uint8_t)1) == 1) Serial.printf("(chip id 0x%02X)", Wire.read());
      }
    }
  }
  Serial.println(found ? "" : " nothing");
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n[scan] I2C wiring check");
}

void loop() {
  scan(21, 22);  // correct wiring
  scan(22, 21);  // SDA and SCL swapped
  delay(3000);
}
