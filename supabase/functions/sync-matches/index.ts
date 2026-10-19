// Synchronise le calendrier complet de la saison des clubs suivis (gratuit, sans clé) :
// - FotMob (source principale) : toutes compétitions (championnat, coupes, coupes d'Europe), tous pays
// - ESPN (secours) si FotMob ne répond pas pour un club
// Gère les changements d'horaire, les reports, les annulations et les scores.
// Chaque appel traite un lot de clubs, en commençant par ceux synchronisés il y a le plus longtemps.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const FOTMOB = "https://www.fotmob.com/api/data";
const ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const KEEP_PAST_DAYS = 7;
const BATCH_SIZE = 40;          // clubs traités par appel (la fonction est limitée en durée)
const TIME_BUDGET_MS = 100_000;

// Championnats ESPN à essayer selon le pays du club (secours uniquement)
const ESPN_LEAGUES: Record<string, string[]> = {
  FRA: ["fra.1", "fra.2"], MON: ["fra.1"], BEL: ["bel.1"], GER: ["ger.1", "ger.2"],
  ESP: ["esp.1", "esp.2"], ITA: ["ita.1", "ita.2"], SUI: [], LUX: [],
};
const ESPN_CUPS = ["uefa.champions", "uefa.europa", "uefa.europa.conf"];

const STOPWORDS = new Set([
  "fc", "ac", "sc", "rc", "cf", "cd", "rcd", "osc", "losc", "sv", "as", "hsc", "krc", "rsc", "kv", "kaa",
  "rfc", "de", "club", "racing", "1901", "29", "afc", "ssc", "us", "ogc", "royal", "f91", "stade",
  "sm", "af", "sfc", "ea", "fco", "sco", "usl", "fcv", "raal", "ud", "sd", "ssd", "asd", "sl", "cs", "bsc", "vfl",
  "vfb", "fsv", "sk", "kas", "ksc", "pec", "scr", "rkvv", "calcio", "football", "foot", "aj", "r",
]);
const ALIASES: Record<string, string> = { breme: "bremen", brestois: "brest", rennais: "rennes" };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

function tokens(name: string): string[] {
  return name
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase().replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/).filter(Boolean)
    .map((t) => ALIASES[t] ?? t)
    .filter((t) => !STOPWORDS.has(t));
}

