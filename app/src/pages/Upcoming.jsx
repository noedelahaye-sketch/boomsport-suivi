import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase.js";
import { ACCRED_STATUS, CATEGORIES, COUNTRIES, MATCH_STATUS, EVENT_TYPES, fmtDate, fmtTime, fromLocalInput, fullName, remove, save, toLocalInput, useTable } from "../lib.js";
import { Badge, Empty, Field, IconButton, Modal } from "../ui.jsx";
import { EventForm } from "./Calendar.jsx";

const DAYS = 14;

function MatchForm({ match, clubs, onClose, onSaved }) {
  const [m, setM] = useState({ ...match, _kickoff: toLocalInput(match.kickoff) });
  const [accreds, setAccreds] = useState([]);
  const [contacts] = useTable("contacts", "id,name,role,organization", "name");
  const clubOpts = Object.fromEntries(clubs.map((c) => [c.id, c.name]));
  const auto = m.source !== "manuel";

  const loadAccreds = () =>
    m.id && supabase.from("accreditations").select("*").eq("match_id", m.id).order("created_at").then(({ data }) => setAccreds(data ?? []));
  useEffect(() => { loadAccreds(); }, [m.id]);

  const submit = async (e) => {
    e.preventDefault();
    const name = (id) => clubs.find((c) => c.id === id)?.name;
    const { _kickoff, accreditations, events, ...row } = m;
    row.kickoff = fromLocalInput(_kickoff);
    row.home_team = row.home_team || name(row.home_club_id);
    row.away_team = row.away_team || name(row.away_club_id);
    if (!row.home_team || !row.away_team) return alert("Indique les deux équipes.");
    if (await save("matches", row)) onSaved();
  };
  const del = async () => { if (await remove("matches", m.id, "ce match")) onSaved(); };

  const updateAccred = async (a, patch) => { if (await save("accreditations", { ...a, ...patch })) loadAccreds(); };
  const addAccred = async () => { if (await save("accreditations", { match_id: m.id, status: "a_demander" })) loadAccreds(); };

  return (
    <Modal
      title={m.id ? `${m.home_team} – ${m.away_team}` : "Nouveau match"}
      onClose={onClose}
      footer={<>
        {m.id && <button className="danger ghost" onClick={del}>Supprimer</button>}
        <span className="spacer" />
        <button onClick={onClose}>Fermer</button>
        {!auto && <button className="primary" form="match-form">Enregistrer</button>}
      </>}
    >
      {auto ? (
        <p className="muted small">
          Match importé automatiquement ({m.source}) · {m.competition} · {fmtDate(m.kickoff)} {m.date_tbd ? "(horaire à confirmer)" : fmtTime(m.kickoff)}
          · {MATCH_STATUS[m.status]}{m.score ? ` · ${m.score}` : ""}
        </p>
      ) : (
        <form id="match-form" className="grid" onSubmit={submit}>
          <Field label="Date et heure" name="_kickoff" type="datetime-local" value={m} onChange={setM} required />
          <Field label="Compétition" name="competition" value={m} onChange={setM} placeholder="Pro League, Ligue 2…" />
          <Field label="Club à domicile (suivi)" name="home_club_id" value={m} onChange={setM} options={clubOpts} />
          <Field label="ou équipe à domicile" name="home_team" value={m} onChange={setM} />
          <Field label="Club à l'extérieur (suivi)" name="away_club_id" value={m} onChange={setM} options={clubOpts} />
          <Field label="ou équipe à l'extérieur" name="away_team" value={m} onChange={setM} />
          <Field label="Stade / lieu" name="venue" value={m} onChange={setM} wide />
        </form>
      )}

      {m.id && (
        <section className="sub">
          <div className="row-between">
            <h3>Accréditations</h3>
            <button className="small" onClick={addAccred}>+ Demande</button>
          </div>
          {accreds.length === 0 ? <Empty>Aucune demande d'accréditation.</Empty> : accreds.map((a) => (
            <div key={a.id} className="accred">
              <select value={a.status} onChange={(e) => updateAccred(a, { status: e.target.value })}>
                {Object.entries(ACCRED_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <select value={a.contact_id ?? ""} onChange={(e) => updateAccred(a, { contact_id: e.target.value })}>
                <option value="">Contact…</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.organization ? ` (${c.organization})` : ""}</option>)}
              </select>
              <input type="date" value={a.requested_at ?? ""} onChange={(e) => updateAccred(a, { requested_at: e.target.value })} title="Date de la demande" />
              <input defaultValue={a.notes ?? ""} placeholder="Notes" onBlur={(e) => e.target.value !== (a.notes ?? "") && updateAccred(a, { notes: e.target.value })} />
              <button className="icon" onClick={async () => { if (await remove("accreditations", a.id, "cette demande")) loadAccreds(); }}>✕</button>
            </div>
          ))}
        </section>
      )}
    </Modal>
  );
}

