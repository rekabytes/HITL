export interface FormState {
  error?: string;
  ok?: string;
  /** Shown once in a copy box, for example a new device key. */
  secret?: string;
}

export const initialFormState: FormState = {};

export function str(form: FormData, name: string): string {
  const v = form.get(name);
  return typeof v === "string" ? v.trim() : "";
}

export function optStr(form: FormData, name: string): string | null {
  return str(form, name) || null;
}

/** Turns a unique-violation from Postgres into a readable message. */
export function dbError(err: unknown, duplicateMessage: string): FormState {
  const code = (err as { code?: string; cause?: { code?: string } })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  if (code === "23505") return { error: duplicateMessage };
  if (code === "23503") return { error: "Something else still points to this record." };
  console.error(err);
  return { error: "Could not save. Check the server log." };
}
