import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { users } from "@hitl/db";
import { ActionForm } from "@/components/ActionForm";
import { Badge, initials, PageHeader, PanelHead } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { timeAgo } from "@/lib/time";
import { createUserAction, resetPasswordAction, updateUserAction } from "./actions";

export const metadata: Metadata = { title: "Users" };

const ROLE_OPTIONS = [
  { value: "facility_manager", label: "Facility manager" },
  { value: "admin", label: "Admin" },
  { value: "occupant", label: "Occupant" },
];

export default async function UsersPage() {
  const me = await requireAdmin();
  const rows = await db().select().from(users).orderBy(asc(users.role), asc(users.name));

  return (
    <>
      <PageHeader
        eyebrow={{ icon: "shield", text: "Administration" }}
        title="Users"
        sub="Staff accounts are made here. Occupants sign up from the mobile app."
      />
      <section className="panel">
        <PanelHead icon="plus" title="Add a user" />
        <ActionForm action={createUserAction} submitLabel="Create user" icon="plus">
          <div className="form-row">
            <label>
              Name
              <input name="name" required maxLength={120} />
            </label>
            <label>
              Email
              <input name="email" type="email" required />
            </label>
            <label>
              Role
              <select name="role" defaultValue="facility_manager">
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </label>
            <label>
              Temporary password
              <input name="password" type="text" minLength={8} required autoComplete="off" />
            </label>
          </div>
        </ActionForm>
      </section>

      <section className="panel panel-flush">
        <PanelHead icon="users" title="All users" count={rows.length} />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Role and access</th>
                <th>Last active</th>
                <th>Reset password</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div style={{ display: "flex", gap: "0.65rem", alignItems: "center" }}>
                      <span className="avatar">{initials(u.name)}</span>
                      <div>
                        <div className="cell-title">
                          {u.name} {u.id === me.id && <Badge>you</Badge>}
                        </div>
                        <div className="cell-sub">{u.email}</div>
                        {u.mustChangePassword && <div className="cell-sub" style={{ color: "var(--warn)" }}>Must set a new password</div>}
                      </div>
                    </div>
                  </td>
                  <td>
                    <ActionForm action={updateUserAction} submitLabel="Save" icon="save" variant="ghost" size="sm" className="form-inline">
                      <input type="hidden" name="id" value={u.id} />
                      <select name="role" defaultValue={u.role} aria-label="Role" className="input-sm">
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                      <label className="check">
                        <input type="checkbox" name="active" defaultChecked={u.active} /> Active
                      </label>
                    </ActionForm>
                  </td>
                  <td className="small muted nowrap">{timeAgo(u.lastActiveAt)}</td>
                  <td>
                    <ActionForm action={resetPasswordAction} submitLabel="Reset" icon="key" variant="ghost" size="sm" className="form-inline">
                      <input type="hidden" name="id" value={u.id} />
                      <input name="password" type="text" minLength={8} placeholder="Temporary password" required autoComplete="off" className="input-sm" />
                    </ActionForm>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
