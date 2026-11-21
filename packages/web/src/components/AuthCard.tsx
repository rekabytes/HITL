import type { ReactNode } from "react";
import { Brand } from "./ui";

export function AuthCard({ title, sub, children }: { title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <div className="auth-page">
      <div>
        <div className="auth-card">
          <div className="brand">
            <Brand sub="Human-in-the-loop monitoring" />
          </div>
          <div>
            <h1>{title}</h1>
            {sub && <p className="sub">{sub}</p>}
          </div>
          {children}
        </div>
        <p className="auth-foot">Occupant comfort and building conditions, side by side.</p>
      </div>
    </div>
  );
}
