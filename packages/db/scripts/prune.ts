// Deletes sensor readings older than READINGS_RETENTION_DAYS (default 180).
// Feedback keeps its own temperature and humidity snapshot, so training data survives this.
import "./env";
import { lt } from "drizzle-orm";
import { createDb, sensorReadings } from "../src/index";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const days = Number(process.env.READINGS_RETENTION_DAYS ?? 180);
if (!Number.isFinite(days) || days < 1) throw new Error("READINGS_RETENTION_DAYS must be a positive number");

const { db, sql } = createDb(url, { max: 1 });
const cutoff = new Date(Date.now() - days * 86_400_000);
const deleted = await db.delete(sensorReadings).where(lt(sensorReadings.recordedAt, cutoff)).returning({ id: sensorReadings.id });
await sql.end();
console.log(`Deleted ${deleted.length} readings older than ${cutoff.toISOString()}.`);
