import { useMemo, useState } from "react";
import { COUNTRIES, flag, remove, save, useTable } from "../lib.js";
import { ClubLogo, Empty, Field, Modal } from "../ui.jsx";
import { ClubSheet } from "./Sheets.jsx";
import DataTable from "../DataTable.jsx";

export function ClubForm({ club, onClose, onSaved }) {
  const [c, setC] = useState(club);
  const submit = async (e) => {
    e.preventDefault();
    const { players, contacts, espn_team_id, espn_league, ...row } = c;
    // Nouvel identifiant FotMob : le club sera resynchronisé au prochain passage
    if ((row.fotmob_team_id || null) !== (club.fotmob_team_id || null)) { row.last_synced_at = null; row.auto_sync = true; }
    if (await save("clubs", row)) onSaved();
  };
  const del = async () => { if (await remove("clubs", c.id, c.name)) onSaved(); };
  return (
    <Modal
      title={c.id ? c.name : "Nouveau club"}
      onClose={onClose}
      footer={<>
        {c.id && <button className="danger ghost" onClick={del}>Supprimer</button>}
        <span className="spacer" />
        <button onClick={onClose}>Annuler</button>
        <button className="primary" form="club-form">Enregistrer</button>
      </>}
    >
      <form id="club-form" className="grid" onSubmit={submit}>
        <Field label="Nom" name="name" value={c} onChange={setC} required />
        <Field label="Pays" name="country" value={c} onChange={setC} options={COUNTRIES} required />
        <Field label="Championnat" name="league" value={c} onChange={setC} placeholder="Ligue 1, Pro League…" />
        <Field label="Ville" name="city" value={c} onChange={setC} />
        <Field label="Lien calendrier / site" name="calendar_url" value={c} onChange={setC} wide />
        <Field label="Contact presse (résumé)" name="press_contact" type="textarea" value={c} onChange={setC} wide />
      </form>
      <p className="muted small">
        Le calendrier complet du club (championnat, coupes, coupes d'Europe) est importé automatiquement depuis FotMob.
      </p>
      <form className="grid" onSubmit={(e) => e.preventDefault()}>
        <Field label="Identifiant FotMob (si le club est mal reconnu)" name="fotmob_team_id" value={c} onChange={setC} placeholder="ex : 8639 pour Lille" />
      </form>
      <p className="muted small">
        L'identifiant se trouve dans l'adresse de la page du club sur fotmob.com (…/teams/<b>8639</b>/…).
        Si un club n'est pas couvert, ajoute ses matchs depuis la page « 14 jours ».
      </p>
    </Modal>
  );
}

export default function Clubs() {
  const [clubs, reload] = useTable("clubs", "*, players(id,category), contacts(id)", "name");
  const [edit, setEdit] = useState(null);
  const [view, setView] = useState(null);

  const leagues = useMemo(() => Object.fromEntries(
    [...new Set(clubs.map((c) => c.league).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr")).map((l) => [l, l])
  ), [clubs]);
  const count = (c, cat) => (c.players ?? []).filter((p) => !cat || p.category === cat).length;

  const columns = useMemo(() => [
    { key: "name", label: "Club", type: "text", get: (c) => c.name, groupable: false,
      render: (c) => <span className="with-logo"><ClubLogo id={c.fotmob_team_id} /><b>{c.name}</b>{c.city && <span className="cell-sub">{c.city}</span>}{c.contacts?.length > 0 && <span className="cpill cpill-mail" title={`${c.contacts.length} contact(s) enregistré(s)`}>✉ {c.contacts.length}</span>}</span> },
    { key: "country", label: "Pays", type: "select", options: COUNTRIES, get: (c) => c.country, render: (c) => flag(c.country) },
    { key: "league", label: "Championnat", type: "select", options: leagues, get: (c) => c.league, render: (c) => c.league ?? "—" },
    { key: "players", label: "Joueurs suivis", type: "number", get: (c) => count(c) },
    { key: "internationals", label: "Internationaux RDC", type: "number", get: (c) => count(c, "international") },
    { key: "contacts", label: "Contacts", type: "number", get: (c) => (c.contacts ?? []).length,
      render: (c) => ((c.contacts ?? []).length ? <span className="cpill cpill-mail">✉ {c.contacts.length}</span> : <span className="muted">—</span>) },
    { key: "auto", label: "Calendrier auto", type: "bool", get: (c) => !!c.fotmob_team_id, stopClick: true,
      render: (c) => (c.fotmob_team_id
        ? <a href={`https://www.fotmob.com/teams/${c.fotmob_team_id}/fixtures`} target="_blank" rel="noreferrer">✓ FotMob ↗</a>
        : <span className="muted">—</span>) },
    { key: "calendar", label: "Calendrier", type: "text", sortable: false, filterable: false, groupable: false, stopClick: true, get: () => "",
      render: (c) => (c.calendar_url ? <a href={c.calendar_url} target="_blank" rel="noreferrer">Ouvrir ↗</a> : "—") },
  ], [leagues]);

  const presets = [
    { name: "Tous", state: { sorts: [{ key: "name", dir: "asc" }] } },
    { name: "Par championnat", state: { group: "league", sorts: [{ key: "players", dir: "desc" }] } },
    { name: "Avec un contact", state: { filters: [{ key: "contacts", op: "gte", value: "1" }], sorts: [{ key: "contacts", dir: "desc" }] } },
    { name: "Avec internationaux RDC", state: { filters: [{ key: "internationals", op: "gte", value: "1" }], sorts: [{ key: "internationals", dir: "desc" }] } },
  ];

  return (
    <>
      <div className="page-head">
        <h1>Clubs <span className="muted">({clubs.length})</span></h1>
        <button className="primary" onClick={() => setEdit({ country: "FRA" })}>+ Club</button>
      </div>
      <DataTable id="clubs" columns={columns} rows={clubs} presets={presets} onRowClick={(c) => setView(c.id)}
        searchKeys={["name", "league"]} emptyText="Aucun club." />
      {view && <ClubSheet clubId={view} onClose={() => setView(null)} onChanged={reload} />}
      {edit && <ClubForm club={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </>
  );
}
