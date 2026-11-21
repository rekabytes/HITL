import type { Metadata } from "next";
import { pics } from "@hitl/db";
import { ActionForm } from "@/components/ActionForm";
import { Icon } from "@/components/Icon";
import { Badge, Empty, EmptyRow, initials, PageHeader, PanelHead } from "@/components/ui";
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
      <PageHeader
        eyebrow={{ icon: "shield", text: "Administration" }}
        title="Persons in charge"
        sub="One contact per room. They are emailed when an alert opens there, and again if it is escalated."
      />
      <section className="panel">
        <PanelHead icon="user-check" title="Set a person in charge" />
        {roomRows.length === 0 ? (
          <Empty icon="home">Add rooms first.</Empty>
        ) : (
          <ActionForm action={savePicAction} submitLabel="Save" icon="save">
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
                <input name="email" type="email" placeholder="Needed for alert emails" />
              </label>
              <label>
                Phone
                <input name="phone" type="tel" placeholder="+60123456789" />
              </label>
            </div>
          </ActionForm>
        )}
      </section>
      <section className="panel panel-flush">
        <PanelHead icon="home" title="By room" count={roomRows.length} />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Room</th>
                <th>Person in charge</th>
                <th>Contact</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {roomRows.length === 0 && <EmptyRow colSpan={4} icon="home">No rooms yet.</EmptyRow>}
              {roomRows.map((r) => {
                const p = picFor.get(r.id);
                return (
                  <tr key={r.id}>
                    <td>
                      <div className="cell-title">{r.code}</div>
                      <div className="cell-sub">{r.name} · {r.buildingName}</div>
                    </td>
                    <td>
                      {p ? (
                        <div style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
                          <span className="avatar">{initials(p.name)}</span>
                          <span className="cell-title">{p.name}</span>
                        </div>
                      ) : (
                        <Badge tone="warn" icon="alert-circle">Not set</Badge>
                      )}
                    </td>
                    <td className="small">
                      {p?.email && (
                        <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
                          <Icon name="mail" size={13} className="faint" />
                          {p.email}
                        </div>
                      )}
                      {p?.phone && (
                        <div style={{ display: "flex", gap: "0.35rem", alignItems: "center", marginTop: 2 }}>
                          <Icon name="phone" size={13} className="faint" />
                          {p.phone}
                        </div>
                      )}
                    </td>
                    <td style={{ width: 1 }}>
                      {p && (
                        <ActionForm action={removePicAction} submitLabel="Remove" icon="x" variant="ghost" size="sm" className="form-inline">
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
