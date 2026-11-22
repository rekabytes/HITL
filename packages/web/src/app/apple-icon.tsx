import { appIcon } from "@/lib/app-icon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** iPhone Home Screen icon. iOS rounds the corners itself, so the square is filled edge to edge. */
export default function AppleIcon() {
  return appIcon(180, { maskable: true });
}
