import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export function Brand({ sub = "Smart Building" }: { sub?: string }) {
  return (
    <>
      <span className="brand-mark">
        <Icon name="activity" size={18} strokeWidth={2.4} />
      </span>
      <span className="brand-text">
        <strong>HITL</strong>
        <span>{sub}</span>
      </span>
    </>
  );
}

export function PageHeader({
  title,
  sub,
  eyebrow,
  children,
}: {
  title: string;
  sub?: string;
  eyebrow?: { icon: IconName; text: string };
  children?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && (
          <div className="eyebrow">
            <Icon name={eyebrow.icon} size={13} />
            {eyebrow.text}
          </div>
        )}
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </header>
  );
}

export function PanelHead({ icon, title, count, children }: { icon?: IconName; title: string; count?: number; children?: ReactNode }) {
  return (
    <div className="panel-head">
      <h2>
        {icon && <Icon name={icon} size={17} />}
        {title}
        {count !== undefined && <span className="count">{count}</span>}
      </h2>
      {children}
    </div>
  );
}

export function Stat({
  icon,
  label,
  value,
  unit,
  hint,
  tone,
}: {
  icon: IconName;
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: string;
  tone?: "warn" | "danger" | "cold";
}) {
  return (
    <div className="stat">
      <span className={`stat-icon ${tone ?? ""}`}>
        <Icon name={icon} size={18} />
      </span>
      <div>
        <div className="label">{label}</div>
        <div className="value">
          {value}
          {unit && <small>{unit}</small>}
        </div>
        {hint && <div className="hint">{hint}</div>}
      </div>
    </div>
  );
}

export function Empty({ icon = "box", children }: { icon?: IconName; children: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} size={26} strokeWidth={1.6} />
      <div>{children}</div>
    </div>
  );
}

/** A table row holding an empty state across all columns. */
export function EmptyRow({ colSpan, icon, children }: { colSpan: number; icon?: IconName; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan}>
        <Empty icon={icon}>{children}</Empty>
      </td>
    </tr>
  );
}

type Tone = "ok" | "warn" | "danger" | "cold" | "neutral";

export function Badge({ tone = "neutral", icon, dot, children }: { tone?: Tone; icon?: IconName; dot?: boolean; children: ReactNode }) {
  return (
    <span className={`badge ${tone === "neutral" ? "" : `badge-${tone}`}`}>
      {dot && <span className="dot" />}
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}

export function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter((w) => /^[A-Za-z]/.test(w))
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?"
  );
}
