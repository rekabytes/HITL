import { config } from "dotenv";

// drizzle-kit runs from packages/db; the .env lives at the repo root.
config({ path: "../../.env", quiet: true });
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://hitl:hitl@localhost:5432/hitl",
  },
  strict: true,
});
