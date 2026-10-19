import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase.js";
import { CATEGORIES, COUNTRIES, flag, POSITIONS, age, fmtDate, fmtTime, fullName, remove, save, useTable } from "../lib.js";
import { Badge, Empty, Field, Modal } from "../ui.jsx";
import { ContactForm } from "./Contacts.jsx";
import { PlayerSheet } from "./Sheets.jsx";
import DataTable from "../DataTable.jsx";

const EMPTY = { category: "international", to_verify: false };

// Fiche Transfermarkt, ou recherche par nom si le lien n'est pas encore renseigné
export const transfermarktUrl = (p) =>
  p.transfermarkt_url || `https://www.transfermarkt.fr/schnellsuche/ergebnis/schnellsuche?query=${encodeURIComponent(fullName(p))}`;

// Prochain match par club (hors matchs annulés ou retirés)
export function useNextMatches() {
  const [byClub, setByClub] = useState({});
  useEffect(() => {
    supabase.from("club_next_match").select("*")
      .then(({ data }) => setByClub(Object.fromEntries((data ?? []).map((m) => [m.club_id, m]))));
  }, []);
  return byClub;
}

export function PlayerForm({ player, clubs, onClose, onSaved }) {
  const [p, setP] = useState(player);
  const [contacts, setContacts] = useState([]);
  const [editContact, setEditContact] = useState(null);

  const loadContacts = () =>
    p.id && supabase.from("contacts").select("*").eq("player_id", p.id).order("name").then(({ data }) => setContacts(data ?? []));
  useEffect(() => { loadContacts(); }, [p.id]);

  const submit = async (e) => {
    e.preventDefault();
    const { club, ...row } = p;
    if (await save("players", row)) onSaved();
  };
  const del = async () => { if (await remove("players", p.id, fullName(p))) onSaved(); };

  return (
    <Modal
      title={p.id ? fullName(p) : "Nouveau joueur"}
      onClose={onClose}
      footer={<>
        {p.id && <button className="danger ghost" onClick={del}>Supprimer</button>}
        <span className="spacer" />
        <button onClick={onClose}>Annuler</button>
        <button className="primary" form="player-form">Enregistrer</button>
      </>}
    >
      <form id="player-form" className="grid" onSubmit={submit}>
        <Field label="Prénom" name="first_name" value={p} onChange={setP} />
        <Field label="Nom" name="last_name" value={p} onChange={setP} required />
        <Field label="Catégorie" name="category" value={p} onChange={setP} options={CATEGORIES} required />
        <Field label="Poste" name="position" value={p} onChange={setP} options={POSITIONS} />
        <Field label="Date de naissance" name="birth_date" type="date" value={p} onChange={setP} />
        <Field label="Club" name="club_id" value={p} onChange={setP}
          options={Object.fromEntries(clubs.map((c) => [c.id, c.name]))} />
        <Field label="Autre nationalité" name="other_nationality" value={p} onChange={setP} placeholder="FRA, BEL…" />
        <Field label="Statut sélection" name="selection_status" value={p} onChange={setP} placeholder="Convoqué oct. 2026…" />
        <Field label="Instagram" name="instagram" value={p} onChange={setP} placeholder="@pseudo" />
        <div className="field">
          <Field label="Lien Transfermarkt" name="transfermarkt_url" value={p} onChange={setP} />
          {p.last_name && <a className="small" href={transfermarktUrl(p)} target="_blank" rel="noreferrer">Ouvrir la fiche Transfermarkt ↗</a>}
        </div>
        <Field label="Source de l'info" name="source_url" value={p} onChange={setP} wide />
        <Field label="Notes" name="notes" type="textarea" value={p} onChange={setP} wide />
        <Field label="Infos à vérifier" name="to_verify" type="checkbox" value={p} onChange={setP} />
      </form>

      {p.id && (
        <section className="sub">
          <div className="row-between">
            <h3>Contacts liés</h3>
            <button className="small" onClick={() => setEditContact({ player_id: p.id })}>+ Contact</button>
          </div>
          {contacts.length === 0 ? <Empty>Aucun contact pour ce joueur.</Empty> : (
            <ul className="list">
              {contacts.map((c) => (
                <li key={c.id} onClick={() => setEditContact(c)}>
                  <b>{c.name}</b> <span className="muted">{c.role}</span>
                  <span className="muted right">{c.phone || c.email}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {editContact && (
        <ContactForm contact={editContact} onClose={() => setEditContact(null)}
          onSaved={() => { setEditContact(null); loadContacts(); }} />
      )}
    </Modal>
  );
}

const HIDDEN_BY_DEFAULT = ["other_nationality", "country", "league"];
const preset = (name, filters = []) => ({ name, state: { filters, hidden: HIDDEN_BY_DEFAULT, sorts: [{ key: "name", dir: "asc" }] } });
const PRESETS = [
  preset("Tous"),
  preset("Internationaux RDC", [{ key: "category", op: "in", value: ["international"] }]),
  preset("Binationaux", [{ key: "category", op: "in", value: ["binational"] }]),
  preset("Jeunes binationaux", [{ key: "category", op: "in", value: ["jeune_binational"] }]),
  preset("Internationaux étrangers", [{ key: "category", op: "in", value: ["autre_selection"] }]),
  { name: "Match dans 14 jours", state: { hidden: HIDDEN_BY_DEFAULT, sorts: [{ key: "next", dir: "asc" }],
    filters: [{ key: "next", op: "next_days", value: "14" }, { key: "category", op: "not_in", value: ["autre_selection"] }] } },
  preset("À vérifier", [{ key: "to_verify", op: "checked" }]),
];

export default function Players() {
  const [players, reload] = useTable("players", "*, club:clubs(id,name,country,league,calendar_url)", "last_name");
  const [clubs] = useTable("clubs", "*", "name");
  const next = useNextMatches();
  const [edit, setEdit] = useState(null);
  const [view, setView] = useState(null);

  const leagues = useMemo(() => Object.fromEntries(
    [...new Set(players.map((p) => p.club?.league).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr")).map((l) => [l, l])
  ), [players]);

  const columns = useMemo(() => [
    { key: "name", label: "Joueur", type: "text", get: (p) => `${p.last_name} ${p.first_name ?? ""}`, groupable: false,
      render: (p) => <>
        <b>{fullName(p)}</b>{p.to_verify && <> <span className="badge badge-verify" title="Infos à vérifier">À vérifier</span></>}
      </> },
    { key: "category", label: "Catégorie", type: "select", options: CATEGORIES, get: (p) => p.category,
      render: (p) => <Badge kind={p.category}>{CATEGORIES[p.category]}</Badge> },
    { key: "position", label: "Poste", type: "select", options: POSITIONS, get: (p) => p.position, render: (p) => POSITIONS[p.position] ?? "—" },
    { key: "age", label: "Âge", type: "number", get: (p) => age(p.birth_date), render: (p) => (age(p.birth_date) != null ? `${age(p.birth_date)} ans` : "—") },
    { key: "club", label: "Club", type: "text", get: (p) => p.club?.name,
      render: (p) => (p.club ? <>{p.club.name}<span className="cell-sub">{flag(p.club.country)} {p.club.league}</span></> : "—") },
    { key: "country", label: "Pays", type: "select", options: COUNTRIES, get: (p) => p.club?.country, render: (p) => flag(p.club?.country) || "—" },
    { key: "league", label: "Championnat", type: "select", options: leagues, get: (p) => p.club?.league, render: (p) => p.club?.league ?? "—" },
    { key: "other_nationality", label: "Autre nationalité", type: "text", get: (p) => p.other_nationality },
    { key: "selection_status", label: "Statut sélection", type: "text", get: (p) => p.selection_status },
    { key: "next", label: "Prochain match", type: "date", groupable: false, get: (p) => next[p.club_id]?.kickoff,
      render: (p) => {
        const m = next[p.club_id];
        return m ? <>{fmtDate(m.kickoff)} {m.date_tbd ? "" : fmtTime(m.kickoff)}<span className="cell-sub">{m.home_team} – {m.away_team}{m.status === "reporte" && " · reporté"}</span></> : <span className="muted">—</span>;
      } },
    { key: "to_verify", label: "À vérifier", type: "bool", get: (p) => p.to_verify, render: (p) => (p.to_verify ? <span className="badge badge-verify">Oui</span> : "") },
    { key: "links", label: "Liens", type: "text", sortable: false, filterable: false, groupable: false, stopClick: true, get: () => "",
      render: (p) => <>
        <a href={transfermarktUrl(p)} target="_blank" rel="noreferrer">Transfermarkt</a>
        {p.club?.calendar_url && <> · <a href={p.club.calendar_url} target="_blank" rel="noreferrer">Calendrier</a></>}
      </> },
  ], [next, leagues]);

  return (
    <>
      <div className="page-head">
        <h1>Joueurs <span className="muted">({players.length})</span></h1>
        <button className="primary" onClick={() => setEdit(EMPTY)}>+ Joueur</button>
      </div>
      <DataTable id="players" columns={columns} rows={players} presets={PRESETS} onRowClick={(p) => setView(p.id)}
        searchKeys={["name", "club", "league", "other_nationality", "selection_status"]} emptyText="Aucun joueur." />
      {view && <PlayerSheet playerId={view} onClose={() => setView(null)} onChanged={reload} />}
      {edit && <PlayerForm player={edit} clubs={clubs} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </>
  );
}
