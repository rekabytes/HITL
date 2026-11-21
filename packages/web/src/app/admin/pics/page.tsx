import type { Metadata } from "next";
import { pics } from "@hitl/db";
import { ActionForm } from "@/components/ActionForm";
import { PageHeader } from "@/components/Shell";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { listRooms } from "@/lib/readings";
import { removePicAction, savePicAction } from "./actions";

export const metadata: Metadata = { title: "Persons in charge" };

export default async function PicsPage() {
  await requireAdmin();
  const [roomRows, picRows] = await Promise.all([listRooms(), db().select().from(pics)]);
  const picFor = new Map(picRows.map((p) => [p.roomId, p]));

  return (
    <>
      <PageHeader title="Persons in charge" sub="One contact per room. They get an email when an alert opens there (if SMTP is set)." />
      <section className="panel">
        <h2>Set a person in charge</h2>
        {roomRows.length === 0 ? (
          <p className="muted">Add rooms first.</p>
        ) : (
          <ActionForm action={savePicAction} submitLabel="Save">
            <div className="form-row">
              <label>
                Room
                <select name="roomId" required>
                  {roomRows.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.code} · {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Name
                <input name="name" required />
              </label>
              <label>
                Email
                <input name="email" type="email" />
              </label>
              <label>
                Phone
                <input name="phone" type="tel" placeholder="+60123456789" />
              </label>
            </div>
          </ActionForm>
        )}
      </section>
      <section className="panel">
        <h2>By room</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Room</th>
                <th>Person in charge</th>
                <th>Email</th>
                <th>Phone</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {roomRows.map((r) => {
                const p = picFor.get(r.id);
                return (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.code}</strong> <span className="muted small">{r.buildingName}</span>
                    </td>
                    <td>{p?.name ?? <span className="muted">not set</span>}</td>
                    <td>{p?.email ?? ""}</td>
                    <td>{p?.phone ?? ""}</td>
                    <td>
                      {p && (
                        <ActionForm action={removePicAction} submitLabel="Remove" variant="ghost" className="form-inline">
                          <input type="hidden" name="id" value={p.id} />
                        </ActionForm>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
