// Deletes sensor and CO2 readings older than READINGS_RETENTION_DAYS (default 180).
// Feedback keeps its own temperature and humidity snapshot, so training data survives this.
import "./env";
import { lt } from "drizzle-orm";
import { co2Readings, createDb, sensorReadings } from "../src/index";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const days = Number(process.env.READINGS_RETENTION_DAYS ?? 180);
if (!Number.isFinite(days) || days < 1) throw new Error("READINGS_RETENTION_DAYS must be a positive number");

const { db, sql } = createDb(url, { max: 1 });
const cutoff = new Date(Date.now() - days * 86_400_000);
const deleted = await db.delete(sensorReadings).where(lt(sensorReadings.recordedAt, cutoff)).returning({ id: sensorReadings.id });
const deletedCo2 = await db.delete(co2Readings).where(lt(co2Readings.recordedAt, cutoff)).returning({ id: co2Readings.id });
await sql.end();
console.log(`Deleted ${deleted.length} readings and ${deletedCo2.length} CO2 readings older than ${cutoff.toISOString()}.`);
