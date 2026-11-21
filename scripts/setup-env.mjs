#!/usr/bin/env node
// Creates .env from .env.example and replaces every "change-me" with a random secret.
// Postgres password is written into DATABASE_URL as well so the two stay in sync.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, ".env");

if (existsSync(target) && !process.argv.includes("--force")) {
  console.log(".env already exists. Pass --force to overwrite it.");
  process.exit(0);
}

const secret = () => randomBytes(32).toString("hex");
const pgPassword = secret();

const out = readFileSync(join(root, ".env.example"), "utf8")
  .split("\n")
  .map((line) => {
    if (line.startsWith("POSTGRES_PASSWORD=")) return `POSTGRES_PASSWORD=${pgPassword}`;
    if (line.startsWith("DATABASE_URL=")) return line.replace("change-me", pgPassword);
    return line.replace("=change-me", `=${secret()}`);
  })
  .join("\n");

writeFileSync(target, out, { mode: 0o600 });
console.log("Wrote .env with fresh secrets.");
