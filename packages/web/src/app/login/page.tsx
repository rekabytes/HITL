import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { AuthCard } from "@/components/AuthCard";
import { Icon } from "@/components/Icon";
import { currentUser } from "@/lib/auth";
import { safeNext } from "@/lib/form";
import { adminExists, loginAction } from "./actions";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (await currentUser()) redirect(next ?? "/");
  const firstRun = !(await adminExists());
  const fromScan = next?.startsWith("/r/");

  return (
    <AuthCard
      title="Sign in"
      sub={fromScan ? "Sign in to tell us how this room feels." : "Occupants, facility managers and admins."}
    >
      {firstRun ? (
        <div className="notice">
          <Icon name="info" size={16} />
          <span>
            No admin account yet. <Link href="/setup">Create the first admin</Link>.
          </span>
        </div>
      ) : (
        <>
          <ActionForm action={loginAction} submitLabel="Sign in" icon="log-in" block>
            {next && <input type="hidden" name="next" value={next} />}
            <label>
              Email
              <input name="email" type="email" autoComplete="username" placeholder="you@example.edu.my" required />
            </label>
            <label>
              Password
              <input name="password" type="password" autoComplete="current-password" required />
            </label>
          </ActionForm>
          <p className="auth-switch">
            New here? <Link href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}>Create an occupant account</Link>
          </p>
        </>
      )}
    </AuthCard>
  );
}
