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

/**
 * A same-site path to go to after sign-in, such as `/r/L21` from a scanned QR
 * code. Anything else (other sites, `//host`, backslashes) is dropped.
 */
export function safeNext(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v.startsWith("/") || v.startsWith("//") || v.includes("\\")) return null;
  return v.length <= 200 ? v : null;
}

/** Turns a unique-violation from Postgres into a readable message. */
export function dbError(
  err: unknown,
  duplicateMessage: string,
  inUseMessage = "Something else still points to this record.",
): FormState {
  const code = (err as { code?: string; cause?: { code?: string } })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  if (code === "23505") return { error: duplicateMessage };
  if (code === "23503") return { error: inUseMessage };
  console.error(err);
  return { error: "Could not save. Check the server log." };
}
