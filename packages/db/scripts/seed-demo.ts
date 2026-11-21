// Fills an empty dev database with a week of believable demo data so every
// page has something to show. Never run against production.
//
//   DEV_ADMIN_EMAIL=... DEV_ADMIN_PASSWORD=... pnpm db:seed-demo
//
// Creates: an admin and a facility manager (both use DEV_ADMIN_PASSWORD),
// five occupants, two buildings, four rooms each with a sensor, 7 days of
// 5-minute readings, occupant votes paired with conditions, PICs and alerts.
import "./env";
import { createHmac, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { sql as dsql } from "drizzle-orm";
import { alerts, actions, buildings, createDb, feedback, pics, rooms, sensorReadings, sensorRooms, sensors, users } from "../src/index";

const url = process.env.DATABASE_URL;
const secret = process.env.AUTH_SECRET;
const adminEmail = process.env.DEV_ADMIN_EMAIL;
const adminPassword = process.env.DEV_ADMIN_PASSWORD;
if (!url || !secret) throw new Error("DATABASE_URL and AUTH_SECRET must be set");
if (!adminEmail || !adminPassword) throw new Error("Set DEV_ADMIN_EMAIL and DEV_ADMIN_PASSWORD");
if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed demo data in production");

const { db, sql } = createDb(url, { max: 2 });

// Deterministic randomness so screenshots look the same between runs.
let seed = 42;
const rand = () => ((seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648) / 2_147_483_648);
const noise = (amp: number) => (rand() - 0.5) * 2 * amp;

/** Hour of day in Malaysia (UTC+8). */
const myHour = (d: Date) => (d.getUTCHours() + 8) % 24;
const isWeekday = (d: Date) => {
  const day = new Date(d.getTime() + 8 * 3_600_000).getUTCDay();
  return day >= 1 && day <= 5;
};

interface RoomProfile {
  code: string;
  name: string;
  floor: string;
  building: string;
  /** Temperature while the AC runs (8:00 to 18:00 on weekdays). */
  occupiedC: number;
  /** Extra heat in the afternoon (people, computers, sun). */
  afternoonC: number;
  humidity: number;
}

const PROFILES: RoomProfile[] = [
  { code: "BK-01", name: "Lecture Room 1", floor: "1", building: "Block K", occupiedC: 21.6, afternoonC: 0.4, humidity: 55 },
  { code: "BK-02", name: "Computer Lab", floor: "2", building: "Block K", occupiedC: 25.2, afternoonC: 2.6, humidity: 60 },
  { code: "BK-03", name: "Meeting Room", floor: "2", building: "Block K", occupiedC: 24.2, afternoonC: 0.6, humidity: 58 },
  { code: "BA-101", name: "Library Reading Area", floor: "1", building: "Block A", occupiedC: 24.6, afternoonC: 0.8, humidity: 74 },
];

function conditions(p: RoomProfile, t: Date) {
  const h = myHour(t) + t.getUTCMinutes() / 60;
  const occupied = isWeekday(t) && h >= 8 && h < 18;
  let temp: number;
  if (occupied) {
    const afternoon = Math.max(0, Math.sin(((h - 11) / 7) * Math.PI)) * p.afternoonC;
    temp = p.occupiedC + afternoon;
  } else {
    temp = 28.5 + Math.sin(((h - 9) / 24) * 2 * Math.PI) * 1.2; // AC off, tropical night/day drift
  }
  const hum = occupied ? p.humidity : p.humidity + 12;
  return { temp: temp + noise(0.25), hum: Math.min(95, hum + noise(2.5)), occupied };
}

/** How a typical occupant here votes at a given temperature. */
function vote(temp: number, hum: number): "too_cold" | "perfect" | "too_hot" {
  const feelsLike = temp + Math.max(0, hum - 70) * 0.06 + noise(0.9);
  if (feelsLike < 23.2) return "too_cold";
  if (feelsLike > 25.8) return "too_hot";
  return "perfect";
}

const COMMENTS: Record<string, string[]> = {
  too_cold: ["Freezing, had to wear a jacket", "AC is way too strong", "Too cold to focus", ""],
  perfect: ["Comfortable", "Nice today", "", "", "Good"],
  too_hot: ["Very stuffy after lunch", "Too warm, sweating", "Computers make it hot in here", "Air feels sticky", ""],
};

async function main() {
  const [{ n } = { n: 0 }] = await db.select({ n: dsql<number>`count(*)::int` }).from(users);
  if (n > 0 && !process.argv.includes("--force")) {
    throw new Error("Database already has users. Pass --force to add demo data anyway.");
  }

  const hash = await bcrypt.hash(adminPassword!, 12);
  const [admin] = await db.insert(users).values({ email: adminEmail!, name: "Demo Admin", passwordHash: hash, role: "admin" }).returning();
  const [fm] = await db
    .insert(users)
    .values({ email: adminEmail!.replace("@", "+fm@"), name: "Aisyah (Facility Manager)", passwordHash: hash, role: "facility_manager" })
    .returning();
  const occupantNames = ["Nur Izra", "Alieya", "Hakim", "Mei Ling", "Arjun"];
  const occupants = await db
    .insert(users)
    .values(
      occupantNames.map((name, i) => ({
        email: `occupant${i + 1}@hitl.test`,
        name,
        passwordHash: hash,
        role: "occupant" as const,
      })),
    )
    .returning();

  const buildingIds = new Map<string, string>();
  for (const [name, address] of [["Block K", "UniKL MIIT, Kuala Lumpur"], ["Block A", "UniKL MIIT, Kuala Lumpur"]] as const) {
    const [b] = await db.insert(buildings).values({ name, address }).returning();
    buildingIds.set(name, b!.id);
  }

  const roomIds = new Map<string, string>();
  for (const p of PROFILES) {
    const [r] = await db.insert(rooms).values({ buildingId: buildingIds.get(p.building)!, code: p.code, name: p.name, floor: p.floor }).returning();
    roomIds.set(p.code, r!.id);
    const key = `hitl_${randomBytes(24).toString("base64url")}`;
    const [s] = await db
      .insert(sensors)
      .values({
        deviceId: `esp32-${p.code.toLowerCase()}`,
        label: "BME280",
        firmwareVersion: "v2.4.11",
        keyHash: createHmac("sha256", secret!).update(key).digest("hex"),
        lastSeenAt: new Date(),
      })
      .returning();
    await db.insert(sensorRooms).values({ sensorId: s!.id, roomId: r!.id });
    if (p.code === "BK-02") console.log(`Device key for esp32-bk-02 (to post live readings): ${key}`);
  }

  // --- readings: every 5 minutes for 7 days ---
  const now = Date.now();
  const start = now - 7 * 86_400_000;
  const step = 5 * 60_000;
  for (const p of PROFILES) {
    const roomId = roomIds.get(p.code)!;
    const rows = [];
    for (let t = start; t <= now; t += step) {
      const d = new Date(t);
      const c = conditions(p, d);
      rows.push({ roomId, temperatureC: +c.temp.toFixed(2), humidityPct: +c.hum.toFixed(1), pressureHpa: +(1008 + noise(2)).toFixed(1), recordedAt: d });
    }
    for (let i = 0; i < rows.length; i += 1000) await db.insert(sensorReadings).values(rows.slice(i, i + 1000));
  }

  // --- votes: occupied hours, a few per room per day ---
  const votes = [];
  for (const p of PROFILES) {
    const roomId = roomIds.get(p.code)!;
    for (let t = start; t <= now; t += 20 * 60_000) {
      const d = new Date(t + noise(8 * 60_000));
      const c = conditions(p, d);
      if (!c.occupied || rand() > 0.42) continue;
      const v = vote(c.temp, c.hum);
      const picks = COMMENTS[v]!;
      votes.push({
        roomId,
        userId: occupants[Math.floor(rand() * occupants.length)]!.id,
        vote: v,
        comfortable: v === "perfect" || rand() < 0.15,
        comment: picks[Math.floor(rand() * picks.length)]!,
        temperatureC: +c.temp.toFixed(2),
        humidityPct: +c.hum.toFixed(1),
        source: "mobile" as const,
        createdAt: d,
      });
    }
  }
  // A burst of "too hot" in the computer lab right now, so the dashboard shows a live problem.
  for (let i = 0; i < 4; i++) {
    votes.push({
      roomId: roomIds.get("BK-02")!,
      userId: occupants[i]!.id,
      vote: "too_hot" as const,
      comfortable: false,
      comment: ["Too warm, sweating", "Very stuffy", "", "Please lower the AC"][i]!,
      temperatureC: 27.6,
      humidityPct: 61,
      source: "mobile" as const,
      createdAt: new Date(now - (25 - i * 6) * 60_000),
    });
  }
  await db.insert(feedback).values(votes);

  // Make sure each room's latest reading reflects "right now" during working hours.
  const latest = { "BK-01": [21.4, 54], "BK-02": [27.6, 61], "BK-03": [24.1, 57], "BA-101": [24.9, 76] } as const;
  for (const [code, [t, h]] of Object.entries(latest)) {
    await db.insert(sensorReadings).values({ roomId: roomIds.get(code)!, temperatureC: t, humidityPct: h, pressureHpa: 1008.4, recordedAt: new Date() });
  }

  // --- PICs ---
  await db.insert(pics).values([
    { roomId: roomIds.get("BK-02")!, name: "Encik Faizal", email: "faizal@hitl.test", phone: "+60123456789" },
    { roomId: roomIds.get("BA-101")!, name: "Puan Rohana", email: "rohana@hitl.test", phone: "+60198765432" },
  ]);

  // --- alerts ---
  const ago = (min: number) => new Date(now - min * 60_000);
  await db.insert(alerts).values([
    {
      roomId: roomIds.get("BK-02")!,
      kind: "feedback",
      severity: "critical",
      message: "4 of 4 occupants said the room is too hot in the last 30 minutes.",
      createdAt: ago(9),
      escalatedAt: ago(3),
      notifyCount: 2,
      lastNotifiedAt: ago(3),
    },
    {
      roomId: roomIds.get("BA-101")!,
      kind: "humidity",
      severity: "warning",
      status: "acknowledged",
      message: "Humidity is 81%, above the 70% comfort limit.",
      createdAt: ago(140),
      acknowledgedAt: ago(120),
      notifyCount: 1,
      lastNotifiedAt: ago(140),
    },
  ]);
  const [done] = await db
    .insert(alerts)
    .values({
      roomId: roomIds.get("BK-01")!,
      kind: "manual",
      severity: "warning",
      status: "resolved",
      message: "AC vent dripping onto the front row.",
      createdBy: fm!.id,
      createdAt: ago(60 * 26),
      resolvedAt: ago(60 * 22),
      resolvedBy: fm!.id,
      resolutionNote: "Maintenance cleared the drain pipe.",
      notifyCount: 1,
      lastNotifiedAt: ago(60 * 26),
    })
    .returning();
  await db.insert(actions).values([
    { roomId: roomIds.get("BK-01")!, alertId: done!.id, userId: fm!.id, note: "Maintenance cleared the drain pipe.", createdAt: ago(60 * 22) },
    { roomId: roomIds.get("BK-01")!, userId: fm!.id, note: "Raised AC setpoint from 20 °C to 22 °C after cold complaints.", createdAt: ago(60 * 5) },
  ]);

  console.log(`Seeded: ${2 + occupants.length} users, ${PROFILES.length} rooms, ${votes.length} votes, 7 days of readings.`);
  console.log(`Sign in as ${admin!.email} with DEV_ADMIN_PASSWORD from .env.`);
}

try {
  await main();
} finally {
  await sql.end();
}
