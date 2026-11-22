import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { ALERT_KINDS, ALERT_SEVERITIES, ALERT_STATUSES, CO2_STATES, ROLES, THERMAL_VOTES } from "@hitl/shared";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const roleEnum = pgEnum("role", ROLES);
export const thermalVoteEnum = pgEnum("thermal_vote", THERMAL_VOTES);
export const alertKindEnum = pgEnum("alert_kind", ALERT_KINDS);
export const alertSeverityEnum = pgEnum("alert_severity", ALERT_SEVERITIES);
export const alertStatusEnum = pgEnum("alert_status", ALERT_STATUSES);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull(),
  active: boolean("active").notNull().default(true),
  /** Set when an admin resets a password; the user must pick a new one at next login. */
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    /** "web" sessions live in a cookie, "mobile" ones are bearer tokens. */
    kind: text("kind", { enum: ["web", "mobile"] }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const buildings = pgTable("buildings", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  address: text("address"),
  createdAt: createdAt(),
});

export const rooms = pgTable(
  "rooms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    buildingId: uuid("building_id")
      .notNull()
      .references(() => buildings.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    /** Value printed in the room's QR code, for example "L21". */
    code: text("code").notNull().unique(),
    floor: text("floor"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("rooms_building_name_idx").on(t.buildingId, t.name)],
);

export const sensors = pgTable("sensors", {
  id: uuid("id").primaryKey().defaultRandom(),
  deviceId: text("device_id").notNull().unique(),
  /** HMAC of the device key. The plain key is shown once when it is created. */
  keyHash: text("key_hash").notNull().unique(),
  label: text("label"),
  firmwareVersion: text("firmware_version"),
  active: boolean("active").notNull().default(true),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
  sensorResponding: boolean("sensor_responding"),
  lastRealReadingAt: timestamp("last_real_reading_at", { withTimezone: true }),
  /** CO2 state in the most recent report. Null if that report omitted CO2. */
  co2State: text("co2_state", { enum: CO2_STATES }),
  lastCo2ReadingAt: timestamp("last_co2_reading_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/**
 * Which rooms a sensor reports for. Usually one; a sensor in a shared space
 * (for example between two adjoining rooms) can cover several. Each reading
 * is stored once per room so room queries stay simple.
 */
export const sensorRooms = pgTable(
  "sensor_rooms",
  {
    sensorId: uuid("sensor_id")
      .notNull()
      .references(() => sensors.id, { onDelete: "cascade" }),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.sensorId, t.roomId] }), index("sensor_rooms_room_idx").on(t.roomId)],
);

export const sensorReadings = pgTable(
  "sensor_readings",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    sensorId: uuid("sensor_id").references(() => sensors.id, { onDelete: "set null" }),
    roomId: uuid("room_id").references(() => rooms.id, { onDelete: "cascade" }),
    temperatureC: real("temperature_c").notNull(),
    humidityPct: real("humidity_pct").notNull(),
    pressureHpa: real("pressure_hpa"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("readings_room_time_idx").on(t.roomId, t.recordedAt.desc()),
    index("readings_time_idx").on(t.recordedAt),
  ],
);

/**
 * CO2 readings, kept apart from sensor_readings so a working CO2 sensor is
 * still recorded while the BME280 on the same board is failing (and the
 * other way round). Stored once per room the sensor covers, like readings.
 */
export const co2Readings = pgTable(
  "co2_readings",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    sensorId: uuid("sensor_id").references(() => sensors.id, { onDelete: "set null" }),
    roomId: uuid("room_id").references(() => rooms.id, { onDelete: "cascade" }),
    co2Ppm: integer("co2_ppm").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("co2_readings_room_time_idx").on(t.roomId, t.recordedAt.desc()),
    index("co2_readings_time_idx").on(t.recordedAt),
  ],
);

export const feedback = pgTable(
  "feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    vote: thermalVoteEnum("vote").notNull(),
    comfortable: boolean("comfortable").notNull(),
    comment: text("comment").notNull().default(""),
    /** Room conditions when the vote was cast. This pairing is the ML training data. */
    temperatureC: real("temperature_c"),
    humidityPct: real("humidity_pct"),
    source: text("source", { enum: ["mobile", "web", "import"] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("feedback_room_time_idx").on(t.roomId, t.createdAt.desc())],
);

/** Person in charge of a room (one per room). */
export const pics = pgTable("pics", {
  id: uuid("id").primaryKey().defaultRandom(),
  roomId: uuid("room_id")
    .notNull()
    .unique()
    .references(() => rooms.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  createdAt: createdAt(),
});

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id").references(() => rooms.id, { onDelete: "cascade" }),
    kind: alertKindEnum("kind").notNull(),
    severity: alertSeverityEnum("severity").notNull(),
    status: alertStatusEnum("status").notNull().default("open"),
    message: text("message").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolutionNote: text("resolution_note"),
    /** Emails sent to the room's person in charge for this alert. */
    notifyCount: integer("notify_count").notNull().default(0),
    lastNotifiedAt: timestamp("last_notified_at", { withTimezone: true }),
    /** Set when an alert stayed open (not acknowledged) too long and was escalated. */
    escalatedAt: timestamp("escalated_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("alerts_status_idx").on(t.status, t.createdAt.desc()),
    // At most one unresolved alert per room and kind, so automatic checks never pile up duplicates.
    uniqueIndex("alerts_one_open_per_room_kind")
      .on(t.roomId, t.kind)
      .where(sql`${t.status} <> 'resolved' and ${t.kind} <> 'manual'`),
  ],
);

/** What a facility manager did about a room or an alert. */
export const actions = pgTable(
  "actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id").references(() => rooms.id, { onDelete: "cascade" }),
    alertId: uuid("alert_id").references(() => alerts.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    note: text("note").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("actions_room_idx").on(t.roomId, t.createdAt.desc())],
);

export const modelRuns = pgTable("model_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  status: text("status", { enum: ["running", "succeeded", "failed", "skipped"] }).notNull(),
  algorithm: text("algorithm"),
  trainingRows: integer("training_rows").notNull().default(0),
  metrics: jsonb("metrics").$type<Record<string, unknown>>(),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

/**
 * AI-written notes about a room: a summary of how it has been, and suggestions
 * staff can accept or dismiss. `source` says where the text came from, so demo
 * text is never mistaken for real analysis.
 */
export const aiInsights = pgTable(
  "ai_insights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["summary", "suggestion"] }).notNull(),
    priority: text("priority", { enum: ["low", "medium", "high"] }).notNull().default("low"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    /** Suggestions move from open to accepted or dismissed; summaries stay open. */
    status: text("status", { enum: ["open", "accepted", "dismissed"] }).notNull().default("open"),
    source: text("source", { enum: ["demo", "model", "llm"] }).notNull(),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("ai_insights_room_idx").on(t.roomId, t.createdAt.desc())],
);

export type User = typeof users.$inferSelect;
export type Room = typeof rooms.$inferSelect;
export type Building = typeof buildings.$inferSelect;
export type Sensor = typeof sensors.$inferSelect;
export type SensorReading = typeof sensorReadings.$inferSelect;
export type Co2Reading = typeof co2Readings.$inferSelect;
export type Feedback = typeof feedback.$inferSelect;
export type Alert = typeof alerts.$inferSelect;
export type Pic = typeof pics.$inferSelect;
export type ModelRun = typeof modelRuns.$inferSelect;
export type AiInsight = typeof aiInsights.$inferSelect;
