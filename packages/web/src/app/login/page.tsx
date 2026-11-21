import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { currentUser } from "@/lib/auth";
import { adminExists, loginAction } from "./actions";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await currentUser()) redirect("/");
  const firstRun = !(await adminExists());

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div>
          <h1>Sign in</h1>
          <p className="sub">HITL Smart Building portal for admins and facility managers.</p>
        </div>
        {firstRun ? (
          <p className="msg">
            No admin account yet. <Link href="/setup">Create the first admin</Link>.
          </p>
        ) : (
          <ActionForm action={loginAction} submitLabel="Sign in">
            <label>
              Email
              <input name="email" type="email" autoComplete="username" required />
            </label>
            <label>
              Password
              <input name="password" type="password" autoComplete="current-password" required />
            </label>
          </ActionForm>
        )}
      </div>
    </div>
  );
}
