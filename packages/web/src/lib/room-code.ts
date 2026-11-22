// Shared by server and browser code.

const CODE = /^[A-Za-z0-9_-]{1,32}$/;

/** Path of a room's vote screen. This is what the door QR code points at. */
export const roomPath = (code: string) => `/r/${encodeURIComponent(code.toUpperCase())}`;

/**
 * Reads a scanned QR or a typed code. Accepts the room URL printed on new door
 * signs (`https://host/r/L21`) and the bare code printed on old ones (`L21`).
 */
export function parseRoomCode(text: string): string | null {
  const t = text.trim();
  if (CODE.test(t)) return t.toUpperCase();
  try {
    const m = new URL(t).pathname.match(/^\/r\/([^/]+)\/?$/);
    const code = m ? decodeURIComponent(m[1]!) : "";
    return CODE.test(code) ? code.toUpperCase() : null;
  } catch {
    return null;
  }
}
