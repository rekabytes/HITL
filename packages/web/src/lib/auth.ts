import { createHmac, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt, ne } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sessions, users } from "@hitl/db";
import { STAFF_ROLES, type Role } from "@hitl/shared";
import { db } from "./db";
import { env } from "./env";
import { cached, redis, rkey } from "./redis";

export const SESSION_COOKIE = "hitl_session";
const SESSION_TTL_MS = { web: 7 * 86_400_000, mobile: 30 * 86_400_000 } as const;
/** Short so a deactivated user or a logout takes effect within a minute everywhere. */
const SESSION_CACHE_SEC = 60;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  mustChangePassword: boolean;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** HMAC with the app secret, used for session tokens and device keys. */
export function secretHash(value: string): string {
  return createHmac("sha256", env.authSecret).update(value).digest("hex");
}

export async function createSession(userId: string, kind: "web" | "mobile") {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS[kind]);
  await db().insert(sessions).values({ userId, tokenHash: secretHash(token), kind, expiresAt });
  await db().update(users).set({ lastActiveAt: new Date() }).where(eq(users.id, userId));
  return { token, expiresAt };
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && env.appUrl.startsWith("https://"),
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(token: string) {
  const h = secretHash(token);
  await db().delete(sessions).where(eq(sessions.tokenHash, h));
  await cached(() => redis().del(rkey.session(h)), 0);
}

/** Ends every session of a user, for example after a password change or deactivation. */
export async function destroyUserSessions(userId: string, keepTokenHash?: string) {
  const where = keepTokenHash
    ? and(eq(sessions.userId, userId), ne(sessions.tokenHash, keepTokenHash))
    : eq(sessions.userId, userId);
  const rows = await db().delete(sessions).where(where).returning({ h: sessions.tokenHash });
  // The kept session stays valid but its cached copy may hold stale flags (role, must-change-password).
  const drop = [...rows.map((r) => r.h), ...(keepTokenHash ? [keepTokenHash] : [])];
  if (drop.length) await cached(() => redis().del(...drop.map(rkey.session)), 0);
}

async function userForToken(token: string): Promise<SessionUser | null> {
  const h = secretHash(token);
  const hit = await cached(() => redis().get(rkey.session(h)), null);
  if (hit) return JSON.parse(hit) as SessionUser;

  const [row] = await db()
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      mustChangePassword: users.mustChangePassword,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, h), gt(sessions.expiresAt, new Date()), eq(users.active, true)))
    .limit(1);
  if (!row) return null;
  await cached(() => redis().set(rkey.session(h), JSON.stringify(row), "EX", SESSION_CACHE_SEC), null);
  return row;
}

export async function sessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

/** The signed-in web user, or null. */
export async function currentUser(): Promise<SessionUser | null> {
  const token = await sessionToken();
  return token ? userForToken(token) : null;
}

/**
 * For pages and server actions. Sends the visitor to /login when signed out,
 * to /change-password when an admin reset their password, and home when their
 * role is not allowed here.
 */
export async function requireUser(roles?: readonly Role[], opts: { allowPasswordChange?: boolean } = {}) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword && !opts.allowPasswordChange) redirect("/change-password");
  if (roles && !roles.includes(user.role)) redirect("/");
  return user;
}

export const requireStaff = () => requireUser(STAFF_ROLES);
export const requireAdmin = () => requireUser(["admin"]);

/** For route handlers: accepts `Authorization: Bearer <token>` (mobile) or the session cookie (web). */
export async function apiUser(req: Request): Promise<SessionUser | null> {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return userForToken(auth.slice(7).trim());
  const token = await sessionToken();
  return token ? userForToken(token) : null;
}

export function isStaff(user: SessionUser | null): user is SessionUser {
  return !!user && STAFF_ROLES.includes(user.role);
}
