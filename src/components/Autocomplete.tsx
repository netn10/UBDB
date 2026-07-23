"use client";
import { useEffect, useRef, useState } from "react";

interface AutocompleteProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "value" | "onChange" | "onSelect"
  > {
  value: string;
  onChange: (v: string) => void;
  fetchSuggestions: (query: string) => Promise<string[]>;
  onSelect?: (value: string) => void;
  tokenized?: boolean;
}

// Comma-separated fields complete only the final token.
function lastToken(v: string): string {
  const i = v.lastIndexOf(",");
  return i === -1 ? v : v.slice(i + 1);
}
function replaceLastToken(v: string, chosen: string): string {
  const i = v.lastIndexOf(",");
  const head = i === -1 ? "" : v.slice(0, i + 1);
  const sep = head && !head.endsWith(" ") ? " " : "";
  return `${head}${sep}${chosen}`;
}

export default function Autocomplete({
  value,
  onChange,
  fetchSuggestions,
  onSelect,
  tokenized,
  ...inputProps
}: AutocompleteProps) {
  const [items, setItems] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const seq = useRef(0);
  const chosen = useRef<string | null>(null); // suppress reopen right after a selection

  const query = (tokenized ? lastToken(value) : value).trim();

  useEffect(() => {
    if (!query) {
      ++seq.current; // invalidate any in-flight fetch on clear
      setItems([]);
      setOpen(false);
      return;
    }
    if (chosen.current === query) {
      chosen.current = null; // just selected this value — don't reopen
      return;
    }
    const id = ++seq.current;
    const t = setTimeout(async () => {
      const results = await fetchSuggestions(query);
      if (id !== seq.current) return; // ignore stale (out-of-order) responses
      setItems(results);
      setActive(-1);
      setOpen(results.length > 0);
    }, 150);
    return () => clearTimeout(t);
  }, [query, fetchSuggestions]);

  function choose(s: string) {
    const next = tokenized ? replaceLastToken(value, s) : s;
    chosen.current = s; // effect will see query === s and skip the reopen
    onChange(next);
    onSelect?.(next);
    setOpen(false);
    setItems([]);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + items.length) % items.length);
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      choose(items[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative w-full">
      <input
        {...inputProps}
        value={value}
        onChange={(e) => {
          chosen.current = null; // manual typing clears any pending reopen-suppression
          onChange(e.target.value);
        }}
        onKeyDown={onKeyDown}
        onFocus={() => items.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)} // let mousedown land
        autoComplete="off"
      />
      {open && items.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-card border border-gold/30 bg-surface dark:bg-frame shadow-lg">
          {items.map((s, i) => (
            <li
              key={s}
              onMouseDown={(e) => {
                e.preventDefault(); // keep focus; fire before blur closes list
                choose(s);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-1.5 text-sm ${
                i === active
                  ? "bg-gold/20 text-ink dark:text-ink-dark"
                  : "text-ink/80 dark:text-ink-dark/80"
              }`}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
