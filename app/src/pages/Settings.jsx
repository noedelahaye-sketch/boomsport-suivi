import { useEffect, useState } from "react";
import { supabase } from "../supabase.js";
import { authErrorMessage, fmtDate, useTable } from "../lib.js";

function PasswordForm() {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (pw.length < 6) return setMsg({ error: true, text: "Mot de passe trop court : 6 caractères minimum." });
    if (pw !== pw2) return setMsg({ error: true, text: "Les deux mots de passe ne correspondent pas." });
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setMsg({ error: true, text: authErrorMessage(error) });
    setPw(""); setPw2("");
    setMsg({ error: false, text: "Mot de passe enregistré. Tu peux maintenant te connecter avec ton email et ce mot de passe." });
  };

  return (
    <section className="card">
      <h2>Mon mot de passe</h2>
      <p className="muted small">Avec un mot de passe, tu te connectes sans attendre d'email.</p>
      <form className="grid" onSubmit={submit}>
        <label className="field">
          <span>Nouveau mot de passe</span>
          <input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required />
        </label>
        <label className="field">
          <span>Confirmer</span>
          <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required />
        </label>
        <div className="wide"><button className="primary small" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer le mot de passe"}</button></div>
      </form>
      {msg && <p className={msg.error ? "error" : "ok small"}>{msg.text}</p>}
    </section>
  );
}

export default function Settings() {
  const [members, reload] = useTable("members", "*", "added_at");
  const [email, setEmail] = useState("");
  const [me, setMe] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.email ?? ""));
  }, []);

  const add = async (e) => {
    e.preventDefault();
    const { error } = await supabase.from("members").insert({ email: email.trim().toLowerCase() });
    if (error) return alert(error.message);
    setEmail("");
    reload();
  };
  const del = async (m) => {
    if (m.email === me) return alert("Tu ne peux pas te retirer toi-même.");
    if (!confirm(`Retirer l'accès de ${m.email} ?`)) return;
    const { error } = await supabase.from("members").delete().eq("email", m.email);
    if (error) alert(error.message); else reload();
  };
  return (
    <>
      <div className="page-head"><h1>Réglages</h1></div>

      <PasswordForm />

      <section className="card">
        <h2>Membres de l'équipe</h2>
        <p className="muted small">Seules ces adresses peuvent voir et modifier les données. Chacun se connecte avec un lien reçu par email.</p>
        <ul className="list">
          {members.map((m) => (
            <li key={m.email}>
              <b>{m.email}</b> {m.email === me && <span className="muted">(toi)</span>}
              <span className="muted small right">ajouté le {fmtDate(m.added_at, { day: "numeric", month: "short", year: "numeric" })}</span>
              {m.email !== me && <button className="icon" onClick={() => del(m)} aria-label="Retirer">✕</button>}
            </li>
          ))}
        </ul>
        <form className="inline" onSubmit={add}>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemple.com" />
          <button className="primary small">Ajouter</button>
        </form>
      </section>

      <section className="card">
        <h2>Matchs automatiques</h2>
        <p className="muted small">
          Le calendrier complet de la saison de chaque club suivi (championnat, coupes nationales, coupes d'Europe)
          est synchronisé deux fois par jour, gratuitement et sans clé (source FotMob, ESPN en secours).
          Les changements d'horaire, reports et annulations sont repris automatiquement ; un match qui disparaît du calendrier
          de son club est marqué « retiré ». Tu peux aussi lancer la mise à jour depuis la page « 14 jours ».
        </p>
      </section>
    </>
  );
}
