import { appIcon } from "@/lib/app-icon";

const ICONS: Record<string, { size: number; maskable?: boolean }> = {
  "icon-192.png": { size: 192 },
  "icon-512.png": { size: 512 },
  "maskable-512.png": { size: 512, maskable: true },
};

export const dynamic = "force-static";
export const generateStaticParams = () => Object.keys(ICONS).map((name) => ({ name }));
export const dynamicParams = false;

/** PNG icons for the web app manifest, rendered once at build time. */
export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const spec = ICONS[(await ctx.params).name];
  if (!spec) return new Response("Not found", { status: 404 });
  return appIcon(spec.size, { maskable: spec.maskable });
}
