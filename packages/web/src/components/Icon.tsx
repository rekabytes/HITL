import { ICON_PATHS, type IconName } from "./icon-paths";

export type { IconName };

/**
 * Feather line icon. Paths come from the generated subset in icon-paths.ts;
 * add new names in scripts/gen-icons.mjs. Works in server and client components.
 */
export function Icon({
  name,
  size = 16,
  strokeWidth = 2,
  className,
  label,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  /** Set when the icon carries meaning on its own; otherwise it is hidden from screen readers. */
  label?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ? `icon ${className}` : "icon"}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] }}
    />
  );
}
