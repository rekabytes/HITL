CREATE TABLE "sensor_rooms" (
	"sensor_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	CONSTRAINT "sensor_rooms_sensor_id_room_id_pk" PRIMARY KEY("sensor_id","room_id")
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "notify_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "last_notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "escalated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sensors" ADD COLUMN "firmware_version" text;--> statement-breakpoint
ALTER TABLE "sensor_rooms" ADD CONSTRAINT "sensor_rooms_sensor_id_sensors_id_fk" FOREIGN KEY ("sensor_id") REFERENCES "public"."sensors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sensor_rooms" ADD CONSTRAINT "sensor_rooms_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sensor_rooms_room_idx" ON "sensor_rooms" USING btree ("room_id");