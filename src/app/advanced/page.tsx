"use client";
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { WUBRG, MANA_HEX, MANA_LABEL, Mana } from "@/lib/colors";
import Autocomplete from "@/components/Autocomplete";
import { completeCardNames } from "@/lib/api";

const RARITIES = ["common", "uncommon", "rare", "mythic"];

/** Quote a token value if it contains whitespace, so the parser keeps it whole. */
function quote(v: string): string {
  return /\s/.test(v) ? `"${v}"` : v;
}

/** A labelled include+exclude pair of free-text chip lists. */
function ChipField({
  label, placeholder, inc, exc, setInc, setExc,
}: {
  label: string; placeholder: string;
  inc: string[]; exc: string[];
  setInc: (v: string[]) => void; setExc: (v: string[]) => void;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="font-display text-sm uppercase tracking-wider text-ink/70 dark:text-ink-dark/70">{label}</legend>
      <ChipRow tone="include" placeholder={`Include ${placeholder}`} values={inc} onChange={setInc} />
      <ChipRow tone="exclude" placeholder={`Exclude ${placeholder}`} values={exc} onChange={setExc} />
    </fieldset>
  );
}

function ChipRow({
  tone, placeholder, values, onChange,
}: {
  tone: "include" | "exclude"; placeholder: string;
  values: string[]; onChange: (v: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const excluded = tone === "exclude";

  function add() {
    const v = draft.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft("");
  }

  return (
    <div className={`flex flex-wrap items-center gap-1.5 rounded-card border px-2 py-1.5 ${
      excluded ? "border-mana-r/40" : "border-gold/40"
    }`}>
      <span className={`font-mono text-xs ${excluded ? "text-mana-r" : "text-gold"}`}>
        {excluded ? "⊘" : "●"}
      </span>
      {values.map((v) => (
        <span key={v} className="flex items-center gap-1 rounded-card bg-gold/10 px-1.5 py-0.5 text-xs">
          {v}
          <button type="button" aria-label={`Remove ${v}`} className="text-ink/50 hover:text-mana-r"
                  onClick={() => onChange(values.filter((x) => x !== v))}>×</button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
        onBlur={add}
        placeholder={placeholder}
        className="min-w-[8rem] flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-ink/35 dark:placeholder:text-ink-dark/35"
      />
    </div>
  );
}

/** Two mana-pip rows: identity includes and excludes. */
function ColorRows({
  inc, exc, setInc, setExc,
}: {
  inc: Mana[]; exc: Mana[];
  setInc: (v: Mana[]) => void; setExc: (v: Mana[]) => void;
}) {
  function toggle(list: Mana[], set: (v: Mana[]) => void, other: Mana[], setOther: (v: Mana[]) => void, c: Mana) {
    if (list.includes(c)) set(list.filter((x) => x !== c));
    else { set([...list, c]); if (other.includes(c)) setOther(other.filter((x) => x !== c)); }
  }
  const Pip = ({ c, on, ring, onClick }: { c: Mana; on: boolean; ring: string; onClick: () => void }) => (
    <button type="button" onClick={onClick} aria-pressed={on} aria-label={MANA_LABEL[c]} title={MANA_LABEL[c]}
      className={`h-7 w-7 rounded-full border transition ${on ? `${ring} scale-110` : "border-ink/20 dark:border-ink-dark/20 opacity-50 hover:opacity-100"}`}
      style={{ backgroundColor: MANA_HEX[c] }} />
  );
  return (
    <fieldset className="grid gap-2">
      <legend className="font-display text-sm uppercase tracking-wider text-ink/70 dark:text-ink-dark/70">Color identity</legend>
      <div className="flex items-center gap-2">
        <span className="w-16 font-mono text-xs text-gold">● incl</span>
        {WUBRG.map((c) => <Pip key={c} c={c} on={inc.includes(c)} ring="border-gold shadow-[0_0_0_2px] shadow-gold/60"
          onClick={() => toggle(inc, setInc, exc, setExc, c)} />)}
      </div>
      <div className="flex items-center gap-2">
        <span className="w-16 font-mono text-xs text-mana-r">⊘ excl</span>
        {WUBRG.map((c) => <Pip key={c} c={c} on={exc.includes(c)} ring="border-mana-r shadow-[0_0_0_2px] shadow-mana-r/60"
          onClick={() => toggle(exc, setExc, inc, setInc, c)} />)}
      </div>
    </fieldset>
  );
}

/** Include/exclude button set for a fixed vocabulary (rarity). */
function ToggleSet({
  options, inc, exc, setInc, setExc,
}: {
  options: string[]; inc: string[]; exc: string[];
  setInc: (v: string[]) => void; setExc: (v: string[]) => void;
}) {
  function flip(list: string[], set: (v: string[]) => void, other: string[], setOther: (v: string[]) => void, o: string) {
    if (list.includes(o)) set(list.filter((x) => x !== o));
    else { set([...list, o]); if (other.includes(o)) setOther(other.filter((x) => x !== o)); }
  }
  return (
    <fieldset className="grid gap-2">
      <legend className="font-display text-sm uppercase tracking-wider text-ink/70 dark:text-ink-dark/70">Rarity</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = inc.includes(o), off = exc.includes(o);
          return (
            <span key={o} className="inline-flex overflow-hidden rounded-card border border-gold/40 text-xs">
              <button type="button" onClick={() => flip(inc, setInc, exc, setExc, o)}
                className={`px-2 py-1 ${on ? "bg-gold text-frame font-semibold" : "hover:text-gold"}`}>{o}</button>
              <button type="button" aria-label={`Exclude ${o}`} onClick={() => flip(exc, setExc, inc, setInc, o)}
                className={`border-l border-gold/40 px-1.5 py-1 ${off ? "bg-mana-r text-white" : "text-mana-r/70 hover:text-mana-r"}`}>⊘</button>
            </span>
          );
        })}
      </div>
    </fieldset>
  );
}

export default function AdvancedPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [typeInc, setTypeInc] = useState<string[]>([]);
  const [typeExc, setTypeExc] = useState<string[]>([]);
  const [oracleInc, setOracleInc] = useState<string[]>([]);
  const [oracleExc, setOracleExc] = useState<string[]>([]);
  const [colorInc, setColorInc] = useState<Mana[]>([]);
  const [colorExc, setColorExc] = useState<Mana[]>([]);
  const [mvOp, setMvOp] = useState("<=");
  const [mv, setMv] = useState("");
  const [rarInc, setRarInc] = useState<string[]>([]);
  const [rarExc, setRarExc] = useState<string[]>([]);
  const [frInc, setFrInc] = useState<string[]>([]);
  const [frExc, setFrExc] = useState<string[]>([]);
  const [reskinned, setReskinned] = useState(false);

  const fetchNames = useCallback(
    (query: string): Promise<string[]> => completeCardNames(query),
    [],
  );

  function build(e: React.FormEvent) {
    e.preventDefault();
    const p: string[] = [];
    if (name.trim()) p.push(quote(name.trim()));
    typeInc.forEach((v) => p.push(`t:${quote(v)}`));
    typeExc.forEach((v) => p.push(`-t:${quote(v)}`));
    oracleInc.forEach((v) => p.push(`o:${quote(v)}`));
    oracleExc.forEach((v) => p.push(`-o:${quote(v)}`));
    if (colorInc.length) p.push(`id:${colorInc.join("").toLowerCase()}`);
    colorExc.forEach((c) => p.push(`-id:${c.toLowerCase()}`)); // exclude each color individually
    if (mv.trim()) p.push(`cmc${mvOp}${mv.trim()}`);
    if (rarInc.length) p.push(`r:${rarInc.join("|")}`);        // | = OR
    if (rarExc.length) p.push(`-r:${rarExc.join("|")}`);
    if (frInc.length) p.push(`fr:${quote(frInc.join("|"))}`);
    if (frExc.length) p.push(`-fr:${quote(frExc.join("|"))}`);
    if (reskinned) p.push("is:reskinned");
    router.push(`/search?q=${encodeURIComponent(p.join(" "))}`);
  }

  return (
    <main className="py-8">
      <h1 className="mb-1 font-display text-2xl font-black uppercase tracking-[0.15em] text-gold dark:text-gold-dark">
        Advanced search
      </h1>
      <p className="mb-6 font-body text-sm text-ink/55 dark:text-ink-dark/55">
        Add multiple values to any row. <span className="text-gold">●</span> includes,
        <span className="text-mana-r"> ⊘</span> excludes. Franchise & rarity match any (OR); type & text match all (AND).
      </p>

      <form onSubmit={build} className="grid max-w-xl gap-6">
        <fieldset className="grid gap-2">
          <legend className="font-display text-sm uppercase tracking-wider text-ink/70 dark:text-ink-dark/70">Name</legend>
          <Autocomplete
            value={name}
            onChange={setName}
            fetchSuggestions={fetchNames}
            placeholder="Card name contains…"
            className="rounded-card border border-gold/40 bg-transparent px-3 py-2 text-sm focus:border-gold w-full"
          />
        </fieldset>

        <ChipField label="Type line" placeholder="type (e.g. creature)" inc={typeInc} exc={typeExc} setInc={setTypeInc} setExc={setTypeExc} />
        <ChipField label="Oracle text" placeholder="text" inc={oracleInc} exc={oracleExc} setInc={setOracleInc} setExc={setOracleExc} />
        <ColorRows inc={colorInc} exc={colorExc} setInc={setColorInc} setExc={setColorExc} />

        <fieldset className="grid gap-2">
          <legend className="font-display text-sm uppercase tracking-wider text-ink/70 dark:text-ink-dark/70">Mana value</legend>
          <div className="flex gap-2">
            <select value={mvOp} onChange={(e) => setMvOp(e.target.value)}
                    className="w-20 rounded-card border border-gold/40 bg-transparent px-2 py-2 text-sm">
              {["<=", "=", ">="].map((o) => <option key={o} className="bg-surface text-ink">{o}</option>)}
            </select>
            <input value={mv} onChange={(e) => setMv(e.target.value)} inputMode="numeric" placeholder="e.g. 3"
                   className="flex-1 rounded-card border border-gold/40 bg-transparent px-3 py-2 text-sm focus:border-gold" />
          </div>
        </fieldset>

        <ToggleSet options={RARITIES} inc={rarInc} exc={rarExc} setInc={setRarInc} setExc={setRarExc} />
        <ChipField label="Franchise" placeholder="franchise (e.g. Fallout)" inc={frInc} exc={frExc} setInc={setFrInc} setExc={setFrExc} />

        <label className="flex items-center gap-2 font-body text-sm">
          <input type="checkbox" checked={reskinned} onChange={(e) => setReskinned(e.target.checked)} className="accent-gold" />
          Only cards with a reskin
        </label>

        <button className="rounded-card bg-gold px-4 py-2 font-display uppercase tracking-wider text-frame transition hover:brightness-110">
          Search
        </button>
      </form>
    </main>
  );
}
