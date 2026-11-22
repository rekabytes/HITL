ALTER TABLE "sensors" ADD COLUMN "last_heartbeat_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sensors" ADD COLUMN "sensor_responding" boolean;--> statement-breakpoint
ALTER TABLE "sensors" ADD COLUMN "last_real_reading_at" timestamp with time zone;