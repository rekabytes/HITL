"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { initialFormState, type FormState } from "@/lib/form";
import { Icon, type IconName } from "./Icon";

type Action = (prev: FormState, form: FormData) => Promise<FormState>;
type Variant = "primary" | "ghost" | "danger";

export function SubmitButton({
  children,
  variant = "primary",
  icon,
  size,
  block,
}: {
  children: ReactNode;
  variant?: Variant;
  icon?: IconName;
  size?: "sm";
  block?: boolean;
}) {
  const { pending } = useFormStatus();
  const cls = ["btn", `btn-${variant}`, size === "sm" && "btn-sm", block && "btn-block"].filter(Boolean).join(" ");
  return (
    <button type="submit" className={cls} disabled={pending}>
      {pending ? <Icon name="refresh-cw" size={14} className="spin" /> : icon && <Icon name={icon} size={size === "sm" ? 14 : 15} />}
      {children}
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
  icon,
  size,
  block,
  className = "form",
  children,
}: {
  action: Action;
  submitLabel: string;
  variant?: Variant;
  icon?: IconName;
  size?: "sm";
  block?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className={className}>
      {children}
      <div className="form-actions">
        <SubmitButton variant={variant} icon={icon} size={size} block={block}>
          {submitLabel}
        </SubmitButton>
      </div>
      {state.error && (
        <p className="msg msg-error" role="alert">
          <Icon name="alert-circle" size={14} />
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="msg msg-ok" role="status">
          <Icon name="check-circle" size={14} />
          {state.ok}
        </p>
      )}
      {state.secret && (
        <div className="secret">
          <p>
            <Icon name="key" size={14} />
            Copy this now. It will not be shown again.
          </p>
          <code>{state.secret}</code>
        </div>
      )}
    </form>
  );
}
