ALTER TYPE "public"."alert_kind" ADD VALUE 'co2';--> statement-breakpoint
CREATE TABLE "co2_readings" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "co2_readings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"sensor_id" uuid,
	"room_id" uuid,
	"co2_ppm" integer NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sensors" ADD COLUMN "co2_state" text;--> statement-breakpoint
ALTER TABLE "sensors" ADD COLUMN "last_co2_reading_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "co2_readings" ADD CONSTRAINT "co2_readings_sensor_id_sensors_id_fk" FOREIGN KEY ("sensor_id") REFERENCES "public"."sensors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "co2_readings" ADD CONSTRAINT "co2_readings_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "co2_readings_room_time_idx" ON "co2_readings" USING btree ("room_id","recorded_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "co2_readings_time_idx" ON "co2_readings" USING btree ("recorded_at");