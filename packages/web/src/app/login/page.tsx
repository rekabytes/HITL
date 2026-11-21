import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { AuthCard } from "@/components/AuthCard";
import { Icon } from "@/components/Icon";
import { currentUser } from "@/lib/auth";
import { adminExists, loginAction } from "./actions";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await currentUser()) redirect("/");
  const firstRun = !(await adminExists());

  return (
    <AuthCard title="Sign in" sub="For admins and facility managers.">
      {firstRun ? (
        <div className="notice">
          <Icon name="info" size={16} />
          <span>
            No admin account yet. <Link href="/setup">Create the first admin</Link>.
          </span>
        </div>
      ) : (
        <ActionForm action={loginAction} submitLabel="Sign in" icon="log-in" block>
          <label>
            Email
            <input name="email" type="email" autoComplete="username" placeholder="you@example.edu.my" required />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
        </ActionForm>
      )}
    </AuthCard>
  );
}
