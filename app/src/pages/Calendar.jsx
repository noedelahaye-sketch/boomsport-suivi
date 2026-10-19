import { useCallback, useEffect, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import frLocale from "@fullcalendar/core/locales/fr";
import { supabase } from "../supabase.js";
import { CATEGORIES, EVENT_STATUS, EVENT_TYPES, MATCH_STATUS, fmtDate, fmtTime, fromLocalInput, fullName, remove, save, toLocalInput, useTable } from "../lib.js";
import { Field, Modal } from "../ui.jsx";

const PLATFORMS = ["Instagram", "TikTok", "YouTube", "X", "Facebook", "Site web", "Autre"];

export function EventForm({ event, onClose, onSaved }) {
  const [e, setE] = useState({ ...event, _start: toLocalInput(event.start_at), _end: toLocalInput(event.end_at) });
  const [players] = useTable("players", "id,first_name,last_name", "last_name");
  const [matches, setMatches] = useState([]);

  useEffect(() => {
    const from = new Date(Date.now() - 7 * 86400000).toISOString();
    supabase.from("matches").select("id,kickoff,home_team,away_team").gte("kickoff", from).order("kickoff").limit(300)
      .then(({ data }) => setMatches(data ?? []));
  }, []);

  const submit = async (ev) => {
    ev.preventDefault();
    const { _start, _end, match, player, ...row } = e;
    row.start_at = fromLocalInput(_start);
    row.end_at = fromLocalInput(_end);
    if (await save("events", row)) onSaved();
  };
  const del = async () => { if (await remove("events", e.id, e.title)) onSaved(); };

  return (
    <Modal
      title={e.id ? e.title : `Nouveau : ${EVENT_TYPES[e.type ?? "autre"].toLowerCase()}`}
      onClose={onClose}
      footer={<>
        {e.id && <button className="danger ghost" onClick={del}>Supprimer</button>}
        <span className="spacer" />
        <button onClick={onClose}>Annuler</button>
        <button className="primary" form="event-form">Enregistrer</button>
      </>}
    >
      <form id="event-form" className="grid" onSubmit={submit}>
        <Field label="Type" name="type" value={e} onChange={setE} options={EVENT_TYPES} required />
        <Field label="Statut" name="status" value={e} onChange={setE} options={EVENT_STATUS[e.type] ?? []} />
        <Field label="Titre" name="title" value={e} onChange={setE} wide required />
        <Field label="Début" name="_start" type="datetime-local" value={e} onChange={setE} required />
        <Field label="Fin" name="_end" type="datetime-local" value={e} onChange={setE} />
        <Field label="Match lié" name="match_id" value={e} onChange={setE}
          options={Object.fromEntries(matches.map((m) => [m.id, `${fmtDate(m.kickoff)} · ${m.home_team} – ${m.away_team}`]))} />
        <Field label="Joueur lié" name="player_id" value={e} onChange={setE}
          options={Object.fromEntries(players.map((p) => [p.id, fullName(p)]))} />
        {e.type === "publication" && <Field label="Plateforme" name="platform" value={e} onChange={setE} options={PLATFORMS} />}
        {e.type === "deplacement" && <>
          <Field label="Qui y va" name="people" value={e} onChange={setE} placeholder="Noms" />
          <Field label="Transport / hébergement" name="transport" value={e} onChange={setE} placeholder="TGV 8h12, hôtel…" />
        </>}
        <Field label="Notes" name="notes" type="textarea" value={e} onChange={setE} wide />
      </form>
    </Modal>
  );
}

// Couleurs de l'identité : matchs en « nuit », déplacements en bleu RDC, publications en jaune
const COLORS = { match: "#13213a", deplacement: "#0a6cd6", publication: "#f7d618", autre: "#5b6474" };
const TEXT_COLORS = { publication: "#0b1424" };

export default function Calendar() {
  const [events, setEvents] = useState([]);
  const [edit, setEdit] = useState(null);
  const [pickMatch, setPickMatch] = useState(null);
  const [show, setShow] = useState({ match: true, deplacement: true, publication: true, autre: true });
  const [matchCats, setMatchCats] = useState(["international"]);
  const range = useRef(null);

  const load = useCallback(async (r = range.current) => {
    if (!r) return;
    range.current = r;
    const [ev, ma, pl] = await Promise.all([
      supabase.from("events").select("*").gte("start_at", r.start.toISOString()).lte("start_at", r.end.toISOString()),
      supabase.from("matches").select("*").gte("kickoff", r.start.toISOString()).lte("kickoff", r.end.toISOString()).neq("status", "retire").limit(5000),
      supabase.from("players").select("id,last_name,club_id,category").limit(5000),
    ]);
    const byClub = {};
    for (const p of pl.data ?? []) if (p.club_id) (byClub[p.club_id] ??= []).push(p);
    setEvents([
      ...(ma.data ?? []).map((m) => {
        const players = [...(byClub[m.home_club_id] ?? []), ...(byClub[m.away_club_id] ?? [])];
        const names = players.map((p) => p.last_name);
        return {
          id: "m-" + m.id,
          title: `${m.status === "annule" ? "[Annulé] " : m.status === "reporte" ? "[Reporté] " : ""}${m.home_team} – ${m.away_team}${m.score ? ` (${m.score})` : ""}${names.length ? ` · ${names.join(", ")}` : ""}`,
          start: m.kickoff, allDay: m.date_tbd, color: ["annule", "reporte"].includes(m.status) ? "#c8102e" : COLORS.match,
          editable: false, extendedProps: { kind: "match", row: m, cats: players.map((p) => p.category) },
        };
      }),
      ...(ev.data ?? []).map((e) => ({
        id: e.id, title: e.title + (e.status ? ` · ${e.status}` : ""),
        start: e.start_at, end: e.end_at ?? undefined, color: COLORS[e.type], textColor: TEXT_COLORS[e.type], extendedProps: { kind: e.type, row: e },
      })),
    ]);
  }, []);

  const onDrop = async (info) => {
    const row = info.event.extendedProps.row;
    const ok = await save("events", {
      id: row.id,
      start_at: info.event.start.toISOString(),
      end_at: info.event.end ? info.event.end.toISOString() : row.end_at,
    });
    if (!ok) info.revert(); else load();
  };

  const reloadAfter = () => { setEdit(null); load(); };
  const visible = events.filter((e) => show[e.extendedProps.kind] &&
    (e.extendedProps.kind !== "match" || e.extendedProps.cats.some((c) => matchCats.includes(c))));

  return (
    <>
      <div className="page-head">
        <h1>Calendrier</h1>
        <div className="actions">
          <button onClick={() => setEdit({ type: "deplacement", start_at: new Date().toISOString(), status: "prévu" })}>+ Déplacement</button>
          <button className="primary" onClick={() => setEdit({ type: "publication", start_at: new Date().toISOString(), status: "idée" })}>+ Publication</button>
        </div>
      </div>
      <div className="chips">
        {[["match", "Matchs"], ["deplacement", "Déplacements"], ["publication", "Publications"], ["autre", "Autres"]].map(([k, l]) => (
          <button key={k} className={show[k] ? "chip on" : "chip"} onClick={() => setShow({ ...show, [k]: !show[k] })}>
            <span className="dot" style={{ background: COLORS[k] }} /> {l}
          </button>
        ))}
      </div>
      {show.match && (
        <div className="chips">
          <span className="muted small">Matchs des joueurs :</span>
          {Object.entries(CATEGORIES).map(([k, l]) => (
            <button key={k} className={matchCats.includes(k) ? "chip on" : "chip"}
              onClick={() => setMatchCats(matchCats.includes(k) ? matchCats.filter((c) => c !== k) : [...matchCats, k])}>{l}</button>
          ))}
        </div>
      )}
      <div className="calendar-card">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          locale={frLocale}
          initialView={window.innerWidth < 700 ? "listMonth" : "dayGridMonth"}
          headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,listMonth" }}
          height="auto"
          events={visible}
          editable
          dayMaxEvents={4}
          datesSet={(r) => load({ start: r.start, end: r.end })}
          eventDrop={onDrop}
          eventResize={onDrop}
          dateClick={(d) => {
            const start = new Date(d.date);
            if (d.allDay) start.setHours(10);
            setEdit({ type: "publication", start_at: start.toISOString(), status: "idée" });
          }}
          eventClick={(info) => {
            const { kind, row } = info.event.extendedProps;
            if (kind === "match") setPickMatch(row); else setEdit(row);
          }}
        />
      </div>

      {pickMatch && (
        <Modal title={`${pickMatch.home_team} – ${pickMatch.away_team}`} onClose={() => setPickMatch(null)}>
          <p className="muted">
            {pickMatch.competition} · {fmtDate(pickMatch.kickoff, { weekday: "long", day: "numeric", month: "long" })}
            {pickMatch.date_tbd ? " (horaire à confirmer)" : ` à ${fmtTime(pickMatch.kickoff)}`}
            {pickMatch.status !== "prevu" && ` · ${MATCH_STATUS[pickMatch.status]}`}{pickMatch.score ? ` · ${pickMatch.score}` : ""}
          </p>
          <div className="actions">
            <button className="primary" onClick={() => { setEdit({ type: "deplacement", match_id: pickMatch.id, start_at: pickMatch.kickoff, status: "prévu", title: `Déplacement ${pickMatch.home_team} – ${pickMatch.away_team}` }); setPickMatch(null); }}>+ Déplacement</button>
            <button onClick={() => { setEdit({ type: "publication", match_id: pickMatch.id, start_at: new Date(new Date(pickMatch.kickoff).getTime() + 86400000).toISOString(), status: "idée", title: `Publication ${pickMatch.home_team} – ${pickMatch.away_team}` }); setPickMatch(null); }}>+ Publication</button>
          </div>
        </Modal>
      )}
      {edit && <EventForm event={edit} onClose={() => setEdit(null)} onSaved={reloadAfter} />}
    </>
  );
}
