#pragma once
#include <stddef.h>
#include <stdint.h>
#include <string.h>

// SC8-CO2-5K automatic UART output, not the MH-Z19 request protocol.
class Sc8Parser {
  uint8_t frame[16];
  size_t used = 0;

public:
  bool push(uint8_t byte, uint16_t& ppm) {
    if (used == 0 && byte != 0x42) return false;
    if (used == 1 && byte != 0x4D) {
      used = byte == 0x42 ? 1 : 0;
      return false;
    }
    frame[used++] = byte;
    if (used < sizeof frame) return false;

    uint8_t sum = 0;
    for (size_t i = 0; i < sizeof frame - 1; ++i) sum += frame[i];
    const uint16_t value = (uint16_t(frame[6]) << 8) | frame[7];
    if (sum == frame[15]) {
      used = 0;
      if (value == 0 || value > 5000) return false;
      ppm = value;
      return true;
    }

    // A damaged frame may already contain the start of the next frame.
    for (size_t i = 1; i < sizeof frame; ++i) {
      if (frame[i] == 0x42 && (i + 1 == sizeof frame || frame[i + 1] == 0x4D)) {
        used = sizeof frame - i;
        memmove(frame, frame + i, used);
        return false;
      }
    }
    used = 0;
    return false;
  }
};

enum class Sc8Status { Offline, WarmingUp, Online };

struct Sc8Reading {
  static const uint32_t timeoutMs = 5000;
  static const uint32_t warmupMs = 180000;
  uint32_t firstAt = 0;
  uint32_t lastAt = 0;
  uint16_t ppm = 0;
  bool seen = false;
  bool warmed = false;

  void accept(uint16_t value, uint32_t now) {
    if (!seen || now - lastAt >= timeoutMs) {
      firstAt = now;
      warmed = false;
    }
    seen = true;
    lastAt = now;
    ppm = value;
    if (now - firstAt >= warmupMs) warmed = true;
  }

  Sc8Status status(uint32_t now) const {
    if (!seen || now - lastAt >= timeoutMs) return Sc8Status::Offline;
    return warmed ? Sc8Status::Online : Sc8Status::WarmingUp;
  }
};
