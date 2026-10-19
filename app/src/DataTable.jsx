// Tableau façon base Notion : vues enregistrées, filtres, tris, regroupement, colonnes visibles.
// Chaque colonne : { key, label, type: "text" | "select" | "number" | "date" | "bool",
//   get(row) → valeur brute (filtre, tri, regroupement), render(row) → affichage, options?: { valeur: libellé } }
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Empty } from "./ui.jsx";

const OPERATORS = {
  text: { contains: "contient", not_contains: "ne contient pas", is: "est", is_not: "n'est pas", empty: "est vide", not_empty: "n'est pas vide" },
  select: { in: "est", not_in: "n'est pas", empty: "est vide", not_empty: "n'est pas vide" },
  number: { eq: "=", neq: "≠", gt: ">", gte: "≥", lt: "<", lte: "≤", empty: "est vide", not_empty: "n'est pas vide" },
  date: { before: "avant le", after: "après le", on: "le", next_days: "dans les prochains jours", empty: "est vide", not_empty: "n'est pas vide" },
  bool: { checked: "est coché", unchecked: "n'est pas coché" },
};
const NO_VALUE = new Set(["empty", "not_empty", "checked", "unchecked"]);
const isEmpty = (v) => v == null || v === "" || (Array.isArray(v) && !v.length);
const norm = (v) => String(v ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const dayOf = (v) => (v ? new Date(v).toISOString().slice(0, 10) : "");

function matchRule(col, rule, row) {
  const v = col.get(row);
  const x = rule.value;
  switch (rule.op) {
    case "empty": return isEmpty(v);
    case "not_empty": return !isEmpty(v);
    case "checked": return !!v;
    case "unchecked": return !v;
    case "contains": return norm(v).includes(norm(x));
    case "not_contains": return !norm(v).includes(norm(x));
    case "is": return norm(v) === norm(x);
    case "is_not": return norm(v) !== norm(x);
    case "in": return !x?.length || x.includes(v ?? "");
    case "not_in": return !x?.includes(v ?? "");
    case "eq": return x === "" || Number(v) === Number(x);
    case "neq": return x === "" || Number(v) !== Number(x);
    case "gt": return x === "" || (v != null && Number(v) > Number(x));
    case "gte": return x === "" || (v != null && Number(v) >= Number(x));
    case "lt": return x === "" || (v != null && Number(v) < Number(x));
    case "lte": return x === "" || (v != null && Number(v) <= Number(x));
    case "before": return !x || (v && dayOf(v) < x);
    case "after": return !x || (v && dayOf(v) > x);
    case "on": return !x || (v && dayOf(v) === x);
    case "next_days": return !x || (v && new Date(v) >= new Date() && new Date(v) <= new Date(Date.now() + Number(x) * 86400000));
    default: return true;
  }
}

function compare(a, b, type) {
  if (isEmpty(a) && isEmpty(b)) return 0;
  if (isEmpty(a)) return 1; // les valeurs vides toujours en dernier
  if (isEmpty(b)) return -1;
  if (type === "number") return Number(a) - Number(b);
  if (type === "date") return new Date(a) - new Date(b);
  if (type === "bool") return (a ? 0 : 1) - (b ? 0 : 1);
  return String(a).localeCompare(String(b), "fr", { sensitivity: "base", numeric: true });
}

const EMPTY_STATE = { q: "", filters: [], conj: "and", sorts: [], group: "", hidden: [] };

function load(key) {
  try { return JSON.parse(localStorage.getItem(key)) ?? null; } catch { return null; }
}
function store(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* stockage indisponible : on ignore */ }
}

