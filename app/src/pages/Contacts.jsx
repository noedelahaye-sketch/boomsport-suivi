import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase.js";
import { CONTACT_ROLES, fmtDate, fullName, remove, save, useTable } from "../lib.js";
import { Empty, Field, Modal } from "../ui.jsx";
import DataTable from "../DataTable.jsx";

export function ContactForm({ contact, onClose, onSaved }) {
  const [c, setC] = useState(contact);
  const [players] = useTable("players", "id,first_name,last_name", "last_name");
  const [clubs] = useTable("clubs", "id,name", "name");
  const [log, setLog] = useState([]);
  const [note, setNote] = useState("");

  const loadLog = () =>
    c.id && supabase.from("interactions").select("*").eq("contact_id", c.id).order("happened_on", { ascending: false })
      .then(({ data }) => setLog(data ?? []));
  useEffect(() => { loadLog(); }, [c.id]);

  const submit = async (e) => {
    e.preventDefault();
    const { player, club, ...row } = c;
    if (await save("contacts", row)) onSaved();
  };
  const del = async () => { if (await remove("contacts", c.id, c.name)) onSaved(); };
  const addNote = async (e) => {
    e.preventDefault();
    if (!note.trim()) return;
    if (await save("interactions", { contact_id: c.id, summary: note.trim() })) { setNote(""); loadLog(); }
  };

  return (
    <Modal
      title={c.id ? c.name : "Nouveau contact"}
      onClose={onClose}
      footer={<>
        {c.id && <button className="danger ghost" onClick={del}>Supprimer</button>}
        <span className="spacer" />
        <button onClick={onClose}>Annuler</button>
        <button className="primary" form="contact-form">Enregistrer</button>
      </>}
    >
      <form id="contact-form" className="grid" onSubmit={submit}>
        <Field label="Nom" name="name" value={c} onChange={setC} required />
        <Field label="Rôle" name="role" value={c} onChange={setC} options={CONTACT_ROLES} />
        <Field label="Organisation" name="organization" value={c} onChange={setC} placeholder="Agence, club, ligue…" />
        <Field label="Téléphone" name="phone" type="tel" value={c} onChange={setC} />
        <Field label="Email" name="email" type="email" value={c} onChange={setC} />
        <Field label="Joueur lié" name="player_id" value={c} onChange={setC}
          options={Object.fromEntries(players.map((p) => [p.id, fullName(p)]))} />
        <Field label="Club lié" name="club_id" value={c} onChange={setC}
          options={Object.fromEntries(clubs.map((x) => [x.id, x.name]))} />
        <Field label="Notes" name="notes" type="textarea" value={c} onChange={setC} wide />
      </form>

      {c.id && (
        <section className="sub">
          <h3>Historique des échanges</h3>
          <form className="inline" onSubmit={addNote}>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex : appelé, rappeler après le match du 25/10" />
            <button className="small">Ajouter</button>
          </form>
          {log.length === 0 ? <Empty>Aucun échange noté.</Empty> : (
            <ul className="list">
              {log.map((i) => (
                <li key={i.id}>
                  <span className="muted">{fmtDate(i.happened_on)}</span> {i.summary}
                  <span className="muted right small">{i.author?.split("@")[0]}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </Modal>
  );
}

export default function Contacts() {
  const [contacts, reload] = useTable("contacts", "*, player:players(first_name,last_name), club:clubs(name)", "name");
  const [edit, setEdit] = useState(null);

  const columns = useMemo(() => [
    { key: "name", label: "Nom", type: "text", get: (c) => c.name, groupable: false,
      render: (c) => <><b>{c.name}</b>{c.organization && <span className="cell-sub">{c.organization}</span>}</> },
    { key: "role", label: "Rôle", type: "select", options: Object.fromEntries(CONTACT_ROLES.map((r) => [r, r])), get: (c) => c.role },
    { key: "organization", label: "Organisation", type: "text", get: (c) => c.organization },
    { key: "player", label: "Joueur", type: "text", get: (c) => fullName(c.player) || null },
    { key: "club", label: "Club", type: "text", get: (c) => c.club?.name },
    { key: "phone", label: "Téléphone", type: "text", groupable: false, stopClick: true, get: (c) => c.phone,
      render: (c) => (c.phone ? <a href={`tel:${c.phone}`}>{c.phone}</a> : "—") },
    { key: "email", label: "Email", type: "text", groupable: false, stopClick: true, get: (c) => c.email,
      render: (c) => (c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : "—") },
  ], []);

  return (
    <>
      <div className="page-head">
        <h1>Contacts <span className="muted">({contacts.length})</span></h1>
        <button className="primary" onClick={() => setEdit({})}>+ Contact</button>
      </div>
      <DataTable id="contacts" columns={columns} rows={contacts} onRowClick={(c) => setEdit(c)}
        presets={[{ name: "Tous", state: { hidden: ["organization"], sorts: [{ key: "name", dir: "asc" }] } },
                  { name: "Par rôle", state: { hidden: ["organization"], group: "role", sorts: [{ key: "name", dir: "asc" }] } }]}
        emptyText="Aucun contact pour l'instant. Ajoute agents, familles et services presse." />
      {edit && <ContactForm contact={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </>
  );
}
