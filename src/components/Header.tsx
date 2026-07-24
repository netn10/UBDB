"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, useCallback } from "react";
import ThemeToggle from "./ThemeToggle";
import SettingsMenu from "./SettingsMenu";
import { WUBRG, MANA_HEX, MANA_LABEL, parseCi, serializeCi, Mana } from "@/lib/colors";
import { getRandom, completeCardNames } from "@/lib/api";
import Autocomplete from "@/components/Autocomplete";

/** Client-side random: fetch an id and push — no server redirect round-trip. */
function RandomLink() {
  const router = useRouter();
  return (
    <button
      onClick={() => getRandom().then((id) => router.push(`/card/${id}`)).catch(() => {})}
      className="uppercase tracking-wider hover:text-gold"
    >
      Random
    </button>
  );
}

function SearchForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams(params.toString());
    next.set("q", q);
    next.set("page", "1");
    router.push(`/search?${next.toString()}`);
  }

  const fetchNames = useCallback(async (query: string): Promise<string[]> => {
    if (/[:<>=]/.test(query)) return []; // DSL mode — skip name typeahead
    return completeCardNames(query);
  }, []);

  function go(name: string) {
    const next = new URLSearchParams(params.toString());
    next.set("q", name);
    next.set("page", "1");
    router.push(`/search?${next.toString()}`);
  }

  return (
    <form onSubmit={submit} className="w-full">
      <Autocomplete
        value={q}
        onChange={setQ}
        fetchSuggestions={fetchNames}
        onSelect={go}
        placeholder="Search cards — try t:creature id:w cmc<=3 fr:fallout"
        className="w-full rounded-card border border-ink/15 dark:border-ink-dark/15 bg-cardstock/60 dark:bg-frame/60 px-3 py-2 text-sm font-body placeholder:text-ink/40 dark:placeholder:text-ink-dark/40 focus:border-gold focus:bg-transparent"
      />
    </form>
  );
}

/** The color pie: brand mark + color-identity filter (writes the `ci` param). */
function ColorPie() {
  const router = useRouter();
  const params = useSearchParams();
  const active = parseCi(params.get("ci"));

  function toggle(c: Mana) {
    const next = new URLSearchParams(params.toString());
    const set = active.includes(c) ? active.filter((x) => x !== c) : [...active, c];
    const ci = serializeCi(set);
    if (ci) next.set("ci", ci);
    else next.delete("ci");
    next.set("page", "1");
    router.push(`/search?${next.toString()}`);
  }

  return (
    <div className="flex items-center gap-1" role="group" aria-label="Filter by color identity">
      {WUBRG.map((c) => {
        const on = active.includes(c);
        return (
          <button
            key={c}
            type="button"
            onClick={() => toggle(c)}
            aria-pressed={on}
            aria-label={MANA_LABEL[c]}
            title={MANA_LABEL[c]}
            className={`h-5 w-5 rounded-full border transition ${
              on
                ? "border-gold shadow-[0_0_0_2px] shadow-gold/60 scale-110"
                : "border-ink/25 dark:border-ink-dark/25 opacity-55 hover:opacity-100"
            }`}
            style={{ backgroundColor: MANA_HEX[c] }}
          />
        );
      })}
    </div>
  );
}

export default function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-gold/30 bg-surface dark:bg-surface-dark">
      <div className="mx-auto max-w-6xl px-4 py-3">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="font-display text-xl font-black tracking-[0.15em] text-gold dark:text-gold-dark"
          >
            The Omen Archive
          </Link>
          <Suspense fallback={<div />}>
            <ColorPie />
          </Suspense>
          <nav className="ml-auto hidden shrink-0 items-center gap-4 whitespace-nowrap text-sm font-display uppercase tracking-wider sm:flex">
            <Link href="/franchises" className="hover:text-gold">Franchises</Link>
            <Link href="/sets" className="hover:text-gold">Sets</Link>
            <Link href="/decklist" className="hover:text-gold">Decklist</Link>
            <RandomLink />
            <Link href="/advanced" className="hover:text-gold">Advanced</Link>
            <Link href="/suggest" className="hover:text-gold">Suggest a Reskin</Link>
            <Link href="/about" className="hover:text-gold">About</Link>
          </nav>
          <SettingsMenu />
          <ThemeToggle />
        </div>
        <Suspense fallback={null}>
          <div className="mt-3">
            <SearchForm />
          </div>
        </Suspense>
      </div>
    </header>
  );
}