// 2 = noms identiques, 1 = un nom contient l'autre, 0 = différent
function nameScore(ours: string, theirs: string): number {
  const a = tokens(ours), b = tokens(theirs);
  if (!a.length || !b.length) return 0;
  const inB = a.every((t) => b.includes(t));
  const inA = b.every((t) => a.includes(t));
  return inA && inB ? 2 : inA || inB ? 1 : 0;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

async function getJson(url: string) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (BoomsportRDC suivi)", Accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

// ---------- FotMob ----------

// Équipes FotMob candidates, de la plus proche à la moins proche
async function findFotmobCandidates(club: any): Promise<string[]> {
  const name = club.search_name || club.name;
  // Plusieurs essais : nom simplifié, nom complet, puis mot le plus distinctif (« SM Caen » → « caen »)
  const longest = [...tokens(name)].filter((t) => !/^\d+$/.test(t)).sort((a, b) => b.length - a.length)[0];
  const terms = [...new Set([tokens(name).join(" "), name, longest].filter(Boolean))];
  const scores = new Map<string, number>();
  for (const term of terms) {
    const d = await getJson(`${FOTMOB}/search/suggest?term=${encodeURIComponent(term)}`);
    for (const group of d ?? []) {
      for (const s of group.suggestions ?? []) {
        if (s.type !== "team" || /\(W\)/.test(s.name)) continue;
        const score = nameScore(name, s.name);
        if (score > (scores.get(String(s.id)) ?? 0)) scores.set(String(s.id), score);
      }
    }
    if ([...scores.values()].includes(2)) break;
  }
  return [...scores.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

function fotmobStatus(s: any): string {
  const key = `${s?.reason?.longKey ?? ""} ${s?.reason?.short ?? ""}`.toLowerCase();
  if (key.includes("postpon")) return "reporte";
  if (s?.cancelled) return "annule";
  if (s?.finished) return "termine";
  if (s?.started) return "en_cours";
  return "prevu";
}

async function fotmobMatches(club: any) {
  const d = await getJson(`${FOTMOB}/teams?id=${club.fotmob_team_id}&ccode3=FRA`);
  const list = d?.fixtures?.allFixtures?.fixtures;
  if (!Array.isArray(list)) throw new Error("réponse FotMob inattendue");
  // Évite les homonymes d'un autre pays (Monaco joue en France)
  const expected = club.country === "MON" ? "FRA" : club.country;
  if (d.details?.country && d.details.country !== expected) throw new Error(`pays ${d.details.country} au lieu de ${expected}`);
  if (d.details?.primaryLeagueName) club.league = d.details.primaryLeagueName;
  return list
    .filter((m: any) => !/friendl/i.test(m.tournament?.name ?? ""))
    .map((m: any) => ({
      external_id: `fotmob:${m.id}`,
      kickoff: m.status.utcTime,
      competition: m.tournament?.name ?? null,
      home_team: m.home.name,
      away_team: m.away.name,
      _home_ext: String(m.home.id),
      _away_ext: String(m.away.id),
      status: fotmobStatus(m.status),
      date_tbd: !!(m.status.matchDateTbd || m.status.matchTimeTbd),
      score: m.status.scoreStr ?? null,
      venue: null,
      source: "fotmob",
    }));
}

// ---------- ESPN (secours) ----------

const espnTeamCache = new Map<string, { id: string; name: string }[]>();
async function espnTeams(slug: string) {
  if (!espnTeamCache.has(slug)) {
    const d = await getJson(`${ESPN}/${slug}/teams`).catch(() => null);
    const teams = d?.sports?.[0]?.leagues?.[0]?.teams ?? [];
    espnTeamCache.set(slug, teams.map((t: any) => ({ id: t.team.id, name: t.team.displayName })));
  }
  return espnTeamCache.get(slug)!;
}

function espnStatus(t: any): string {
  const name = t?.name ?? "";
  if (name.includes("POSTPONED")) return "reporte";
  if (name.includes("CANCEL") || name.includes("ABANDON")) return "annule";
  if (t?.completed) return "termine";
  if (t?.state === "in") return "en_cours";
  return "prevu";
}

async function espnMatches(club: any) {
  if (!club.espn_team_id) {
    let best: { id: string; slug: string; score: number } | null = null;
    for (const slug of ESPN_LEAGUES[club.country] ?? []) {
      for (const t of await espnTeams(slug)) {
        const score = nameScore(club.search_name || club.name, t.name);
        if (score === 2) best = { id: t.id, slug, score }; // secours : nom identique exigé
      }
    }
    if (!best) throw new Error("club introuvable");
    club.espn_team_id = best.id;
    club.espn_league = best.slug;
    club._dirty = true;
  }
  const slugs = [club.espn_league];
  for (const cup of ESPN_CUPS) if ((await espnTeams(cup)).some((t) => t.id === club.espn_team_id)) slugs.push(cup);
  const out: any[] = [];
  for (const slug of slugs) {
    const d = await getJson(`${ESPN}/${slug}/teams/${club.espn_team_id}/schedule?fixture=true`);
    for (const e of d.events ?? []) {
      const comp = e.competitions?.[0];
      const home = comp?.competitors?.find((c: any) => c.homeAway === "home");
      const away = comp?.competitors?.find((c: any) => c.homeAway === "away");
      if (!home || !away) continue;
      out.push({
        external_id: `espn:${e.id}`,
        kickoff: e.date,
        competition: e.league?.name ?? null,
        home_team: home.team.displayName,
        away_team: away.team.displayName,
        _home_ext: home.team.id,
        _away_ext: away.team.id,
        status: espnStatus(comp?.status?.type),
        date_tbd: e.timeValid === false,
        score: null,
        venue: comp?.venue?.fullName ?? null,
        source: "espn",
      });
    }
  }
  return out;
}

// ---------- Synchronisation ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Autorisé : la tâche planifiée (secret) ou un membre connecté
  const { data: cfg } = await admin.from("app_config").select("key,value");
  const config = Object.fromEntries((cfg ?? []).map((r) => [r.key, r.value]));
  if (req.headers.get("x-cron-secret") !== config.cron_secret) {
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: isMember } = await userClient.rpc("is_member");
    if (!isMember) return json({ error: "Non autorisé" }, 401);
  }

  const runAt = new Date().toISOString();
  const since = Date.now() - KEEP_PAST_DAYS * 86400000;
  const body = await req.json().catch(() => ({}));
  const batch = Math.min(Number(body.batch) || BATCH_SIZE, 200);

  // Tous les clubs servent à relier les matchs ; seuls les plus anciennement synchronisés sont traités
  const { data: allClubs } = await admin.from("clubs").select("*");
  const clubs = (allClubs ?? [])
    .filter((c) => c.auto_sync)
    .sort((a, b) => (a.last_synced_at ?? "").localeCompare(b.last_synced_at ?? ""))
    .slice(0, batch);
  const byFotmob = new Map((allClubs ?? []).filter((c) => c.fotmob_team_id).map((c) => [String(c.fotmob_team_id), c.id]));
  const byEspn = new Map((allClubs ?? []).filter((c) => c.espn_team_id).map((c) => [String(c.espn_team_id), c.id]));

  const matches = new Map<string, any>();
  const errors: string[] = [];
  const synced: string[] = [];    // clubs dont le calendrier a bien été récupéré
  const started = Date.now();

  for (const club of clubs) {
    if (Date.now() - started > TIME_BUDGET_MS) break; // on s'arrête avant la limite de temps
    let list: any[] | null = null;
    try {
      if (club.fotmob_team_id) {
        list = await fotmobMatches(club);
      } else {
        // Recherche retentée à chaque passage, y compris pour les clubs passés par ESPN
        for (const id of await findFotmobCandidates(club)) {
          club.fotmob_team_id = id;
          try { list = await fotmobMatches(club); break; } catch { club.fotmob_team_id = null; }
        }
        if (club.fotmob_team_id) byFotmob.set(club.fotmob_team_id, club.id);
      }
    } catch (err) {
      errors.push(`${club.name} (FotMob) : ${(err as Error).message}`);
    }
    if (!list) {
      try {
        list = await espnMatches(club);
        byEspn.set(club.espn_team_id, club.id);
      } catch (err) {
        errors.push(`${club.name} (ESPN) : ${(err as Error).message}`);
      }
    }
    // Club introuvable dans les deux sources : on arrête de le chercher (réactivable dans sa fiche)
    const notFound = !list && !club.fotmob_team_id && !club.espn_team_id;
    await admin.from("clubs").update({
      fotmob_team_id: club.fotmob_team_id, espn_team_id: club.espn_team_id, espn_league: club.espn_league,
      league: club.league, last_synced_at: runAt, ...(notFound ? { auto_sync: false } : {}),
    }).eq("id", club.id);
    if (!list) continue;

    synced.push(club.id);
    for (const m of list) {
      if (new Date(m.kickoff).getTime() < since) continue;
      // Les deux équipes sont reliées aux clubs suivis, même s'ils sont traités dans un autre lot
      const ids = m.source === "espn" ? byEspn : byFotmob;
      matches.set(m.external_id, { ...m, home_club_id: ids.get(m._home_ext) ?? null, away_club_id: ids.get(m._away_ext) ?? null });
    }
  }

  // Identifiants FotMob des deux équipes : servent à afficher leurs logos
  const rows = [...matches.values()].map(({ _home_ext, _away_ext, ...r }) => ({
    ...r,
    home_ext_id: r.source === "fotmob" ? _home_ext : null,
    away_ext_id: r.source === "fotmob" ? _away_ext : null,
    last_synced_at: runAt,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin.from("matches").upsert(rows.slice(i, i + 500), { onConflict: "external_id" });
    if (error) errors.push(error.message);
  }

  // Matchs à venir qui ont disparu du calendrier de leur club : marqués « retiré »
  let removed = 0;
  if (synced.length) {
    const ids = `(${synced.join(",")})`;
    const { data } = await admin.from("matches")
      .update({ status: "retire" })
      .neq("source", "manuel")
      .neq("status", "retire")
      .gt("kickoff", runAt)
      .lt("last_synced_at", runAt)
      .or(`home_club_id.in.${ids},away_club_id.in.${ids}`)
      .select("id");
    removed = data?.length ?? 0;
  }

  // Clubs jamais synchronisés (les autres sont remis à jour automatiquement toutes les heures)
  const done = new Set(clubs.map((c) => c.id));
  const remaining = (allClubs ?? []).filter((c) => c.auto_sync && !c.last_synced_at && !done.has(c.id)).length;
  return json({ saved: rows.length, removed, clubs: synced.length, remaining, errors });
});