// Petit menu déroulant ancré sous un bouton, fermé au clic extérieur
export function Popover({ label, active, children, align = "left" }) {
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0);
  const ref = useRef(null);
  const panel = useRef(null);
  // Recale le menu pour qu'il reste dans l'écran (petits écrans)
  useLayoutEffect(() => {
    if (!open || !panel.current) return setShift(0);
    const r = panel.current.getBoundingClientRect();
    const margin = 8;
    if (r.right > window.innerWidth - margin) setShift((x) => x - (r.right - window.innerWidth + margin));
    else if (r.left < margin) setShift((x) => x + (margin - r.left));
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div className="popover-wrap" ref={ref}>
      <button className={"tool" + (active ? " active-tool" : "")} onClick={() => setOpen(!open)} aria-expanded={open}>{label}</button>
      {open && <div ref={panel} className={"popover " + align} style={{ transform: `translateX(${shift}px)` }}>{children}</div>}
    </div>
  );
}

function ValueInput({ col, rule, onChange }) {
  if (NO_VALUE.has(rule.op)) return null;
  if (col.type === "select") {
    const opts = col.options ?? {};
    const sel = rule.value ?? [];
    return (
      <div className="multi">
        {Object.entries(opts).map(([k, l]) => (
          <label key={k} className="check small">
            <input type="checkbox" checked={sel.includes(k)}
              onChange={(e) => onChange(e.target.checked ? [...sel, k] : sel.filter((s) => s !== k))} /> {l}
          </label>
        ))}
      </div>
    );
  }
  if (col.type === "date" && rule.op === "next_days") {
    return <input type="number" min="1" placeholder="jours" value={rule.value ?? ""} onChange={(e) => onChange(e.target.value)} />;
  }
  const type = col.type === "number" ? "number" : col.type === "date" ? "date" : "text";
  return <input type={type} placeholder="Valeur" value={rule.value ?? ""} onChange={(e) => onChange(e.target.value)} />;
}

