import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { users } from "@hitl/db";
import { ActionForm } from "@/components/ActionForm";
import { PageHeader } from "@/components/Shell";
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
      <PageHeader title="Users" sub="Staff accounts are made here. Occupants sign up from the mobile app." />
      <section className="panel">
        <h2>Add a user</h2>
        <ActionForm action={createUserAction} submitLabel="Create user">
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

      <section className="panel">
        <h2>All users ({rows.length})</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role and access</th>
                <th>Last active</th>
                <th>Reset password</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.name}
                    {u.id === me.id && <span className="badge" style={{ marginLeft: 6 }}>you</span>}
                    {u.mustChangePassword && <div className="small muted">must set a new password</div>}
                  </td>
                  <td>{u.email}</td>
                  <td>
                    <ActionForm action={updateUserAction} submitLabel="Save" variant="ghost" className="form-inline">
                      <input type="hidden" name="id" value={u.id} />
                      <select name="role" defaultValue={u.role} aria-label="Role">
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                      <label className="form-inline" style={{ fontWeight: 400 }}>
                        <input type="checkbox" name="active" defaultChecked={u.active} /> active
                      </label>
                    </ActionForm>
                  </td>
                  <td className="small">{timeAgo(u.lastActiveAt)}</td>
                  <td>
                    <ActionForm action={resetPasswordAction} submitLabel="Reset" variant="ghost" className="form-inline">
                      <input type="hidden" name="id" value={u.id} />
                      <input name="password" type="text" minLength={8} placeholder="temporary password" required autoComplete="off" />
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
