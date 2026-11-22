#include "../hitl-sensor/sc8-parser.h"
#include <cassert>
#include <cstdint>
#include <cstddef>

int main() {
  const uint8_t frame[] = {0x42, 0x4D, 0x07, 0x5C, 0x08, 0x23, 0x01, 0x9D, 0x01, 0x2C, 0, 0, 0xE2, 0, 0x06, 0xD0};
  Sc8Parser parser;
  uint16_t ppm = 0;
  assert(!parser.push(0x42, ppm));
  for (size_t i = 0; i < sizeof frame; ++i) assert(parser.push(frame[i], ppm) == (i == sizeof frame - 1));
  assert(ppm == 413);
  auto push = [&](const uint8_t* data) {
    bool ok = false;
    for (size_t i = 0; i < sizeof frame; ++i) ok = parser.push(data[i], ppm) || ok;
    return ok;
  };
  uint8_t bad[sizeof frame];
  for (size_t i = 0; i < sizeof frame; ++i) bad[i] = frame[i];
  bad[15] ^= 1;
  assert(!push(bad));
  bad[6] = 0x20;  // 8349 ppm, outside the 5K module range, with valid checksum
  bad[15] = 0xEF;
  assert(!push(bad));
  // Truncated frame, immediately followed by a complete one.
  for (size_t i = 0; i < 9; ++i) assert(!parser.push(frame[i], ppm));
  assert(push(frame));
  assert(ppm == 413);

  Sc8Reading reading;
  assert(reading.status(0) == Sc8Status::Offline);
  for (uint32_t now = 0; now <= 180000; now += 1000) {
    reading.accept(413, now);
    assert(reading.status(now) == (now < 180000 ? Sc8Status::WarmingUp : Sc8Status::Online));
  }
  assert(reading.status(184999) == Sc8Status::Online);
  assert(reading.status(185000) == Sc8Status::Offline);
  reading.accept(420, 186000);
  assert(reading.status(186000) == Sc8Status::WarmingUp);
  assert(reading.ppm == 420);
}