export default function Upcoming() {
  const [matches, setMatches] = useState([]);
  const [players] = useTable("players", "id,first_name,last_name,category,club_id", "last_name");
  const [clubs] = useTable("clubs", "*", "name");
  const [editMatch, setEditMatch] = useState(null);
  const [editEvent, setEditEvent] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [onlyTracked, setOnlyTracked] = useState(true);
  const [cats, setCats] = useState(["international", "binational", "jeune_binational"]);
  const [country, setCountry] = useState("");

  const load = useCallback(async () => {
    const from = new Date(); from.setHours(0, 0, 0, 0);
    const to = new Date(from.getTime() + DAYS * 86400000);
    const { data, error } = await supabase.from("matches")
      .select("*, accreditations(status), events(id,type,title,status)")
      .gte("kickoff", from.toISOString()).lte("kickoff", to.toISOString()).neq("status", "retire")
      .order("kickoff").limit(5000);
    if (error) alert(error.message);
    setMatches(data ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const playersByClub = useMemo(() => {
    const map = {};
    for (const p of players) if (p.club_id) (map[p.club_id] ??= []).push(p);
    return map;
  }, [players]);
  const clubById = useMemo(() => Object.fromEntries(clubs.map((c) => [c.id, c])), [clubs]);

  const enriched = matches
    .map((m) => ({
      ...m,
      _players: [...(playersByClub[m.home_club_id] ?? []), ...(playersByClub[m.away_club_id] ?? [])].filter((p) => cats.includes(p.category)),
    }))
    .filter((m) => !onlyTracked || m._players.length > 0)
    .filter((m) => !country || [clubById[m.home_club_id]?.country, clubById[m.away_club_id]?.country].includes(country));

  const days = useMemo(() => {
    const g = {};
    for (const m of enriched) (g[new Date(m.kickoff).toDateString()] ??= []).push(m);
    return Object.entries(g);
  }, [enriched]);

  const sync = async () => {
    setSyncing(true);
    const { data, error } = await supabase.functions.invoke("sync-matches");
    setSyncing(false);
    if (error) {
      const body = await error.context?.json?.().catch(() => null);
      return alert(body?.error ?? error.message);
    }
    alert(`${data.saved} match(s) synchronisés pour ${data.clubs} club(s).` + (data.remaining ? `\n${data.remaining} club(s) restants : ils seront traités automatiquement dans l'heure.` : "") + (data.removed ? `\n${data.removed} match(s) retiré(s) du calendrier.` : "") + (data.errors?.length ? `\nErreurs : ${data.errors.join(", ")}` : ""));
    load();
  };

  const playersCount = new Set(enriched.flatMap((m) => m._players.map((p) => p.id))).size;

  const trips = enriched.filter((m) => m.events?.some((e) => e.type === "deplacement")).length;
  const accredOk = enriched.filter((m) => m.accreditations?.some((a) => a.status === "accordee")).length;
  const team = (name, id) => (id ? <b>{name}</b> : <span className="muted-team">{name}</span>);

  return (
    <>
      <div className="page-head">
        <div className="title">
          <h1>14 prochains jours</h1>
          <span className="summary">
            {enriched.length} matchs · {playersCount} joueurs · {trips} déplacement{trips > 1 ? "s" : ""} · {accredOk} accréd. OK
          </span>
        </div>
        <div className="actions">
          <IconButton title={syncing ? "Mise à jour…" : "Mettre à jour les matchs"} onClick={sync} disabled={syncing} spin={syncing}>
            <path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" />
          </IconButton>
          <button className="primary small" onClick={() => setEditMatch({ source: "manuel" })}>Ajouter un match</button>
        </div>
      </div>

      <div className="toolbar">
        <div className="segmented">
          {Object.entries(CATEGORIES).map(([k, l]) => (
            <button key={k} className={cats.includes(k) ? "on" : ""}
              onClick={() => setCats(cats.includes(k) ? cats.filter((c) => c !== k) : [...cats, k])}>
              <span className={"dot cat-" + k} />{l}
            </button>
          ))}
        </div>
        <select className="compact" value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="">Tous les pays</option>
          {Object.entries(COUNTRIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <label className="check small"><input type="checkbox" checked={onlyTracked} onChange={(e) => setOnlyTracked(e.target.checked)} /> Avec un joueur suivi</label>
      </div>

      {days.length === 0 && (
        <Empty>
          Aucun match sur les 14 prochains jours. Mets à jour les matchs ou ajoute-en un à la main.
        </Empty>
      )}

      <div className="mlist">
        {days.map(([day, list]) => (
          <section key={day}>
            <h2 className="mlist-day">
              {fmtDate(list[0].kickoff, { weekday: "long", day: "numeric", month: "long" })}
              <span>{list.length}</span>
            </h2>
            {list.map((m) => {
              const accred = m.accreditations?.[0]?.status;
              const off = ["annule", "reporte", "retire"].includes(m.status);
              return (
                <div key={m.id} className={"mrow" + (off ? " off" : "")} onClick={() => setEditMatch(m)}>
                  <span className="mrow-time">{m.date_tbd ? "—" : fmtTime(m.kickoff)}</span>
                  <span className="mrow-teams">
                    {team(m.home_team, m.home_club_id)}
                    <span className="mrow-score">{m.score || "–"}</span>
                    {team(m.away_team, m.away_club_id)}
                    <span className="mrow-comp">{m.competition}</span>
                  </span>
                  <span className="mrow-players">
                    {m._players.map((p) => <span key={p.id} className="pchip"><span className={"dot cat-" + p.category} />{fullName(p)}</span>)}
                  </span>
                  <span className="mrow-tags">
                    {m.status !== "prevu" && <Badge kind={"st-" + m.status}>{MATCH_STATUS[m.status]}</Badge>}
                    {accred && <Badge kind={"acc-" + accred}>Accréd. {ACCRED_STATUS[accred].toLowerCase()}</Badge>}
                    {m.events?.map((e) => <Badge key={e.id} kind={"ev-" + e.type}>{EVENT_TYPES[e.type]}</Badge>)}
                  </span>
                  <span className="mrow-actions" onClick={(e) => e.stopPropagation()}>
                    <IconButton title="Prévoir un déplacement" onClick={() => setEditEvent({
                      type: "deplacement", match_id: m.id, start_at: m.kickoff,
                      title: `Déplacement ${m.home_team} – ${m.away_team}`, status: "prévu",
                    })}><path d="M3 17h18M5 17l1.5-6h11L19 17M8 11l1-4h6l1 4" /><circle cx="7.5" cy="19" r="1.5" /><circle cx="16.5" cy="19" r="1.5" /></IconButton>
                    <IconButton title="Prévoir une publication" onClick={() => setEditEvent({
                      type: "publication", match_id: m.id, start_at: new Date(new Date(m.kickoff).getTime() + 86400000).toISOString(),
                      title: `Publication ${m.home_team} – ${m.away_team}`, status: "idée",
                    })}><path d="M4 13V9l12-5v14L4 13Z" /><path d="M8 14v4a2 2 0 0 0 4 0v-2.5" /></IconButton>
                  </span>
                </div>
              );
            })}
          </section>
        ))}
      </div>

      {editMatch && <MatchForm match={editMatch} clubs={clubs} onClose={() => { setEditMatch(null); load(); }} onSaved={() => { setEditMatch(null); load(); }} />}
      {editEvent && <EventForm event={editEvent} onClose={() => setEditEvent(null)} onSaved={() => { setEditEvent(null); load(); }} />}
    </>
  );
}
