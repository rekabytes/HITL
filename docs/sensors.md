# Sensors (ESP32 + BME280)

1. In the portal go to **Rooms and sensors**, register the device under its room and copy the key. It is shown once; **New key** makes another and turns the old one off.
2. Put the portal URL and the key in the firmware.
3. Post a reading every 30 to 60 seconds.

The JSON body keeps the field names the old firmware used, so the only firmware change is the header.

```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <Adafruit_BME280.h>

const char* WIFI_SSID = "...";
const char* WIFI_PASS = "...";
const char* ENDPOINT  = "https://hitl.example.edu.my/api/sensor";
const char* DEVICE_KEY = "hitl_...";  // from the portal

Adafruit_BME280 bme;

void setup() {
  Serial.begin(115200);
  bme.begin(0x76);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(500);
}

void loop() {
  char body[96];
  snprintf(body, sizeof body, "{\"temperature\":%.2f,\"humidity\":%.2f,\"pressure\":%.1f}",
           bme.readTemperature(), bme.readHumidity(), bme.readPressure() / 100.0F);

  HTTPClient http;
  http.begin(ENDPOINT);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_KEY);
  int code = http.POST(body);
  Serial.printf("POST %d\n", code);
  http.end();

  delay(60000);
}
```

With HTTPS, either pin the server certificate with `WiFiClientSecure::setCACert` or keep the portal on the campus network and use HTTP inside it.

## Status

A sensor counts as online when it sent a reading in the last 10 minutes. After 30 minutes of silence an assigned sensor opens a "sensor offline" alert.
