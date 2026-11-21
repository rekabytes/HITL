import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { AuthCard } from "@/components/AuthCard";
import { adminExists, setupAction } from "../login/actions";

export const metadata: Metadata = { title: "First admin" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await adminExists()) redirect("/login");

  return (
    <AuthCard title="Create the first admin" sub="This page only works once. After this, admins add accounts from Users.">
      <ActionForm action={setupAction} submitLabel="Create admin" icon="shield" block>
        <label>
          Name
          <input name="name" required maxLength={120} />
        </label>
        <label>
          Email
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <div className="form-row">
          <label>
            Password
            <input name="password" type="password" autoComplete="new-password" minLength={8} required />
          </label>
          <label>
            Confirm
            <input name="confirm" type="password" autoComplete="new-password" minLength={8} required />
          </label>
        </div>
      </ActionForm>
    </AuthCard>
  );
}
