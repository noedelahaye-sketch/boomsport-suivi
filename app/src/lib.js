import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase.js";

export const CATEGORIES = {
  international: "International RDC",
  binational: "Binational",
  jeune_binational: "Jeune binational",
  autre_selection: "International étranger",
};

export const COUNTRIES = {
  FRA: "🇫🇷 France",
  BEL: "🇧🇪 Belgique",
  LUX: "🇱🇺 Luxembourg",
  GER: "🇩🇪 Allemagne",
  SUI: "🇨🇭 Suisse",
  ITA: "🇮🇹 Italie",
  ESP: "🇪🇸 Espagne",
  ENG: "🏴󠁧󠁢󠁥󠁮󠁧󠁿 Angleterre",
  NED: "🇳🇱 Pays-Bas",
  POR: "🇵🇹 Portugal",
  TUR: "🇹🇷 Turquie",
  SCO: "🏴󠁧󠁢󠁳󠁣󠁴󠁿 Écosse",
  GRE: "🇬🇷 Grèce",
  AUT: "🇦🇹 Autriche",
};

// Drapeau seul (le nom du pays reste dans les listes de filtres)
export const flag = (code) => (COUNTRIES[code] ?? "").split(" ")[0];

export const POSITIONS = { GK: "Gardien", DEF: "Défenseur", MIL: "Milieu", ATT: "Attaquant" };

export const ACCRED_STATUS = {
  a_demander: "À demander",
  demandee: "Demandée",
  accordee: "Accordée",
  refusee: "Refusée",
};

export const MATCH_STATUS = {
  prevu: "Prévu",
  reporte: "Reporté",
  annule: "Annulé",
  en_cours: "En cours",
  termine: "Terminé",
  retire: "Retiré du calendrier",
};

export const EVENT_TYPES = { deplacement: "Déplacement", publication: "Publication", autre: "Autre" };

export const EVENT_STATUS = {
  deplacement: ["prévu", "confirmé", "fait", "annulé"],
  publication: ["idée", "brouillon", "prêt", "publié"],
  autre: [],
};

export const CONTACT_ROLES = ["Agent", "Famille", "Presse club", "Presse ligue", "Joueur", "Autre"];

// Messages d'erreur de connexion compréhensibles
export function authErrorMessage(error, mode) {
  const code = error?.code ?? "";
  const msg = (error?.message ?? "").toLowerCase();
  if (code === "over_email_send_rate_limit" || msg.includes("rate limit")) {
    return "Trop de liens envoyés récemment (limite d'environ 2 emails par heure). Réessaie dans une heure, ou connecte-toi avec ton mot de passe si tu en as défini un.";
  }
  if (code === "invalid_credentials" || msg.includes("invalid login")) {
    return "Email ou mot de passe incorrect. Si tu n'as pas encore de mot de passe, connecte-toi avec « Lien par email », puis choisis-le dans Réglages.";
  }
  if (code === "email_not_confirmed") return "Adresse email pas encore confirmée : ouvre d'abord le lien reçu par email.";
  if (code === "weak_password" || msg.includes("password should be")) return "Mot de passe trop court : 6 caractères minimum.";
  if (code === "same_password") return "Ce mot de passe est identique à l'actuel.";
  if (msg.includes("fetch") || msg.includes("network")) return "Impossible de joindre le serveur. Vérifie ta connexion internet.";
  return `Une erreur est survenue${mode === "link" ? " lors de l'envoi du lien" : ""} : ${error?.message ?? "inconnue"}`;
}

export const fullName =(p) => [p?.first_name, p?.last_name].filter(Boolean).join(" ");

export function fmtDate(d, opts = { weekday: "short", day: "numeric", month: "short" }) {
  return new Date(d).toLocaleDateString("fr-FR", opts);
}
export function fmtTime(d) {
  return new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
export function age(birth) {
  if (!birth) return null;
  const b = new Date(birth);
  const n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--;
  return a;
}

// Champ date/heure local <-> ISO
export const toLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
export const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);

// Chargement d'une table avec rechargement manuel
export function useTable(table, select = "*", order = "created_at") {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    const { data, error } = await supabase.from(table).select(select).order(order);
    if (error) alert(error.message);
    setRows(data ?? []);
    setLoading(false);
  }, [table, select, order]);
  useEffect(() => { reload(); }, [reload]);
  return [rows, reload, loading];
}

// Enregistre (insert ou update) en nettoyant les champs vides
export async function save(table, row) {
  const clean = Object.fromEntries(
    Object.entries(row).filter(([k]) => !k.startsWith("_")).map(([k, v]) => [k, v === "" ? null : v])
  );
  const { id, ...rest } = clean;
  const q = id ? supabase.from(table).update(rest).eq("id", id) : supabase.from(table).insert(rest);
  const { error } = await q;
  if (error) { alert(error.message); return false; }
  return true;
}

export async function remove(table, id, label = "cet élément") {
  if (!confirm(`Supprimer ${label} ?`)) return false;
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) { alert(error.message); return false; }
  return true;
}
