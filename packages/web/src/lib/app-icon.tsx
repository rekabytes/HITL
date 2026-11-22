import { ImageResponse } from "next/og";
import { THEME } from "./theme";

/**
 * The app icon: the Feather "activity" line on the brand gradient. `maskable`
 * fills the whole square and keeps the line inside the centre safe zone, so
 * Android can crop it to a circle or squircle.
 */
export function appIcon(size: number, { maskable = false } = {}) {
  const glyph = Math.round(size * (maskable ? 0.46 : 0.58));
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `linear-gradient(135deg, ${THEME.brandLight}, ${THEME.brandDark})`,
          borderRadius: maskable ? 0 : Math.round(size * 0.22),
        }}
      >
        <svg width={glyph} height={glyph} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
