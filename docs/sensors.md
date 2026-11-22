# Environmental sensors (ESP32 + SHT3x or BME280)

1. In the portal go to **Rooms and sensors**, register the device with its firmware version, pick the room it sits in (or several rooms for a sensor in a shared space) and copy the key. It is shown once; **New key** makes another and turns the old one off.
2. Put the portal URL and the key in the firmware.
3. Report a heartbeat and environmental sensor check every minute. Send measurements only after a successful check.

Ready-to-flash firmware is in [`firmware/hitl-sensor`](../firmware/README.md): it checks for SHT3x at `0x44`/`0x45` before trying BME280 at `0x76`/`0x77`, reconnects Wi-Fi, retries failed posts and logs errors over serial. See [the API documentation](api.md#sensors) for the current report format.

The sketch below shows the legacy flat JSON format using a BME280. It does not report sensor health. SHT3x reports temperature and humidity with `pressure: null`.

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

## Several sensors in one room

A large room can have more than one sensor. The room's current temperature and humidity are the average of the latest reading from each sensor that reported in the last 15 minutes; a sensor that goes quiet drops out of the average until it reports again. The dashboard marks these rooms "avg of N sensors". Each sensor's own readings stay visible on the Sensors page and in the history.

## Status

An ESP32 is online when it sent a heartbeat in the last 3 minutes. A failed environmental sensor check shows Sensor Offline while the ESP32 stays Online. If the ESP32 falls offline, the sensor status becomes Unknown. The separate room alert still checks for 30 minutes without device contact when staff open the FM dashboard or Alerts page.

Deleting a sensor keeps its past readings. Deleting a room removes everything recorded for it, so the portal asks you to type the room code first.

## Optional CO₂ monitoring

The ESP32 can monitor the SC8-CO2-5K independently from the environmental sensor. See the [firmware wiring and rollout instructions](../firmware/README.md#optional-sc8-co2-5k-sensor). The admin and FM sensor pages show CO₂ status separately. The FM dashboard shows current ppm from online sensors, and Analytics shows historical ppm. The public `/v1/sensor-status` response exposes both the CO₂ state and its last stored measurement.
