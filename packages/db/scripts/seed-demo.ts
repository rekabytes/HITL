// Fills an empty dev database with a week of believable demo data so every
// page has something to show. Never run against production.
//
//   DEV_ADMIN_EMAIL=... DEV_ADMIN_PASSWORD=... pnpm db:seed-demo
//
// Matches the real deployment: URSB Building, one large room on level 21,
// two ESP32 + BME280 sensors in it. Creates an admin and a facility manager
// (both use DEV_ADMIN_PASSWORD), five occupants, 7 days of 5-minute readings
// from each sensor, occupant votes paired with conditions, a PIC, alerts,
// demo AI insights (summary and suggestions) and past model training runs.
// Insight text is marked source "demo" so the portal labels it as demo data.
import "./env";
import { createHmac, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { sql as dsql } from "drizzle-orm";
import { actions, aiInsights, alerts, buildings, createDb, feedback, modelRuns, pics, rooms, sensorReadings, sensorRooms, sensors, users } from "../src/index";

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

const BUILDING = "URSB Building";
const ROOM = { code: "L21", name: "Level 21", floor: "21" };

/**
 * The room is large, so the two sensors see slightly different conditions:
 * sensor B sits on the side that warms up more in the afternoon.
 */
const SENSORS = [
  { deviceId: "esp32-l21-a", label: "BME280, sensor A", offsetC: 0, afternoonC: 1.4, offsetRh: 0 },
  { deviceId: "esp32-l21-b", label: "BME280, sensor B", offsetC: 0.4, afternoonC: 2.6, offsetRh: -2 },
] as const;
const OCCUPIED_C = 23.4;
const HUMIDITY = 60;

function conditions(s: (typeof SENSORS)[number], t: Date) {
  const h = myHour(t) + t.getUTCMinutes() / 60;
  const occupied = isWeekday(t) && h >= 8 && h < 18;
  let temp: number;
  if (occupied) {
    const afternoon = Math.max(0, Math.sin(((h - 11) / 7) * Math.PI)) * s.afternoonC;
    temp = OCCUPIED_C + s.offsetC + afternoon;
  } else {
    temp = 28.5 + Math.sin(((h - 9) / 24) * 2 * Math.PI) * 1.2; // AC off, tropical day and night drift
  }
  const hum = (occupied ? HUMIDITY : HUMIDITY + 12) + s.offsetRh;
  return { temp: temp + noise(0.25), hum: Math.min(95, hum + noise(2.5)), occupied };
}

/** What an occupant feels: the average of both sides of the room. */
function roomConditions(t: Date) {
  const a = conditions(SENSORS[0], t);
  const b = conditions(SENSORS[1], t);
  return { temp: (a.temp + b.temp) / 2, hum: (a.hum + b.hum) / 2, occupied: a.occupied };
}

/** How a typical occupant here votes at a given temperature. */
function vote(temp: number, hum: number): "too_cold" | "perfect" | "too_hot" {
  const feelsLike = temp + Math.max(0, hum - 70) * 0.06 + noise(0.5);
  if (feelsLike < 23.2) return "too_cold";
  if (feelsLike > 25.8) return "too_hot";
  return "perfect";
}

const COMMENTS: Record<string, string[]> = {
  too_cold: ["Freezing near the vents", "AC is way too strong this morning", "Too cold to focus", ""],
  perfect: ["Comfortable", "Nice today", "", "", "Good"],
  too_hot: ["Very stuffy after lunch", "Too warm, sweating", "Afternoon sun makes it hot on this side", "Air feels sticky", ""],
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

  const [building] = await db.insert(buildings).values({ name: BUILDING }).returning();
  const [room] = await db.insert(rooms).values({ buildingId: building!.id, ...ROOM }).returning();
  const roomId = room!.id;

  const sensorIds: string[] = [];
  for (const s of SENSORS) {
    const key = `hitl_${randomBytes(24).toString("base64url")}`;
    const [row] = await db
      .insert(sensors)
      .values({
        deviceId: s.deviceId,
        label: s.label,
        firmwareVersion: "v2.4.11",
        keyHash: createHmac("sha256", secret!).update(key).digest("hex"),
        lastSeenAt: new Date(),
      })
      .returning();
    await db.insert(sensorRooms).values({ sensorId: row!.id, roomId });
    sensorIds.push(row!.id);
    console.log(`Device key for ${s.deviceId} (to post live readings): ${key}`);
  }

  // --- readings: every 5 minutes for 7 days, from each sensor ---
  const now = Date.now();
  const start = now - 7 * 86_400_000;
  const step = 5 * 60_000;
  for (const [i, s] of SENSORS.entries()) {
    const rows = [];
    // Sensor B reports a minute after A, as two independent devices would.
    for (let t = start + i * 60_000; t <= now; t += step) {
      const d = new Date(t);
      const c = conditions(s, d);
      rows.push({
        roomId,
        sensorId: sensorIds[i]!,
        temperatureC: +c.temp.toFixed(2),
        humidityPct: +c.hum.toFixed(1),
        pressureHpa: +(1006 + noise(2)).toFixed(1),
        recordedAt: d,
      });
    }
    for (let j = 0; j < rows.length; j += 1000) await db.insert(sensorReadings).values(rows.slice(j, j + 1000));
  }

  // --- votes: occupied hours, a few an hour ---
  const votes = [];
  for (let t = start; t <= now; t += 12 * 60_000) {
    const d = new Date(t + noise(5 * 60_000));
    const c = roomConditions(d);
    if (!c.occupied || rand() > 0.45) continue;
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
  // A burst of "too hot" right now, so the dashboard shows a live problem.
  for (let i = 0; i < 4; i++) {
    votes.push({
      roomId,
      userId: occupants[i]!.id,
      vote: "too_hot" as const,
      comfortable: false,
      comment: ["Too warm, sweating", "Very stuffy", "", "Please lower the AC"][i]!,
      temperatureC: 26.9,
      humidityPct: 61,
      source: "mobile" as const,
      createdAt: new Date(now - (25 - i * 6) * 60_000),
    });
  }
  await db.insert(feedback).values(votes);

  // Latest readings: a warm afternoon on level 21.
  await db.insert(sensorReadings).values([
    { roomId, sensorId: sensorIds[0]!, temperatureC: 26.5, humidityPct: 62, pressureHpa: 1006.2, recordedAt: new Date(now - 60_000) },
    { roomId, sensorId: sensorIds[1]!, temperatureC: 27.2, humidityPct: 60, pressureHpa: 1006.1, recordedAt: new Date() },
  ]);

  // --- PIC ---
  await db.insert(pics).values({ roomId, name: "Encik Faizal", email: "faizal@hitl.test", phone: "+60123456789" });

  // --- alerts ---
  const ago = (min: number) => new Date(now - min * 60_000);
  await db.insert(alerts).values({
    roomId,
    kind: "feedback",
    severity: "critical",
    message: "4 of 4 occupants said the room is too hot in the last 30 minutes.",
    createdAt: ago(9),
    escalatedAt: ago(3),
    notifyCount: 2,
    lastNotifiedAt: ago(3),
  });
  const [done] = await db
    .insert(alerts)
    .values({
      roomId,
      kind: "manual",
      severity: "warning",
      status: "resolved",
      message: "AC vent dripping near the pantry.",
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
    { roomId, alertId: done!.id, userId: fm!.id, note: "Maintenance cleared the drain pipe.", createdAt: ago(60 * 22) },
    { roomId, userId: fm!.id, note: "Raised AC setpoint from 21 °C to 23 °C after cold complaints in the morning.", createdAt: ago(60 * 5) },
  ]);

  // --- past model training runs (dummy results; a real retrain adds a new row) ---
  const day = (d: number, hour = 9) => new Date(now - d * 86_400_000 - (myHour(new Date(now)) - hour) * 3_600_000);
  await db.insert(modelRuns).values([
    {
      status: "skipped",
      trainingRows: 18,
      metrics: { class_counts: { too_cold: 4, perfect: 11, too_hot: 3 } },
      error: "Need at least 30 labelled votes, have 18.",
      startedAt: day(6),
      finishedAt: day(6),
    },
    {
      status: "succeeded",
      algorithm: "random_forest",
      trainingRows: 54,
      metrics: { accuracy: 0.7273, f1_macro: 0.6818, holdout_rows: 11, class_counts: { too_cold: 12, perfect: 29, too_hot: 13 } },
      startedAt: day(4),
      finishedAt: day(4),
    },
    {
      status: "succeeded",
      algorithm: "random_forest",
      trainingRows: 96,
      metrics: { accuracy: 0.7368, f1_macro: 0.6984, holdout_rows: 19, class_counts: { too_cold: 21, perfect: 48, too_hot: 27 } },
      startedAt: day(2),
      finishedAt: day(2),
    },
  ]);

  // --- AI insights (demo text, labelled as such in the portal) ---
  const tooHotAfternoon = votes.filter((v) => v.vote === "too_hot" && myHour(v.createdAt) >= 14).length;
  const tooHotAll = votes.filter((v) => v.vote === "too_hot").length;
  const tooColdMorning = votes.filter((v) => v.vote === "too_cold" && myHour(v.createdAt) < 10).length;
  const tooColdAll = votes.filter((v) => v.vote === "too_cold").length;
  const perfectShare = Math.round((votes.filter((v) => v.vote === "perfect").length / votes.length) * 100);
  await db.insert(aiInsights).values([
    {
      roomId,
      kind: "summary",
      title: "Level 21 this week",
      body: [
        `Afternoons run 2 to 3 °C warmer on the sensor B side than on sensor A, peaking around 15:00.`,
        `${tooHotAfternoon} of ${tooHotAll} "too hot" votes came after 14:00, and ${tooColdMorning} of ${tooColdAll} "too cold" votes came before 10:00.`,
        `Overall ${perfectShare}% of votes said perfect. Right now 4 of 4 recent votes say too hot.`,
      ].join("\n"),
      source: "demo",
      createdAt: ago(20),
    },
    {
      roomId,
      kind: "suggestion",
      priority: "high",
      title: "Lower the setpoint to 23 °C from 14:00 on weekdays",
      body: "Most too-hot votes land between 14:00 and 17:00, when sensor B passes 26 °C. A lower afternoon setpoint should bring that side back into the comfort band.",
      source: "demo",
      createdAt: ago(20),
    },
    {
      roomId,
      kind: "suggestion",
      priority: "medium",
      title: "Close the blinds on the sensor B side after lunch",
      body: "Sensor B warms about twice as fast as sensor A in the afternoon, which points to sun through the windows on that side rather than the AC.",
      source: "demo",
      createdAt: ago(20),
    },
    {
      roomId,
      kind: "suggestion",
      priority: "low",
      title: "Start the morning at 24 °C instead of 23 °C",
      body: "Too-cold votes cluster before 10:00 while the room sits near 23.4 °C. Starting one degree warmer should cut those and save some cooling energy.",
      source: "demo",
      createdAt: ago(20),
    },
    {
      roomId,
      kind: "suggestion",
      priority: "medium",
      title: "Check the AC drain near the pantry",
      body: "A dripping vent was reported there. Humidity on that side ran a little higher the same day.",
      status: "accepted",
      source: "demo",
      decidedBy: fm!.id,
      decidedAt: ago(60 * 25),
      createdAt: ago(60 * 27),
    },
    {
      roomId,
      kind: "suggestion",
      priority: "low",
      title: "Move sensor A away from the supply vent",
      body: "Sensor A sometimes reads colder than the votes suggest, which can happen when cold air blows straight onto it.",
      status: "dismissed",
      source: "demo",
      decidedBy: fm!.id,
      decidedAt: ago(60 * 30),
      createdAt: ago(60 * 48),
    },
  ]);
  await db.insert(actions).values({
    roomId,
    userId: fm!.id,
    note: "Accepted AI suggestion: Check the AC drain near the pantry",
    createdAt: ago(60 * 25),
  });

  console.log(`Seeded: ${2 + occupants.length} users, ${BUILDING} ${ROOM.name} with ${SENSORS.length} sensors, ${votes.length} votes, 7 days of readings.`);
  console.log(`Sign in as ${admin!.email} with DEV_ADMIN_PASSWORD from .env.`);
}

try {
  await main();
} finally {
  await sql.end();
}
