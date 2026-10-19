// Met à jour, pour chaque joueur suivi, son nombre de matchs en équipe première (source FotMob)
// et en déduit sa catégorie : « Jeunes » (moins de 23 ans, jamais joué en pro), « Pépites » (moins de 21 ans), « Binationaux ».
// Les internationaux RDC et les internationaux étrangers ne sont jamais reclassés automatiquement.
// Chaque appel traite un lot de joueurs, en commençant par ceux vérifiés il y a le plus longtemps.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const FOTMOB = "https://www.fotmob.com/api/data";
const BATCH_SIZE = 40;
const TIME_BUDGET_MS = 100_000;
const AUTO_CATEGORIES = ["binational", "jeune_binational", "jeune"];
// Équipes réserves et de jeunes : leurs matchs ne comptent pas comme « pro »
const RESERVE = /(\bB$|\bII$|\bU\d{2}\b|\bJong\b|Futures|Reserves?\b|Youth|Academy|Next Gen|Primavera|Espoirs|\(W\))/i;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function getJson(url: string) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (BoomsportRDC suivi)", Accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

const norm = (s: string) => (s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
// Même joueur si le nom de famille et (s'il existe) le prénom se retrouvent dans l'autre nom
function sameName(p: any, fotmobName: string) {
  const f = norm(fotmobName);
  const last = norm(p.last_name);
  const first = norm(p.first_name ?? "");
  if (!last.length || !last.every((t) => f.includes(t))) return false;
  return !first.length || first.some((t) => f.includes(t)) || f.length === last.length;
}

function age(birth: string | null) {
  if (!birth) return null;
  const b = new Date(birth), n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--;
  return a;
}

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

  const body = await req.json().catch(() => ({}));
  const batch = Math.min(Number(body.batch) || BATCH_SIZE, 150);
  const { data: players } = await admin.from("players")
    .select("id, first_name, last_name, birth_date, category, fotmob_player_id, pro_checked_at, club:clubs(id, name, fotmob_team_id)")
    .order("pro_checked_at", { ascending: true, nullsFirst: true })
    .limit(batch);

  const squads = new Map<string, { id: string; name: string }[]>();
  const squadOf = async (teamId: string) => {
    if (!squads.has(teamId)) {
      const d = await getJson(`${FOTMOB}/teams?id=${teamId}&ccode3=FRA`).catch(() => null);
      const members = (d?.squad?.squad ?? []).flatMap((g: any) => g.members ?? []).map((m: any) => ({ id: String(m.id), name: m.name }));
      squads.set(teamId, members);
    }
    return squads.get(teamId)!;
  };

  const started = Date.now();
  const report = { checked: 0, notFound: [] as string[], recategorized: [] as string[], errors: [] as string[] };

  for (const p of players ?? []) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    const label = `${p.first_name ?? ""} ${p.last_name}`.trim();
    try {
      let fid = p.fotmob_player_id;
      // 1. Dans l'effectif pro du club, puis 2. par la recherche FotMob
      if (!fid && p.club?.fotmob_team_id) fid = (await squadOf(p.club.fotmob_team_id)).find((m) => sameName(p, m.name))?.id ?? null;
      if (!fid) {
        const d = await getJson(`${FOTMOB}/search/suggest?term=${encodeURIComponent(label)}`).catch(() => []);
        const hits = (d ?? []).flatMap((g: any) => g.suggestions ?? []).filter((s: any) => s.type === "player" && sameName(p, s.name));
        // On n'accepte un résultat que s'il est rattaché au club du joueur ou à l'une de ses équipes de jeunes (évite les homonymes)
        const clubWords = norm(p.club?.name ?? "").filter((t) => t.length > 3);
        const hit = hits.find((s: any) => String(s.teamId) === String(p.club?.fotmob_team_id))
          ?? hits.find((s: any) => clubWords.some((t) => norm(s.teamName ?? "").includes(t)));
        fid = hit ? String(hit.id) : null;
      }

      let proApps: number | null = null, proAppsClub: number | null = null;
      if (fid) {
        const d = await getJson(`${FOTMOB}/playerData?id=${fid}`);
        const entries = d?.careerHistory?.careerItems?.senior?.teamEntries ?? [];
        const firstTeams = entries.filter((e: any) => !RESERVE.test(e.team ?? ""));
        proApps = firstTeams.reduce((n: number, e: any) => n + (parseInt(e.appearances) || 0), 0);
        proAppsClub = firstTeams.filter((e: any) => String(e.teamId) === String(p.club?.fotmob_team_id))
          .reduce((n: number, e: any) => n + (parseInt(e.appearances) || 0), 0);
      } else {
        report.notFound.push(label);
      }
      // Moins de 21 ans et introuvable sur FotMob (qui couvre les championnats pros) : jamais joué en pro
      const a = age(p.birth_date);
      if (proApps === null && a !== null && a < 21) proApps = 0;

      // Catégorie automatique (sauf internationaux RDC et internationaux étrangers)
      const update: Record<string, unknown> = { fotmob_player_id: fid, pro_apps: proApps, pro_apps_club: proAppsClub, pro_checked_at: new Date().toISOString() };
      if (AUTO_CATEGORIES.includes(p.category) && proApps !== null) {
        // « Jeune » seulement avant 23 ans : pour un adulte, 0 match signifie plutôt une donnée manquante
        // (FotMob ne compte pas les matchs de certains petits championnats)
        const neverPro = proApps === 0 && (a === null || a < 23);
        const cat = neverPro ? "jeune" : a !== null && a < 21 && proApps > 0 ? "jeune_binational" : "binational";
        if (cat !== p.category) { update.category = cat; report.recategorized.push(`${label} → ${cat}`); }
      } else if (p.category === "jeune_binational" && a !== null && a >= 21) {
        // Les pépites ont moins de 21 ans, même sans donnée de matchs
        update.category = "binational"; report.recategorized.push(`${label} → binational`);
      }
      await admin.from("players").update(update).eq("id", p.id);
      report.checked++;
    } catch (err) {
      report.errors.push(`${label} : ${(err as Error).message}`);
      await admin.from("players").update({ pro_checked_at: new Date().toISOString() }).eq("id", p.id);
    }
  }
  return json(report);
});
