-- Keep every existing assignment before the old column goes away.
INSERT INTO "sensor_rooms" ("sensor_id", "room_id")
SELECT "id", "room_id" FROM "sensors" WHERE "room_id" IS NOT NULL
ON CONFLICT DO NOTHING;--> statement-breakpoint
ALTER TABLE "sensors" DROP CONSTRAINT "sensors_room_id_rooms_id_fk";
--> statement-breakpoint
ALTER TABLE "sensors" DROP COLUMN "room_id";
