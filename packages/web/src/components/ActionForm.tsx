"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { initialFormState, type FormState } from "@/lib/form";

type Action = (prev: FormState, form: FormData) => Promise<FormState>;

export function SubmitButton({ children, variant = "primary" }: { children: ReactNode; variant?: "primary" | "ghost" | "danger" }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`btn btn-${variant}`} disabled={pending}>
      {pending ? "Working…" : children}
    </button>
  );
}

/**
 * A form bound to a server action. Children are the fields (they can be
 * server-rendered); errors, success text and one-time secrets show under it.
 */
export function ActionForm({
  action,
  submitLabel,
  variant,
  className = "form",
  children,
}: {
  action: Action;
  submitLabel: string;
  variant?: "primary" | "ghost" | "danger";
  className?: string;
  children?: ReactNode;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className={className}>
      {children}
      <SubmitButton variant={variant}>{submitLabel}</SubmitButton>
      {state.error && <p className="msg msg-error" role="alert">{state.error}</p>}
      {state.ok && <p className="msg msg-ok" role="status">{state.ok}</p>}
      {state.secret && (
        <div className="secret">
          <p>Copy this now. It will not be shown again.</p>
          <code>{state.secret}</code>
        </div>
      )}
    </form>
  );
}