export default function DataTable({ id, columns, rows, onRowClick, presets = [], defaultSort = [], searchKeys, emptyText }) {
  const storageKey = `datatable:${id}`;
  const saved = load(storageKey);
  const [views, setViews] = useState(saved?.views ?? []);
  const [viewName, setViewName] = useState(saved?.viewName ?? presets[0]?.name ?? "");
  const [state, setState] = useState(saved?.state ?? { ...EMPTY_STATE, sorts: defaultSort, ...presets[0]?.state });
  const [collapsed, setCollapsed] = useState({});

  useEffect(() => { store(storageKey, { views, viewName, state }); }, [storageKey, views, viewName, state]);

  const colByKey = useMemo(() => Object.fromEntries(columns.map((c) => [c.key, c])), [columns]);
  const visible = columns.filter((c) => !state.hidden.includes(c.key));
  const set = (patch) => setState((s) => ({ ...s, ...patch }));

  const allViews = [...presets.map((p) => ({ ...p, preset: true })), ...views];
  const applyView = (v) => { setViewName(v.name); setState({ ...EMPTY_STATE, sorts: defaultSort, ...v.state }); };
  const saveView = () => {
    const name = prompt("Nom de la vue :", viewName && !presets.some((p) => p.name === viewName) ? viewName : "");
    if (!name) return;
    setViews((vs) => [...vs.filter((v) => v.name !== name), { name, state }]);
    setViewName(name);
  };
  const deleteView = (name) => {
    if (!confirm(`Supprimer la vue « ${name} » ?`)) return;
    setViews((vs) => vs.filter((v) => v.name !== name));
    if (viewName === name) applyView(allViews[0] ?? { name: "", state: {} });
  };

  // Filtrage, recherche et tri
  const result = useMemo(() => {
    const q = norm(state.q);
    const rules = state.filters.filter((f) => colByKey[f.key]);
    let out = rows.filter((r) => {
      if (q && !norm((searchKeys ?? columns.map((c) => c.key)).map((k) => colByKey[k]?.get(r) ?? "").join(" ")).includes(q)) return false;
      if (!rules.length) return true;
      const ok = rules.map((f) => matchRule(colByKey[f.key], f, r));
      return state.conj === "or" ? ok.some(Boolean) : ok.every(Boolean);
    });
    const sorts = state.sorts.filter((s) => colByKey[s.key]);
    if (sorts.length) {
      out = [...out].sort((a, b) => {
        for (const s of sorts) {
          const c = colByKey[s.key];
          const d = compare(c.get(a), c.get(b), c.type);
          if (d) return s.dir === "desc" ? (isEmpty(c.get(a)) || isEmpty(c.get(b)) ? d : -d) : d;
        }
        return 0;
      });
    }
    return out;
  }, [rows, state, colByKey, columns, searchKeys]);

  // Regroupement
  const groups = useMemo(() => {
    const g = colByKey[state.group];
    if (!g) return [["", result]];
    const map = new Map();
    for (const r of result) {
      const v = g.get(r);
      const label = g.type === "bool" ? (v ? "Oui" : "Non") : isEmpty(v) ? "—" : (g.options?.[v] ?? String(v));
      if (!map.has(label)) map.set(label, []);
      map.get(label).push(r);
    }
    const order = g.options ? Object.values(g.options) : null;
    return [...map.entries()].sort(([a], [b]) =>
      a === "—" ? 1 : b === "—" ? -1 : order ? order.indexOf(a) - order.indexOf(b) : a.localeCompare(b, "fr"));
  }, [result, state.group, colByKey]);

  const headerSort = (key) => {
    const cur = state.sorts[0]?.key === key ? state.sorts[0].dir : null;
    const dir = cur === "asc" ? "desc" : cur === "desc" ? null : "asc";
    set({ sorts: dir ? [{ key, dir }] : [] });
  };

  const addFilter = () => {
    const c = columns.find((x) => x.filterable !== false) ?? columns[0];
    set({ filters: [...state.filters, { key: c.key, op: Object.keys(OPERATORS[c.type])[0], value: c.type === "select" ? [] : "" }] });
  };
  const updFilter = (i, patch) => set({ filters: state.filters.map((f, j) => (j === i ? { ...f, ...patch } : f)) });

  const groupable = columns.filter((c) => ["select", "bool", "text"].includes(c.type) && c.groupable !== false);

  return (
    <div className="datatable">
      <div className="dt-head">
        {allViews.length > 0 && (
          <div className="views">
            {allViews.map((v) => (
              <span key={v.name} className={"view-tab" + (v.name === viewName ? " on" : "")}>
                <button onClick={() => applyView(v)}>{v.name}</button>
                {!v.preset && <button className="view-del" title="Supprimer la vue" aria-label={`Supprimer la vue ${v.name}`} onClick={() => deleteView(v.name)}>×</button>}
              </span>
            ))}
            <button className="view-add" onClick={saveView} title="Enregistrer les filtres et tris actuels comme une vue" aria-label="Enregistrer la vue">+</button>
          </div>
        )}

        <div className="toolbar">
          <input type="search" className="compact" placeholder="Rechercher" value={state.q} onChange={(e) => set({ q: e.target.value })} />

          <Popover label={`Filtrer${state.filters.length ? ` · ${state.filters.length}` : ""}`} active={state.filters.length > 0} align="right">
          {state.filters.length > 1 && (
            <div className="conj">
              Afficher les lignes qui remplissent
              <select value={state.conj} onChange={(e) => set({ conj: e.target.value })}>
                <option value="and">toutes les conditions</option>
                <option value="or">au moins une condition</option>
              </select>
            </div>
          )}
          {state.filters.map((f, i) => {
            const col = colByKey[f.key] ?? columns[0];
            return (
              <div key={i} className="rule">
                <select value={f.key} onChange={(e) => {
                  const c = colByKey[e.target.value];
                  updFilter(i, { key: c.key, op: Object.keys(OPERATORS[c.type])[0], value: c.type === "select" ? [] : "" });
                }}>
                  {columns.filter((c) => c.filterable !== false).map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
                <select value={f.op} onChange={(e) => updFilter(i, { op: e.target.value })}>
                  {Object.entries(OPERATORS[col.type]).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <ValueInput col={col} rule={f} onChange={(value) => updFilter(i, { value })} />
                <button className="icon" title="Retirer" onClick={() => set({ filters: state.filters.filter((_, j) => j !== i) })}>✕</button>
              </div>
            );
          })}
          <div className="popover-foot">
            <button className="small" onClick={addFilter}>+ Ajouter un filtre</button>
            {state.filters.length > 0 && <button className="small ghost" onClick={() => set({ filters: [] })}>Tout effacer</button>}
          </div>
        </Popover>

        <Popover label={`Trier${state.sorts.length ? ` · ${state.sorts.length}` : ""}`} active={state.sorts.length > 0} align="right">
          {state.sorts.map((s, i) => (
            <div key={i} className="rule">
              <select value={s.key} onChange={(e) => set({ sorts: state.sorts.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)) })}>
                {columns.filter((c) => c.sortable !== false).map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
              <select value={s.dir} onChange={(e) => set({ sorts: state.sorts.map((x, j) => (j === i ? { ...x, dir: e.target.value } : x)) })}>
                <option value="asc">Croissant</option>
                <option value="desc">Décroissant</option>
              </select>
              <button className="icon" title="Retirer" onClick={() => set({ sorts: state.sorts.filter((_, j) => j !== i) })}>✕</button>
            </div>
          ))}
          <div className="popover-foot">
            <button className="small" onClick={() => set({ sorts: [...state.sorts, { key: columns.find((c) => c.sortable !== false).key, dir: "asc" }] })}>+ Ajouter un tri</button>
            {state.sorts.length > 0 && <button className="small ghost" onClick={() => set({ sorts: [] })}>Tout effacer</button>}
          </div>
        </Popover>

        <Popover label={state.group ? `Groupé · ${colByKey[state.group]?.label}` : "Grouper"} active={!!state.group} align="right">
          <div className="rule">
            <select value={state.group} onChange={(e) => { set({ group: e.target.value }); setCollapsed({}); }}>
              <option value="">Aucun regroupement</option>
              {groupable.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
        </Popover>

        <Popover label="Colonnes" active={state.hidden.length > 0} align="right">
          {columns.map((c) => (
            <label key={c.key} className="check small col-toggle">
              <input type="checkbox" checked={!state.hidden.includes(c.key)}
                onChange={(e) => set({ hidden: e.target.checked ? state.hidden.filter((h) => h !== c.key) : [...state.hidden, c.key] })} />
              {c.label}
            </label>
          ))}
        </Popover>

          <span className="count">{result.length}/{rows.length}</span>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {visible.map((c) => {
                const s = state.sorts.find((x) => x.key === c.key);
                return (
                  <th key={c.key} className={c.sortable === false ? "" : "sortable"} onClick={() => c.sortable !== false && headerSort(c.key)}>
                    {c.label}{s && <span className="sort-arrow">{s.dir === "asc" ? " ↑" : " ↓"}</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          {groups.map(([label, list]) => (
            <tbody key={label}>
              {state.group && (
                <tr className="group-row" onClick={() => setCollapsed((c) => ({ ...c, [label]: !c[label] }))}>
                  <td colSpan={visible.length}>
                    <span className="caret">{collapsed[label] ? "▸" : "▾"}</span> <b>{label}</b> <span className="muted">{list.length}</span>
                  </td>
                </tr>
              )}
              {!collapsed[label] && list.map((r) => (
                <tr key={r.id} onClick={() => onRowClick?.(r)}>
                  {visible.map((c) => (
                    <td key={c.key} className={["number", "bool"].includes(c.type) || c.nowrap ? "nowrap" : undefined}
                      onClick={c.stopClick ? (e) => e.stopPropagation() : undefined}>
                      {c.render ? c.render(r) : (c.get(r) ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
        {result.length === 0 && <Empty>{rows.length ? "Aucune ligne ne correspond aux filtres." : emptyText}</Empty>}
      </div>
    </div>
  );
}
