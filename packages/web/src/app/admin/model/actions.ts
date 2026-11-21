"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import type { FormState } from "@/lib/form";
import { runTraining } from "@/lib/training";

export async function retrainAction(_prev: FormState, _form: FormData): Promise<FormState> {
  await requireAdmin();
  const result = await runTraining();
  revalidatePath("/admin/model");
  return result.status === "succeeded" ? { ok: result.message } : { error: result.message };
}
