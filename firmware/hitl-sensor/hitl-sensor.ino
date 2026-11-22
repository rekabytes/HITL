// HITL room sensor: ESP32 + BME280, reports board and sensor status every minute.
//
// Wiring (I2C): BME280 VIN -> 3V3, GND -> GND, SCL -> GPIO 22, SDA -> GPIO 21.
// Settings live in config.h (copy config.example.h). See firmware/README.md.
//
// Built to be left alone in a room: it finds the BME280 at either address,
// reconnects Wi-Fi on its own, retries failed posts, and restarts itself if it
// cannot deliver a report for 15 minutes.

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_BME280.h>
#include "sc8-parser.h"

#if __has_include("config.h")
#include "config.h"
#else
#error "Copy config.example.h to config.h and fill in your Wi-Fi, ENDPOINT and DEVICE_KEY."
#endif

#define FIRMWARE_VERSION "hitl-1.3.0"

// Existing deployments remain BME280-only until CO2_RX_PIN is set in config.h.
#ifdef CO2_RX_PIN
HardwareSerial co2Serial(2);
Sc8Parser co2Parser;
Sc8Reading co2Reading;

void pollCo2() {
  // Bound the work even if the UART is noisy. The SC8 sends one 16-byte frame per second.
  for (unsigned n = 0; n < 512 && co2Serial.available(); ++n) {
    uint16_t ppm;
    if (co2Parser.push(co2Serial.read(), ppm)) co2Reading.accept(ppm, millis());
  }
}
#else
void pollCo2() {}
#endif

// Onboard LED on most ESP32 DevKit boards. Blinks once per delivered report.
#ifndef LED_PIN
#define LED_PIN 2
#endif

static const uint32_t WIFI_TIMEOUT_MS = 20000;
static const uint32_t RESTART_AFTER_MS = 15UL * 60UL * 1000UL;  // no delivered report for this long
static const uint32_t RETRY_MS = 10000;                          // after a failed post

Adafruit_BME280 bme;
uint32_t lastPostAt = 0;
uint32_t lastSuccessAt = 0;
bool lastPostOk = true;
bool haveSensor = false;
uint8_t sensorAddress = 0;

void blink(int times, int ms = 80) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_PIN, HIGH);
    delay(ms);
    digitalWrite(LED_PIN, LOW);
    delay(ms);
  }
}

// Tries both I2C addresses. Explains the usual reasons it fails.
bool startSensor() {
  for (uint8_t addr : {0x76, 0x77}) {
    if (bme.begin(addr, &Wire)) {
      sensorAddress = addr;
      Serial.printf("[bme] BME280 found at 0x%02X\n", addr);
      // Weather-station settings: one measurement when asked, little self-heating.
      bme.setSampling(Adafruit_BME280::MODE_FORCED, Adafruit_BME280::SAMPLING_X1, Adafruit_BME280::SAMPLING_X1,
                      Adafruit_BME280::SAMPLING_X1, Adafruit_BME280::FILTER_OFF);
      return true;
    }
  }
  // Read the chip id ourselves to tell a BMP280 (no humidity) apart from a wiring fault.
  for (uint8_t addr : {0x76, 0x77}) {
    Wire.beginTransmission(addr);
    Wire.write(0xD0);
    if (Wire.endTransmission() == 0 && Wire.requestFrom(addr, (uint8_t)1) == 1) {
      uint8_t id = Wire.read();
      if (id == 0x58) {
        Serial.printf("[bme] Found a BMP280 at 0x%02X, not a BME280. It has no humidity sensor; HITL needs a BME280.\n", addr);
        return false;
      }
      Serial.printf("[bme] Unknown chip id 0x%02X at 0x%02X.\n", id, addr);
    }
  }
  Serial.println("[bme] No sensor found. Check: VIN to 3V3, GND to GND, SCL to GPIO 22, SDA to GPIO 21.");
  return false;
}

