// Fiches en lecture seule (club, joueur), avec passage en modification via l'icône ✎
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase.js";
import { CATEGORIES, MATCH_STATUS, POSITIONS, age, flag, fmtDate, fmtTime, fullName, useTable } from "../lib.js";
import { Badge, DeleteButton, EditButton, Empty, Info, Modal } from "../ui.jsx";
import { PlayerForm, transfermarktUrl } from "./Players.jsx";
import { ClubForm } from "./Clubs.jsx";
import { ContactForm } from "./Contacts.jsx";

const CATEGORY_ORDER = ["international", "jeune_binational", "binational", "autre_selection"];

function useClubMatches(clubId, limit = 5) {
  const [matches, setMatches] = useState([]);
  useEffect(() => {
    if (!clubId) return setMatches([]);
    supabase.from("matches").select("*")
      .or(`home_club_id.eq.${clubId},away_club_id.eq.${clubId}`)
      .gte("kickoff", new Date().toISOString()).neq("status", "retire")
      .order("kickoff").limit(limit)
      .then(({ data }) => setMatches(data ?? []));
  }, [clubId, limit]);
  return matches;
}

function MatchList({ matches, clubId }) {
  const team = (name, id) => (id === clubId ? <b>{name}</b> : name);
  if (!matches.length) return <Empty>Aucun match à venir.</Empty>;
  return (
    <ul className="list">
      {matches.map((m) => (
        <li key={m.id}>
          <span className="muted small" style={{ minWidth: "7.5rem" }}>
            {fmtDate(m.kickoff)} · {m.date_tbd ? "à conf." : fmtTime(m.kickoff)}
          </span>
          <span>{team(m.home_team, m.home_club_id)} – {team(m.away_team, m.away_club_id)}</span>
          {m.status !== "prevu" && <Badge kind={"st-" + m.status}>{MATCH_STATUS[m.status]}</Badge>}
          <span className="muted small right">{m.competition}</span>
        </li>
      ))}
    </ul>
  );
}

