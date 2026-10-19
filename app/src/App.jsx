import { useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import { authErrorMessage } from "./lib.js";
import Upcoming from "./pages/Upcoming.jsx";
import Players from "./pages/Players.jsx";
import Clubs from "./pages/Clubs.jsx";
import Contacts from "./pages/Contacts.jsx";
import Calendar from "./pages/Calendar.jsx";
import Settings from "./pages/Settings.jsx";

// Icônes (tracés type Lucide) pour la navigation
const ICONS = {
  quinzaine: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  joueurs: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7" /><path d="M18 14.5a6.5 6.5 0 0 1 3.5 5.5" /></>,
  clubs: <><path d="M12 3 4 6v5c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6z" /></>,
  contacts: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="11" r="2.5" /><path d="M5.5 17a3.5 3.5 0 0 1 7 0" /><path d="M15 10h3M15 14h3" /></>,
  calendrier: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  reglages: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
};

const TABS = {
  quinzaine: ["14 jours", Upcoming],
  joueurs: ["Joueurs", Players],
  clubs: ["Clubs", Clubs],
  contacts: ["Contacts", Contacts],
  calendrier: ["Calendrier", Calendar],
  reglages: ["Réglages", Settings],
};

// Logo : l'étoile du drapeau de la RDC
function Brand({ big }) {
  return (
    <div className={"brand" + (big ? " big" : "")}>
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M12 2.5l2.4 6.3 6.8.3-5.3 4.2 1.8 6.6L12 16.1l-5.7 3.8 1.8-6.6-5.3-4.2 6.8-.3z" /></svg>
      </span>
      <span className="brand-text">
        <span className="brand-name">Léopards</span>
        <span className="brand-sub">Suivi · BoomsportRDC</span>
      </span>
    </div>
  );
}

function LoginLayout({ children }) {
  return (
    <div className="login">
      <section className="login-hero">
        <Brand big />
        <div>
          <h1>Tous les Léopards, partout en Europe</h1>
          <p>Joueurs, contacts, matchs et déplacements de l'équipe BoomsportRDC, au même endroit.</p>
        </div>
      </section>
      <div className="login-side">{children}</div>
    </div>
  );
}

function useHashTab() {
  const read = () => (location.hash.slice(1) in TABS ? location.hash.slice(1) : "quinzaine");
  const [tab, setTab] = useState(read);
  useEffect(() => {
    const on = () => setTab(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return tab;
}

function Login() {
  const [mode, setMode] = useState("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = mode === "password"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
    setBusy(false);
    if (error) setError(authErrorMessage(error, mode));
    else if (mode === "link") setSent(true);
  };
  const switchMode = (m) => { setMode(m); setError(""); setSent(false); };

  return (
    <LoginLayout>
      <div className="login-card">
        <h2>Connexion</h2>
        <p className="muted small">Espace privé de l'équipe.</p>
        <div className="chips login-modes">
          <button type="button" className={mode === "password" ? "chip on" : "chip"} onClick={() => switchMode("password")}>Mot de passe</button>
          <button type="button" className={mode === "link" ? "chip on" : "chip"} onClick={() => switchMode("link")}>Lien par email</button>
        </div>
        {sent ? (
          <p>Un lien de connexion a été envoyé à <b>{email}</b>. Ouvre-le depuis ce navigateur.</p>
        ) : (
          <form onSubmit={submit}>
            <label className="field">
              <span>Email</span>
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom@exemple.com" />
            </label>
            {mode === "password" && (
              <label className="field">
                <span>Mot de passe</span>
                <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </label>
            )}
            {error && <p className="error">{error}</p>}
            <button className="primary" disabled={busy}>
              {busy ? "Patiente…" : mode === "password" ? "Se connecter" : "Recevoir un lien de connexion"}
            </button>
            {mode === "password" && (
              <p className="muted small">
                Première connexion ? Utilise « Lien par email », puis choisis ton mot de passe dans Réglages.
              </p>
            )}
          </form>
        )}
      </div>
    </LoginLayout>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined);
  const [member, setMember] = useState(undefined);
  const tab = useHashTab();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setMember(undefined); return; }
    supabase.rpc("is_member").then(({ data }) => setMember(!!data));
  }, [session]);

  if (session === undefined) return null;
  if (!session) return <Login />;
  if (member === undefined) return null;
  if (!member) {
    return (
      <LoginLayout>
        <div className="login-card">
          <h2>Accès non autorisé</h2>
          <p><b>{session.user.email}</b> n'est pas encore membre. Demande à un membre de t'ajouter dans Réglages.</p>
          <button onClick={() => supabase.auth.signOut()}>Se déconnecter</button>
        </div>
      </LoginLayout>
    );
  }

  const Page = TABS[tab][1];
  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand />
        <nav className="nav" aria-label="Navigation principale">
          {Object.entries(TABS).map(([k, [label]]) => (
            <a key={k} href={"#" + k} className={k === tab ? "active" : ""} aria-current={k === tab ? "page" : undefined} title={label}>
              <svg viewBox="0 0 24 24" aria-hidden="true">{ICONS[k]}</svg><span>{label}</span>
            </a>
          ))}
        </nav>
        <button className="nav-logout" onClick={() => supabase.auth.signOut()} title={`Déconnexion (${session.user.email})`}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
          <span>Déconnexion</span>
        </button>
      </aside>
      <main><Page /></main>
    </div>
  );
}
