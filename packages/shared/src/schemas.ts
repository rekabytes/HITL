import { z } from "zod";

export const ROLES = ["admin", "facility_manager", "occupant"] as const;
export type Role = (typeof ROLES)[number];
export const STAFF_ROLES: readonly Role[] = ["admin", "facility_manager"];

export const THERMAL_VOTES = ["too_cold", "perfect", "too_hot"] as const;
export type ThermalVote = (typeof THERMAL_VOTES)[number];

export const THERMAL_VOTE_LABELS: Record<ThermalVote, string> = {
  too_cold: "Too cold",
  perfect: "Perfect",
  too_hot: "Too hot",
};

export const ALERT_KINDS = ["temperature", "humidity", "feedback", "sensor_offline", "manual", "co2"] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

export const ALERT_SEVERITIES = ["info", "warning", "critical"] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export const ALERT_STATUSES = ["open", "acknowledged", "resolved"] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

/** Room codes are what the QR codes on the door hold, e.g. "L21". */
export const roomCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[A-Za-z0-9_-]+$/, "Use letters, numbers, - or _")
  .transform((s) => s.toUpperCase());

/** Body the ESP32 posts to /api/sensor. Field names match the old firmware. */
export const sensorReadingInput = z.object({
  temperature: z.number().min(-20).max(70),
  humidity: z.number().min(0).max(100),
  pressure: z.number().min(300).max(1200).nullish(),
});
export type SensorReadingInput = z.infer<typeof sensorReadingInput>;

/**
 * CO2 sensor check, sent next to the BME280 status by boards that have a CO2
 * sensor (NDIR, for example the SC8-CO2-5K). Boards without one leave it out.
 * "warming_up": the sensor answers but is inside its preheat time, so the
 * value is not trustworthy yet and is not sent.
 */
export const CO2_STATES = ["online", "warming_up", "offline"] as const;
export type Co2State = (typeof CO2_STATES)[number];
export const co2ReportInput = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("online"), ppm: z.number().int().min(1).max(5000) }),
  z.strictObject({ status: z.literal("warming_up") }),
  z.strictObject({ status: z.literal("offline") }),
]);
export type Co2ReportInput = z.infer<typeof co2ReportInput>;

// An online report must carry a real reading; an offline report cannot carry one.
// The CO2 check is independent of the BME280: either can work while the other fails.
export const sensorReportInput = z.union([
  z.discriminatedUnion("sensorStatus", [
    z.strictObject({ sensorStatus: z.literal("online"), firmwareVersion: z.string().min(1).max(64), reading: sensorReadingInput.extend({ pressure: z.number().min(300).max(1200) }).strict(), co2: co2ReportInput.optional() }),
    z.strictObject({ sensorStatus: z.literal("offline"), firmwareVersion: z.string().min(1).max(64), co2: co2ReportInput.optional() }),
  ]),
  sensorReadingInput.strict(),
]);

/** Body the mobile app (or the web form) posts to /api/feedback. */
export const feedbackInput = z.object({
  roomCode: roomCodeSchema,
  vote: z.enum(THERMAL_VOTES),
  comfortable: z.boolean(),
  comment: z.string().trim().max(1000).optional().default(""),
  /**
   * When the vote was cast, for votes queued offline and sent later. The server
   * pairs the vote with the room conditions at this time instead of now.
   */
  votedAt: z.iso.datetime({ offset: true }).optional(),
});
export type FeedbackInput = z.infer<typeof feedbackInput>;

export const loginInput = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1).max(200),
});

export const passwordSchema = z.string().min(8, "At least 8 characters").max(200);

export const registerInput = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.email().trim().toLowerCase(),
  password: passwordSchema,
});