// After a failed attempt: says whether the network is visible at all, and lists what is.
void explainWifiFailure(wl_status_t status) {
  if (status == WL_NO_SSID_AVAIL) {
    Serial.printf("[wifi] Network \"%s\" not found.\n", WIFI_SSID);
  } else if (status == WL_CONNECT_FAILED || status == WL_DISCONNECTED) {
    Serial.println("[wifi] The network answered but refused us. Usually a wrong password.");
  } else {
    Serial.printf("[wifi] Could not connect (status %d).\n", status);
  }
  int n = WiFi.scanNetworks();
  bool seen = false;
  Serial.printf("[wifi] %d networks in range:\n", n);
  for (int i = 0; i < n && i < 15; i++) {
    bool match = WiFi.SSID(i) == WIFI_SSID;
    seen |= match;
    Serial.printf("[wifi]   %s%s  %d dBm  ch %d%s\n", match ? "> " : "  ", WiFi.SSID(i).c_str(), WiFi.RSSI(i), WiFi.channel(i),
                  WiFi.encryptionType(i) == WIFI_AUTH_WPA2_ENTERPRISE ? "  (enterprise: not supported)" : "");
  }
  WiFi.scanDelete();
  if (!seen) Serial.println("[wifi] Ours is not in the list: check the exact name (case and spaces), that it is 2.4 GHz, and the distance.");
  else Serial.println("[wifi] Ours is in range, so check the password in config.h.");
}

