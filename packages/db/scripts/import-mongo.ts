// One-off import from the old MongoDB Atlas database used by the Streamlit site
// and the Flutter app. Run once against an empty Postgres:
//
//   LEGACY_MONGODB_URI=... pnpm db:import-mongo
//
// What it does:
// - users: imported with a random unknown password and must_change_password set.
//   The old site used passlib pbkdf2 and the old mobile backend stored plain text,
//   so neither can be carried over. An admin resets each password from /admin/users.
// - rooms: built from every room id seen in feedback, PICs, alerts and actions.
//   "bk-01" becomes building "BK", room "01", code "BK-01".
// - sensor_data: every old reading was stored as room "Unassigned", so they go to
//   one room "UNASSIGNED" in building "Imported".
// - feedback: both old shapes are read. Each vote gets the temperature and humidity
//   of the nearest reading within 15 minutes, so it can be used for training.
// - pics, alerts, actions: copied over with their room links.
import "./env";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { sql as dsql } from "drizzle-orm";
import { MongoClient, type Document } from "mongodb";
import { parseLegacyVote, type Role } from "@hitl/shared";
import { actions, alerts, buildings, createDb, feedback, pics, rooms, sensorReadings, users } from "../src/index";

const mongoUri = process.env.LEGACY_MONGODB_URI;
const mongoDbName = process.env.LEGACY_MONGODB_DB ?? "hitl_smart_building";
const pgUrl = process.env.DATABASE_URL;
if (!mongoUri) throw new Error("LEGACY_MONGODB_URI is not set");
if (!pgUrl) throw new Error("DATABASE_URL is not set");

const force = process.argv.includes("--force");
const mongo = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 10_000 });
const { db, sql } = createDb(pgUrl, { max: 2 });

function toDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === "string" && v.trim()) {
    const d = new Date(v.includes("T") || v.endsWith("Z") ? v : v.replace(" ", "T"));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapRole(raw: unknown): Role {
  const r = String(raw ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  if (r === "admin") return "admin";
  if (r === "facility_manager") return "facility_manager";
  return "occupant";
}

function splitRoomId(raw: unknown): { code: string; building: string; name: string } | null {
  const id = String(raw ?? "").trim().toUpperCase().replace(/\s+/g, "-");
  if (!id) return null;
  const dash = id.indexOf("-");
  if (dash > 0) return { code: id, building: id.slice(0, dash), name: id.slice(dash + 1) };
  return { code: id, building: "Imported", name: id };
}

async function main() {
  const existing = await db.select({ n: dsql<number>`count(*)::int` }).from(feedback);
  if ((existing[0]?.n ?? 0) > 0 && !force) {
    throw new Error("Postgres already has feedback rows. Pass --force to import anyway.");
  }

  await mongo.connect();
  const m = mongo.db(mongoDbName);
  const all = async (name: string): Promise<Document[]> => m.collection(name).find({}).toArray();

  const [mUsers, mFeedback, mPics, mAlerts, mActions, mSensor] = await Promise.all([
    all("users"),
    all("feedback"),
    all("pics"),
    all("alerts"),
    all("actions"),
    all("sensor_data"),
  ]);
  console.log(
    `Mongo: ${mUsers.length} users, ${mFeedback.length} feedback, ${mPics.length} pics, ` +
      `${mAlerts.length} alerts, ${mActions.length} actions, ${mSensor.length} readings`,
  );

  // --- users ---
  const userIdByEmail = new Map<string, string>();
  for (const u of mUsers) {
    const email = String(u.email ?? "").trim().toLowerCase();
    if (!email || userIdByEmail.has(email)) continue;
    const passwordHash = await bcrypt.hash(randomBytes(24).toString("hex"), 10);
    const [row] = await db
      .insert(users)
      .values({
        email,
        name: String(u.name ?? "").trim() || email,
        passwordHash,
        role: mapRole(u.role),
        mustChangePassword: true,
        lastActiveAt: toDate(u.last_active),
      })
      .onConflictDoUpdate({ target: users.email, set: { name: dsql`excluded.name` } })
      .returning({ id: users.id });
    if (row) userIdByEmail.set(email, row.id);
  }

  // --- buildings and rooms ---
  const roomIds = new Set<string>();
  for (const f of mFeedback) roomIds.add(String(f.room_id ?? f.roomID ?? ""));
  for (const p of mPics) roomIds.add(String(p.room ?? ""));
  for (const a of mAlerts) roomIds.add(String(a.room ?? a.room_id ?? ""));
  for (const a of mActions) roomIds.add(String(a.room ?? ""));
  roomIds.add("UNASSIGNED");

  const buildingIdByName = new Map<string, string>();
  const roomIdByCode = new Map<string, string>();
  for (const raw of roomIds) {
    const parts = splitRoomId(raw);
    if (!parts) continue;
    let buildingId = buildingIdByName.get(parts.building);
    if (!buildingId) {
      const [b] = await db
        .insert(buildings)
        .values({ name: parts.building })
        .onConflictDoUpdate({ target: buildings.name, set: { name: parts.building } })
        .returning({ id: buildings.id });
      buildingId = b!.id;
      buildingIdByName.set(parts.building, buildingId);
    }
    const [r] = await db
      .insert(rooms)
      .values({ buildingId, name: parts.name, code: parts.code })
      .onConflictDoUpdate({ target: rooms.code, set: { name: parts.name } })
      .returning({ id: rooms.id });
    roomIdByCode.set(parts.code, r!.id);
  }
  const roomFor = (raw: unknown) => {
    const parts = splitRoomId(raw);
    return parts ? roomIdByCode.get(parts.code) ?? null : null;
  };
  const unassigned = roomIdByCode.get("UNASSIGNED")!;

  // --- sensor readings ---
  const readingRows = mSensor
    .map((s) => {
      const temperatureC = num(s.temperature ?? s.temperature_c);
      const humidityPct = num(s.humidity ?? s.humidity_rh);
      const recordedAt = toDate(s.server_received_at ?? s.timestamp ?? s.ts_local);
      if (temperatureC === null || humidityPct === null || !recordedAt) return null;
      return { roomId: unassigned, temperatureC, humidityPct, pressureHpa: num(s.pressure), recordedAt };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  for (let i = 0; i < readingRows.length; i += 1000) {
    await db.insert(sensorReadings).values(readingRows.slice(i, i + 1000));
  }

  // --- feedback ---
  let skipped = 0;
  const feedbackRows = [];
  for (const f of mFeedback) {
    const roomId = roomFor(f.room_id ?? f.roomID);
    const vote = parseLegacyVote(f.temperature_feedback ?? f.temperature);
    const createdAt = toDate(f.timestamp ?? f.created_at);
    if (!roomId || !vote || !createdAt) {
      skipped++;
      continue;
    }
    const comfort = String(f.comfort_status ?? f.comfort ?? "").trim().toLowerCase();
    feedbackRows.push({
      roomId,
      vote,
      comfortable: comfort === "yes",
      comment: String(f.comments ?? f.comment ?? "").trim(),
      source: "import" as const,
      createdAt,
    });
  }
  for (let i = 0; i < feedbackRows.length; i += 1000) {
    await db.insert(feedback).values(feedbackRows.slice(i, i + 1000));
  }
  // All old readings share one sensor, so match on time only.
  await db.execute(dsql`
    update feedback f set (temperature_c, humidity_pct) = (
      select r.temperature_c, r.humidity_pct from sensor_readings r
      where r.recorded_at between f.created_at - interval '15 minutes' and f.created_at + interval '15 minutes'
      order by abs(extract(epoch from r.recorded_at - f.created_at)) limit 1
    )
    where f.source = 'import' and f.temperature_c is null
  `);

  // --- pics ---
  for (const p of mPics) {
    const roomId = roomFor(p.room);
    if (!roomId || !String(p.name ?? "").trim()) continue;
    await db
      .insert(pics)
      .values({ roomId, name: String(p.name).trim(), email: p.email || null, phone: p.phone || null })
      .onConflictDoNothing();
  }

  // --- alerts ---
  for (const a of mAlerts) {
    const resolved = a.status === "resolved";
    await db.insert(alerts).values({
      roomId: roomFor(a.room ?? a.room_id),
      kind: "manual",
      severity: "warning",
      status: resolved ? "resolved" : "open",
      message: String(a.message ?? "").trim() || "(imported alert)",
      createdBy: userIdByEmail.get(String(a.created_by ?? "").toLowerCase()) ?? null,
      resolvedAt: resolved ? toDate(a.resolved_at) ?? new Date() : null,
      resolvedBy: userIdByEmail.get(String(a.resolved_by ?? "").toLowerCase()) ?? null,
      resolutionNote: a.closure_notes || null,
      createdAt: toDate(a.created_at) ?? new Date(),
    });
  }

  // --- actions ---
  for (const a of mActions) {
    const note = [a.summary, a.recommendation, a.notes].filter((s) => String(s ?? "").trim()).join("\n\n");
    if (!note) continue;
    await db.insert(actions).values({
      roomId: roomFor(a.room),
      userId: userIdByEmail.get(String(a.created_by ?? "").toLowerCase()) ?? null,
      note,
      createdAt: toDate(a.created_at) ?? new Date(),
    });
  }

  console.log(
    `Imported ${userIdByEmail.size} users, ${roomIdByCode.size} rooms, ${readingRows.length} readings, ` +
      `${feedbackRows.length} feedback (${skipped} skipped).`,
  );
  console.log("Every imported user needs a password reset from /admin/users before they can sign in.");
}

try {
  await main();
} finally {
  await mongo.close();
  await sql.end();
}
