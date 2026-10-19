import { useEffect, useRef, useState } from "react";

// Fenêtres ouvertes, la dernière est au premier plan (Échap ne ferme qu'elle)
const openModals = [];

export function Modal({ title, onClose, children, footer, actions }) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const token = {};
    openModals.push(token);
    const onKey = (e) => e.key === "Escape" && openModals.at(-1) === token && close.current();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      openModals.splice(openModals.indexOf(token), 1);
    };
  }, []);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <div className="modal-actions">
            {actions}
            <button className="icon" onClick={onClose} aria-label="Fermer">✕</button>
          </div>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}

// Champ de formulaire lié à un objet `value` / `onChange(patch)`
export function Field({ label, name, value, onChange, type = "text", options, wide, placeholder, required }) {
  const v = value[name] ?? "";
  const set = (val) => onChange({ ...value, [name]: val });
  let input;
  if (options) {
    const entries = Array.isArray(options) ? options.map((o) => [o, o]) : Object.entries(options);
    input = (
      <select value={v} onChange={(e) => set(e.target.value)} required={required}>
        <option value="">—</option>
        {entries.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
    );
  } else if (type === "textarea") {
    input = <textarea rows={3} value={v} onChange={(e) => set(e.target.value)} placeholder={placeholder} />;
  } else if (type === "checkbox") {
    return (
      <label className="field check">
        <input type="checkbox" checked={!!value[name]} onChange={(e) => set(e.target.checked)} /> {label}
      </label>
    );
  } else {
    input = <input type={type} value={v} onChange={(e) => set(e.target.value)} placeholder={placeholder} required={required} />;
  }
  return (
    <label className={"field" + (wide ? " wide" : "")}>
      <span>{label}{required && " *"}</span>
      {input}
    </label>
  );
}

export function Badge({ kind, children }) {
  return <span className={`badge badge-${kind}`}>{children}</span>;
}

export function Empty({ children }) {
  return <p className="empty">{children}</p>;
}

// Bouton icône « modifier »
export function EditButton({ onClick }) {
  return (
    <button className="icon edit" onClick={onClick} title="Modifier" aria-label="Modifier">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    </button>
  );
}

// Bouton icône « supprimer »
export function DeleteButton({ onClick, title = "Supprimer" }) {
  return (
    <button className="icon delete" onClick={onClick} title={title} aria-label={title}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" />
      </svg>
    </button>
  );
}

// Ligne « libellé : valeur » d'une fiche en lecture seule (masquée si vide)
export function Info({ label, children }) {
  if (children == null || children === "" || children === false) return null;
  return (
    <div className="info">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

// Bouton icône seul (le libellé est donné par `title`, lu par les lecteurs d'écran)
export function IconButton({ title, onClick, disabled, spin, children }) {
  return (
    <button className={"icon-btn" + (spin ? " spin" : "")} onClick={onClick} disabled={disabled} title={title} aria-label={title}>
      <svg viewBox="0 0 24 24" aria-hidden="true">{children}</svg>
    </button>
  );
}

// Logo d'un club (images FotMob). Rien n'est affiché sans identifiant ou si l'image manque.
export function ClubLogo({ id, size = 20 }) {
  const [broken, setBroken] = useState(false);
  if (!id || broken) return null;
  return (
    <img className="club-logo" src={`https://images.fotmob.com/image_resources/logo/teamlogo/${id}_small.png`}
      width={size} height={size} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} />
  );
}
