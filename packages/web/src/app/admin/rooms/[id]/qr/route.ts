import { eq } from "drizzle-orm";
import QRCode from "qrcode";
import { rooms } from "@hitl/db";
import { apiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Printable SVG QR code holding the room code, for the door sign. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser(req);
  if (user?.role !== "admin") return problem(403, "Admin only");
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return problem(404, "Room not found");

  const [room] = await db().select().from(rooms).where(eq(rooms.id, id)).limit(1);
  if (!room) return problem(404, "Room not found");

  const qr = await QRCode.toString(room.code, { type: "svg", margin: 2, width: 512, errorCorrectionLevel: "M" });
  const label = room.code.replace(/[<&>]/g, "");
  // Add the code under the QR so people can type it if their camera fails.
  let size = 0;
  const svg = qr
    .replace(/viewBox="0 0 (\d+) (\d+)"/, (_m, w: string, h: string) => {
      size = Number(h);
      return `viewBox="0 0 ${w} ${size + 6}"`;
    })
    .replace(/ height="\d+"/, "")
    .replace(
      "</svg>",
      `<rect x="0" y="${size}" width="100%" height="6" fill="#fff"/>` +
        `<text x="50%" y="${size + 4}" text-anchor="middle" font-family="sans-serif" font-size="4" font-weight="700">${label}</text></svg>`,
    );
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Content-Disposition": `inline; filename="room-${label}.svg"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
