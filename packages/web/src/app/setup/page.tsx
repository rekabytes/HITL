import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { adminExists, setupAction } from "../login/actions";

export const metadata: Metadata = { title: "First admin" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await adminExists()) redirect("/login");

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div>
          <h1>Create the first admin</h1>
          <p className="sub">This page only works once. After this, admins add accounts from Users.</p>
        </div>
        <ActionForm action={setupAction} submitLabel="Create admin">
          <label>
            Name
            <input name="name" required maxLength={120} />
          </label>
          <label>
            Email
            <input name="email" type="email" autoComplete="username" required />
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
      </div>
    </div>
  );
}