// Contacts d'une fiche : ajout et modification sans passer par le mode édition
function ContactsSection({ contacts, newContact, onChanged }) {
  const [edit, setEdit] = useState(null);
  return (
    <section className="sub">
      <div className="row-between">
        <h3>Contacts</h3>
        <button className="small" onClick={() => setEdit(newContact)}>+ Contact</button>
      </div>
      {contacts.length === 0 ? <Empty>Aucun contact.</Empty> : (
        <ul className="list">
          {contacts.map((c) => (
            <li key={c.id} className="clickable" onClick={() => setEdit(c)}>
              <b>{c.name}</b> <span className="muted">{[c.role, c.organization].filter(Boolean).join(" · ")}</span>
              <span className="right small" onClick={(e) => e.stopPropagation()}>
                {c.phone && <a href={`tel:${c.phone}`}>{c.phone}</a>}
                {c.phone && c.email && " · "}
                {c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {edit && <ContactForm contact={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); onChanged(); }} />}
    </section>
  );
}

// ---------- Joueur ----------

export function PlayerSheet({ playerId, onClose, onChanged }) {
  const [p, setP] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [editing, setEditing] = useState(false);
  const [openClub, setOpenClub] = useState(null);
  const [clubs] = useTable("clubs", "id,name", "name");
  const matches = useClubMatches(p?.club_id);

  const load = useCallback(async () => {
    const { data } = await supabase.from("players")
      .select("*, club:clubs(id,name,country,league,city,calendar_url)").eq("id", playerId).single();
    setP(data);
    const { data: cs } = await supabase.from("contacts").select("*").eq("player_id", playerId).order("name");
    setContacts(cs ?? []);
  }, [playerId]);
  useEffect(() => { load(); }, [load]);

  if (!p) return null;
  if (editing) {
    return (
      <PlayerForm player={p} clubs={clubs} onClose={() => setEditing(false)}
        onSaved={async () => { setEditing(false); onChanged?.(); const { data } = await supabase.from("players").select("id").eq("id", p.id); if (!data?.length) onClose(); else load(); }} />
    );
  }

  // Les contacts rattachés au joueur sont supprimés avec lui
  const deletePlayer = async () => {
    const extra = contacts.length ? `\n\nSes ${contacts.length} contact(s) seront aussi supprimés.` : "";
    if (!confirm(`Supprimer ${fullName(p)} de la base ?${extra}`)) return;
    const { error } = await supabase.from("players").delete().eq("id", p.id);
    if (error) return alert(error.message);
    onChanged?.();
    onClose();
  };

  const years = age(p.birth_date);
  return (
    <>
      <Modal title={fullName(p)} onClose={onClose} actions={<>
        <EditButton onClick={() => setEditing(true)} />
        <DeleteButton title="Supprimer le joueur" onClick={deletePlayer} />
      </>}>
        <div className="sheet-head">
          <Badge kind={p.category}>{CATEGORIES[p.category]}</Badge>
          {p.to_verify && <span className="badge badge-verify">À vérifier</span>}
        </div>
        <dl className="infos">
          <Info label="Club">
            {p.club
              ? <a href="#" onClick={(e) => { e.preventDefault(); setOpenClub(p.club.id); }}>{p.club.name}</a>
              : "Sans club"}
            {p.club && <div className="muted small">{flag(p.club.country)} {p.club.league}</div>}
          </Info>
          <Info label="Poste">{POSITIONS[p.position]}</Info>
          <Info label="Âge">{years != null && <>{years} ans <span className="muted small">({fmtDate(p.birth_date, { day: "numeric", month: "long", year: "numeric" })})</span></>}</Info>
          <Info label="Autre nationalité">{p.other_nationality}</Info>
          <Info label="Sélection">{p.selection_status}</Info>
          <Info label="Instagram">{p.instagram && (
            <a href={`https://www.instagram.com/${p.instagram.replace(/^@/, "")}`} target="_blank" rel="noreferrer">{p.instagram}</a>
          )}</Info>
          {p.notes && <div className="info wide"><dt>Notes</dt><dd className="pre">{p.notes}</dd></div>}
        </dl>
        <div className="links">
          <a href={transfermarktUrl(p)} target="_blank" rel="noreferrer">Fiche Transfermarkt ↗</a>
          {p.club?.calendar_url && <a href={p.club.calendar_url} target="_blank" rel="noreferrer">Calendrier du club ↗</a>}
          {p.source_url && p.source_url !== p.transfermarkt_url && <a href={p.source_url} target="_blank" rel="noreferrer">Source ↗</a>}
        </div>

        <section className="sub">
          <h3>Prochains matchs</h3>
          <MatchList matches={matches} clubId={p.club_id} />
        </section>
        <ContactsSection contacts={contacts} newContact={{ player_id: p.id }} onChanged={load} />
      </Modal>
      {openClub && <ClubSheet clubId={openClub} onClose={() => setOpenClub(null)} onChanged={() => { load(); onChanged?.(); }} />}
    </>
  );
}

// ---------- Club ----------

export function ClubSheet({ clubId, onClose, onChanged }) {
  const [c, setC] = useState(null);
  const [players, setPlayers] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [editing, setEditing] = useState(false);
  const [openPlayer, setOpenPlayer] = useState(null);
  const matches = useClubMatches(clubId);

  const load = useCallback(async () => {
    const [club, pl, cs] = await Promise.all([
      supabase.from("clubs").select("*").eq("id", clubId).single(),
      supabase.from("players").select("id,first_name,last_name,category,position,birth_date,selection_status").eq("club_id", clubId),
      supabase.from("contacts").select("*").eq("club_id", clubId).order("name"),
    ]);
    setC(club.data);
    setPlayers((pl.data ?? []).sort((a, b) =>
      CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.last_name.localeCompare(b.last_name)));
    setContacts(cs.data ?? []);
  }, [clubId]);
  useEffect(() => { load(); }, [load]);

  if (!c) return null;
  if (editing) {
    return (
      <ClubForm club={c} onClose={() => setEditing(false)}
        onSaved={async () => { setEditing(false); onChanged?.(); const { data } = await supabase.from("clubs").select("id").eq("id", c.id); if (!data?.length) onClose(); else load(); }} />
    );
  }

  return (
    <>
      <Modal title={c.name} onClose={onClose} actions={<EditButton onClick={() => setEditing(true)} />}>
        <dl className="infos">
          <Info label="Championnat">{flag(c.country)} {c.league ?? "—"}</Info>
          <Info label="Ville">{c.city}</Info>
          {c.press_contact && <div className="info wide"><dt>Contact presse</dt><dd className="pre">{c.press_contact}</dd></div>}
        </dl>
        <div className="links">
          {c.calendar_url && <a href={c.calendar_url} target="_blank" rel="noreferrer">Calendrier / site ↗</a>}
          {c.fotmob_team_id && <a href={`https://www.fotmob.com/teams/${c.fotmob_team_id}/fixtures`} target="_blank" rel="noreferrer">FotMob ↗</a>}
          {c.tm_club_id && <a href={`https://www.transfermarkt.fr/-/startseite/verein/${c.tm_club_id}`} target="_blank" rel="noreferrer">Transfermarkt ↗</a>}
        </div>

        <section className="sub">
          <h3>Joueurs suivis <span className="muted">({players.length})</span></h3>
          {players.length === 0 ? <Empty>Aucun joueur suivi dans ce club.</Empty> : (
            <ul className="list">
              {players.map((p) => (
                <li key={p.id} className="clickable" onClick={() => setOpenPlayer(p.id)}>
                  <b>{fullName(p)}</b>
                  <span className="muted small">{[POSITIONS[p.position], age(p.birth_date) != null && `${age(p.birth_date)} ans`].filter(Boolean).join(" · ")}</span>
                  <span className="right"><Badge kind={p.category}>{CATEGORIES[p.category]}</Badge></span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="sub">
          <h3>5 prochains matchs</h3>
          <MatchList matches={matches} clubId={c.id} />
        </section>
        <ContactsSection contacts={contacts} newContact={{ club_id: c.id }} onChanged={load} />
      </Modal>
      {openPlayer && <PlayerSheet playerId={openPlayer} onClose={() => setOpenPlayer(null)} onChanged={() => { load(); onChanged?.(); }} />}
    </>
  );
}
