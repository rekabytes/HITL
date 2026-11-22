// Copy this file to config.h and fill it in. config.h is git-ignored:
// it holds your Wi-Fi password and the device key, which must never be committed.
#pragma once

// 2.4 GHz network with a plain password (WPA2-Personal). The ESP32 cannot join
// 5 GHz networks, or campus networks that ask for a username or a sign-in page.
#define WIFI_SSID "your-wifi-name"
#define WIFI_PASS "your-wifi-password"

// Where the portal is, as the ESP32 sees it. On the same Wi-Fi as a dev laptop:
//   http://192.168.x.y:3000/api/sensor
// HITL production endpoint (use your own URL for other deployments):
//   https://hitl.reka-bytes.my/api/sensor
#define ENDPOINT "http://192.168.1.10:3000/api/sensor"

// From the portal: Rooms and sensors -> register the sensor -> copy the key.
// It is shown once. "New key" in the portal replaces it.
#define DEVICE_KEY "hitl_paste-the-key-here"

// Seconds between readings. The portal expects 30 to 60.
#define POST_INTERVAL_S 60

// Uncomment for the SC8-CO2-5K. Connect its TX to this ESP32 input.
// #define CO2_RX_PIN 16

// HTTPS only. Paste the server's root CA certificate (PEM) to check who you are
// talking to. Leave it empty to skip the check: the traffic is still
// encrypted, but anyone on the network could pretend to be the server.
// Fine for a lab; set it for a real deployment.
#define ROOT_CA ""
