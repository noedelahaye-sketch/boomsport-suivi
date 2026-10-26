import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase.js";
import { CONTACT_ROLES, fmtDate, fullName, remove, save, useTable } from "../lib.js";
import { Empty, Field, Modal } from "../ui.jsx";
import DataTable from "../DataTable.jsx";

const AUDIENCES = ["Club", "Agent", "Famille", "Presse ligue", "Joueur", "Autre"];

function TemplateForm({ template, onClose, onSaved }) {
  const [t, setT] = useState(template);
  const submit = async (e) => { e.preventDefault(); if (await save("message_templates", t)) onSaved(); };
  const del = async () => { if (await remove("message_templates", t.id, "ce modèle")) onSaved(); };
  return (
    <Modal
      title={t.id ? t.name : "Nouveau modèle"}
      onClose={onClose}
      footer={<>
        {t.id && <button className="danger ghost" onClick={del}>Supprimer</button>}
        <span className="spacer" />
        <button onClick={onClose}>Annuler</button>
        <button className="primary" form="tpl-form">Enregistrer</button>
      </>}
    >
      <form id="tpl-form" className="grid" onSubmit={submit}>
        <Field label="Nom du modèle" name="name" value={t} onChange={setT} wide required />
        <Field label="Public" name="audience" value={t} onChange={setT} options={AUDIENCES} />
        <Field label="Demande" name="purpose" value={t} onChange={setT} placeholder="Accréditation, interview, partenariat…" />
        <Field label="Objet (email)" name="subject" value={t} onChange={setT} wide />
        <Field label="Message" name="body" type="textarea" value={t} onChange={setT} wide required />
      </form>
      <p className="muted small">Les mots entre crochets, comme [Nom du club] ou [Prénom Nom du joueur], sont remplacés au moment d'utiliser le modèle.</p>
    </Modal>
  );
}

// Choix du club / joueur, remplacement des champs, copie ou ouverture dans la messagerie
function UseTemplate({ template, onClose }) {
  const [clubs] = useTable("clubs", "id,name", "name");
  const [players] = useTable("players", "id,first_name,last_name,club_id", "last_name");
  const [contacts] = useTable("contacts", "id,name,email,club_id", "name");
  const [clubId, setClubId] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [copied, setCopied] = useState(false);

  const club = clubs.find((c) => c.id === clubId);
  const player = players.find((p) => p.id === playerId);
  const fill = (txt) => (txt ?? "")
    .replaceAll("[Nom du club]", club?.name ?? "[Nom du club]")
    .replaceAll("[Prénom Nom du joueur]", player ? fullName(player) : "[Prénom Nom du joueur]");
  const [text, setText] = useState(null);
  const body = text ?? fill(template.body);
  const subject = fill(template.subject);
  const recipients = contacts.filter((c) => c.email && clubId && c.club_id === clubId).map((c) => c.email);

  const pick = (setter) => (e) => { setter(e.target.value); setText(null); };
  const copy = async () => {
    try { await navigator.clipboard.writeText(body); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { alert("Copie impossible : sélectionne le texte et copie-le à la main."); }
  };
  const mail = `mailto:${recipients.join(",")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <Modal title={template.name} onClose={onClose}
      footer={<>
        <span className="spacer" />
        <button onClick={onClose}>Fermer</button>
        <a className="btn-link" href={mail}>Ouvrir dans la messagerie</a>
        <button className="primary" onClick={copy}>{copied ? "Copié ✓" : "Copier le message"}</button>
      </>}>
      <div className="grid">
        <label className="field"><span>Club</span>
          <select value={clubId} onChange={pick((v) => { setClubId(v); setPlayerId(""); })}>
            <option value="">—</option>
            {clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></label>
        <label className="field"><span>Joueur</span>
          <select value={playerId} onChange={pick(setPlayerId)}>
            <option value="">—</option>
            {players.filter((p) => !clubId || p.club_id === clubId).map((p) => <option key={p.id} value={p.id}>{fullName(p)}</option>)}
          </select></label>
      </div>
      {subject && <p className="small"><span className="muted">Objet :</span> {subject}</p>}
      {clubId && <p className="muted small">{recipients.length ? `Destinataire(s) : ${recipients.join(", ")}` : "Aucun contact avec email pour ce club."}</p>}
      <textarea rows={16} value={body} onChange={(e) => setText(e.target.value)} style={{ width: "100%" }} />
    </Modal>
  );
}

function Templates() {
  const [list, reload] = useTable("message_templates", "*", "created_at");
  const [edit, setEdit] = useState(null);
  const [use, setUse] = useState(null);
  return (
    <section className="sub" style={{ marginTop: "2rem" }}>
      <div className="row-between">
        <h2>Modèles de messages</h2>
        <button className="small" onClick={() => setEdit({ audience: "Club" })}>+ Modèle</button>
      </div>
      {list.length === 0 ? <Empty>Aucun modèle pour l'instant.</Empty> : (
        <ul className="list">
          {list.map((t) => (
            <li key={t.id} className="row-between">
              <span><b>{t.name}</b> <span className="muted small">{[t.audience, t.purpose].filter(Boolean).join(" · ")}</span></span>
              <span>
                <button className="small primary" onClick={() => setUse(t)}>Utiliser</button>{" "}
                <button className="small" onClick={() => setEdit(t)}>Modifier</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {edit && <TemplateForm template={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      {use && <UseTemplate template={use} onClose={() => setUse(null)} />}
    </section>
  );
}

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
      <Templates />
      {edit && <ContactForm contact={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </>
  );
}
