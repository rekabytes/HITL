import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { AuthCard } from "@/components/AuthCard";
import { currentUser } from "@/lib/auth";
import { safeNext } from "@/lib/form";
import { signupAction } from "../login/actions";

export const metadata: Metadata = { title: "Create account" };
export const dynamic = "force-dynamic";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (await currentUser()) redirect(next ?? "/app");

  return (
    <AuthCard title="Create account" sub="For building occupants. Tell facilities how your room feels in two taps.">
      <ActionForm action={signupAction} submitLabel="Create account" icon="user" block>
        {next && <input type="hidden" name="next" value={next} />}
        <label>
          Full name
          <input name="name" autoComplete="name" required maxLength={120} />
        </label>
        <label>
          Email
          <input name="email" type="email" autoComplete="email" placeholder="you@example.edu.my" required />
        </label>
        <label>
          Password
          <input name="password" type="password" autoComplete="new-password" minLength={8} required />
        </label>
        <label>
          Confirm password
          <input name="confirm" type="password" autoComplete="new-password" minLength={8} required />
        </label>
      </ActionForm>
      <p className="auth-switch">
        Already have an account? <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}>Sign in</Link>
      </p>
    </AuthCard>
  );
}
