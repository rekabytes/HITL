import type { z } from "zod";

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function problem(status: number, error: string, details?: unknown) {
  return json(details === undefined ? { error } : { error, details }, status);
}

export async function readJson<T extends z.ZodType>(req: Request, schema: T) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { ok: false as const, response: problem(400, "Body must be JSON") };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { ok: false as const, response: problem(422, "Invalid body", parsed.error.issues) };
  }
  return { ok: true as const, data: parsed.data as z.infer<T> };
}