bool connectWifi() {
  if (WiFi.status() == WL_CONNECTED) return true;
  Serial.printf("[wifi] Connecting to \"%s\"", WIFI_SSID);
  // Start from a clean state; calling begin() while an attempt is running fails.
  WiFi.disconnect(true);
  delay(100);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  uint32_t start = millis();
  wl_status_t st = WiFi.status();
  while (st != WL_CONNECTED && millis() - start < WIFI_TIMEOUT_MS) {
    for (unsigned i = 0; i < 10; ++i) {
      pollCo2();
      delay(50);
    }
    Serial.print(".");
    st = WiFi.status();
    if (st == WL_NO_SSID_AVAIL || st == WL_CONNECT_FAILED) break;  // no point waiting longer
  }
  Serial.println();
  if (st != WL_CONNECTED) {
    explainWifiFailure(st);
    return false;
  }
  Serial.printf("[wifi] Connected, IP %s, signal %d dBm\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());
  return true;
}

bool sensorAnswers() {
  // Confirm the BME280 chip ID, not just that some device ACKs this address.
  Wire.beginTransmission(sensorAddress);
  Wire.write(0xD0);
  return Wire.endTransmission(false) == 0 &&
         Wire.requestFrom(sensorAddress, (uint8_t)1) == 1 && Wire.read() == 0x60;
}

// A failed sensor check is still a successful heartbeat if the portal accepts it.
bool postReport(bool measured, float t, float h, float p) {
  char body[256];
  char co2[64] = "";
#ifdef CO2_RX_PIN
  switch (co2Reading.status(millis())) {
    case Sc8Status::Online:
      snprintf(co2, sizeof co2, ",\"co2\":{\"status\":\"online\",\"ppm\":%u}", unsigned(co2Reading.ppm));
      break;
    case Sc8Status::WarmingUp:
      snprintf(co2, sizeof co2, ",\"co2\":{\"status\":\"warming_up\"}");
      break;
    case Sc8Status::Offline:
      snprintf(co2, sizeof co2, ",\"co2\":{\"status\":\"offline\"}");
      break;
  }
#endif
  int length;
  if (measured) {
    length = snprintf(body, sizeof body, "{\"sensorStatus\":\"online\",\"firmwareVersion\":\"" FIRMWARE_VERSION
                      "\",\"reading\":{\"temperature\":%.2f,\"humidity\":%.2f,\"pressure\":%.1f}%s}", t, h, p, co2);
  } else {
    length = snprintf(body, sizeof body, "{\"sensorStatus\":\"offline\",\"firmwareVersion\":\"" FIRMWARE_VERSION "\"%s}", co2);
  }
  if (length < 0 || size_t(length) >= sizeof body) {
    Serial.println("[post] Report did not fit in the JSON buffer.");
    return false;
  }

  HTTPClient http;
  WiFiClientSecure secure;
  WiFiClient plain;
  bool https = strncmp(ENDPOINT, "https://", 8) == 0;
  if (https) {
    if (strlen(ROOT_CA) > 0) secure.setCACert(ROOT_CA);
    else secure.setInsecure();  // encrypted but unverified, see config.example.h
    http.begin(secure, ENDPOINT);
  } else {
    http.begin(plain, ENDPOINT);
  }
  http.setTimeout(10000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_KEY);
  http.addHeader("User-Agent", "hitl-esp32/" FIRMWARE_VERSION);

  int code = http.POST((uint8_t*)body, strlen(body));
  String reply = code > 0 ? http.getString() : String(http.errorToString(code));
  http.end();

  Serial.printf("[post] %s -> %d %s\n", body, code, reply.c_str());
  if (code == 401) Serial.println("[post] The portal does not know this DEVICE_KEY. Copy it again from Rooms and sensors.");
  if (code == 429) Serial.println("[post] Too many reports. Raise POST_INTERVAL_S.");
  if (code < 0) Serial.println("[post] Could not reach the portal. Check ENDPOINT, and that the server is reachable from this Wi-Fi.");
  if (code == 200 && reply.indexOf("\"assigned\":false") >= 0) {
    Serial.println("[post] Stored, but this sensor has no room yet. Assign it a room in the portal.");
  }
  return code == 200;
}

void setup() {
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(115200);
  delay(300);
  Serial.printf("\nHITL sensor %s\n", FIRMWARE_VERSION);

#ifdef CO2_RX_PIN
  // Receive-only: sending a query would switch off automatic output until power cycle.
  co2Serial.begin(9600, SERIAL_8N1, CO2_RX_PIN, -1);
#endif
  Wire.begin(21, 22);
  Wire.setTimeOut(50);
  connectWifi();
  lastSuccessAt = millis();
  lastPostAt = millis() - POST_INTERVAL_S * 1000UL;  // first report straight away
}

void loop() {
  pollCo2();
  uint32_t now = millis();
  uint32_t wait = lastPostOk ? POST_INTERVAL_S * 1000UL : RETRY_MS;

  if (now - lastPostAt >= wait) {
    lastPostAt = now;
    if (!haveSensor) haveSensor = startSensor();

    float t = NAN, h = NAN, p = NAN;
    bool measured = false;
    if (haveSensor && sensorAnswers() && bme.takeForcedMeasurement()) {
      t = bme.readTemperature();
      h = bme.readHumidity();
      p = bme.readPressure() / 100.0F;
      measured = sensorAnswers() && isfinite(t) && isfinite(h) && isfinite(p) &&
                 t >= -20 && t <= 70 && h >= 0 && h <= 100 && p >= 300 && p <= 1200;
    }
    if (!measured) {
      haveSensor = false;  // Try both addresses again at the next report.
      Serial.println("[bme] No valid reading; reporting sensor offline.");
    }

    lastPostOk = connectWifi();
    if (lastPostOk) {
      pollCo2();
      lastPostOk = postReport(measured, t, h, p);
    }
    if (lastPostOk) {
      lastSuccessAt = millis();
      blink(1);
    }
  }

  // Last resort for a sensor nobody is watching: a clean restart fixes most stuck states.
  if (millis() - lastSuccessAt > RESTART_AFTER_MS) {
    Serial.println("[sys] No report delivered for 15 minutes, restarting.");
    delay(200);
    ESP.restart();
  }
  delay(200);
}
