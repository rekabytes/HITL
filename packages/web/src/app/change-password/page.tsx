import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { users } from "@hitl/db";
import { passwordSchema } from "@hitl/shared";
import { ActionForm } from "@/components/ActionForm";
import { destroyUserSessions, hashPassword, requireUser, secretHash, sessionToken, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import type { FormState } from "@/lib/form";

export const metadata: Metadata = { title: "Change password" };
export const dynamic = "force-dynamic";

async function changePassword(_prev: FormState, form: FormData): Promise<FormState> {
  "use server";
  const user = await requireUser(undefined, { allowPasswordChange: true });
  const current = String(form.get("current") ?? "");
  const next = passwordSchema.safeParse(form.get("password"));
  if (!next.success) return { error: next.error.issues[0]?.message };
  if (form.get("password") !== form.get("confirm")) return { error: "New passwords do not match." };

  const [row] = await db().select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!row || !(await verifyPassword(current, row.passwordHash))) return { error: "Current password is wrong." };

  await db()
    .update(users)
    .set({ passwordHash: await hashPassword(next.data), mustChangePassword: false })
    .where(eq(users.id, user.id));
  const token = await sessionToken();
  await destroyUserSessions(user.id, token ? secretHash(token) : undefined);
  redirect("/");
}

export default async function ChangePasswordPage() {
  const user = await requireUser(undefined, { allowPasswordChange: true });
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div>
          <h1>Change password</h1>
          <p className="sub">
            {user.mustChangePassword
              ? "An admin set a temporary password for you. Pick your own to continue."
              : `Signed in as ${user.email}.`}
          </p>
        </div>
        <ActionForm action={changePassword} submitLabel="Save password">
          <label>
            Current password
            <input name="current" type="password" autoComplete="current-password" required />
          </label>
          <label>
            New password
            <input name="password" type="password" autoComplete="new-password" minLength={8} required />
          </label>
          <label>
            Confirm new password
            <input name="confirm" type="password" autoComplete="new-password" minLength={8} required />
          </label>
        </ActionForm>
        {!user.mustChangePassword && (
          <a href="/" className="link-muted">
            Back
          </a>
        )}
      </div>
    </div>
  );
}
