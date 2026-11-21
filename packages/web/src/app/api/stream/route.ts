import { apiUser, isStaff } from "@/lib/auth";
import { problem } from "@/lib/http";
import { LIVE_CHANNEL, newSubscriber } from "@/lib/redis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Server-sent events: every new reading, vote and alert, for the live dashboard. */
export async function GET(req: Request) {
  if (!isStaff(await apiUser(req))) return problem(401, "Sign in as staff");

  const sub = newSubscriber();
  const enc = new TextEncoder();
  let ping: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  const stop = () => {
    if (closed) return;
    closed = true;
    if (ping) clearInterval(ping);
    sub.quit().catch(() => sub.disconnect());
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(chunk));
        } catch {
          stop();
        }
      };
      sub.on("message", (_channel, message) => send(`data: ${message}\n\n`));
      try {
        await sub.subscribe(LIVE_CHANNEL);
      } catch {
        send(`event: error\ndata: {"error":"live feed unavailable"}\n\n`);
      }
      send(": connected\n\n");
      ping = setInterval(() => send(": ping\n\n"), 25_000);
      req.signal.addEventListener("abort", () => {
        stop();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel: stop,
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
