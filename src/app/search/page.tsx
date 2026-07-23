"use client";
import { Suspense, useEffect, useState } from "react";
import useSWR from "swr";
import { useRouter, useSearchParams } from "next/navigation";
import { searchCards } from "@/lib/api";
import ResultViews, { ViewMode } from "@/components/ResultViews";
import { useSettings, writeSettings } from "@/lib/settings";
import { parseCi } from "@/lib/colors";

const ORDERS = ["name", "cmc", "rarity", "released", "franchise"];

function pill(active: boolean) {
  return `rounded-card px-2.5 py-1 text-sm transition ${
    active
      ? "bg-gold text-frame font-semibold"
      : "border border-gold/40 text-ink/70 dark:text-ink-dark/70 hover:border-gold hover:text-gold"
  }`;
}

function Masthead() {
  return (
    <p className="mb-6 mt-2 text-center font-body text-sm text-ink/55 dark:text-ink-dark/50">
      Search by name, type, or color identity — or tap a mana pip above to filter by color.
    </p>
  );
}

function Results() {
  const router = useRouter();
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const ci = params.get("ci") ?? "";
  const order = params.get("order") ?? "name";
  const dir = params.get("dir") ?? "asc";
  const page = Number(params.get("page") ?? "1");
  const uw = params.get("uw") ?? "";              // "" | "has" | "needs"
  const minskins = params.get("minskins") ?? "";  // numeric string, "" = off

  const settings = useSettings();
  const [view, setView] = useState<ViewMode>("grid");

  useEffect(() => {
    const v = localStorage.getItem("view") as ViewMode | null;
    if (v) setView(v);
  }, []);

  // Free-text `q`, the color-pie `ci`, and the UW-availability controls all
  // compose into one Scryfall-style query clause.
  const colors = parseCi(ci).join("").toLowerCase();
  const minN = Number(minskins);
  const effectiveQ = [
    q,
    colors ? `id:${colors}` : "",
    uw === "has" ? "is:reskinned" : uw === "needs" ? "is:unreskinned" : "",
    minskins && minN > 0 ? `reskins>=${minN}` : "",
  ].filter(Boolean).join(" ");
  const { data: result = null, error } = useSWR(
    ["search", effectiveQ, order, dir, page],
    () => searchCards({ q: effectiveQ, order, dir, page, page_size: 60 }),
  );

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    next.set(key, value);
    if (key !== "page") next.set("page", "1");
    router.push(`/search?${next.toString()}`);
  }

  function chooseView(v: ViewMode) {
    setView(v);
    localStorage.setItem("view", v);
  }

  const idle = !q && !ci && !uw && !minskins;

  // One pager, rendered above and below the results (wrapped with its own margin).
  const pager =
    result && (result.page > 1 || result.has_more) ? (
      <div className="flex items-center justify-center gap-4 text-sm">
        <button disabled={result.page <= 1} onClick={() => setParam("page", String(page - 1))}
                className="rounded-card border border-gold/40 px-3 py-1 hover:border-gold hover:text-gold disabled:opacity-30">
          ← Prev
        </button>
        <span className="font-mono text-xs">Page {result.page}</span>
        <button disabled={!result.has_more} onClick={() => setParam("page", String(page + 1))}
                className="rounded-card border border-gold/40 px-3 py-1 hover:border-gold hover:text-gold disabled:opacity-30">
          Next →
        </button>
      </div>
    ) : null;

  return (
    <main className="py-6">
      {idle && <Masthead />}

      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <span className="font-mono text-xs text-ink/55 dark:text-ink-dark/50">
          {result ? `${result.total} cards` : "…"}
        </span>
        <select
          value={order}
          onChange={(e) => setParam("order", e.target.value)}
          className="rounded-card border border-gold/40 bg-transparent px-2 py-1 hover:border-gold"
        >
          {ORDERS.map((o) => <option key={o} value={o} className="bg-surface text-ink">Sort: {o}</option>)}
        </select>
        <button onClick={() => setParam("dir", dir === "asc" ? "desc" : "asc")}
                className="rounded-card border border-gold/40 px-2 py-1 hover:border-gold hover:text-gold">
          {dir === "asc" ? "↑" : "↓"}
        </button>

        {/* UW availability: filter (query) + dim toggle (sticky pref). */}
        <div className="flex gap-1">
          {(["", "has", "needs"] as const).map((v) => (
            <button key={v || "all"} onClick={() => setParam("uw", v)} className={pill(uw === v)}>
              {v === "" ? "All UW" : v === "has" ? "Has UW" : "Needs UW"}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1 font-mono text-xs text-ink/60 dark:text-ink-dark/50">
          skins ≥
          <input
            type="number"
            min={0}
            value={minskins}
            onChange={(e) => setParam("minskins", e.target.value.replace(/[^0-9]/g, ""))}
            className="w-14 rounded-card border border-gold/40 bg-transparent px-2 py-1 hover:border-gold focus:border-gold focus:outline-none"
            aria-label="Minimum reskins"
          />
        </label>
        <button
          onClick={() => writeSettings({ ...settings, dimUnreskinned: !settings.dimUnreskinned })}
          className={pill(settings.dimUnreskinned)}
          title="Grey out cards that have no Universes Within version yet"
        >
          ◐ Dim no-UW
        </button>

        <div className="ml-auto flex gap-1">
          {(["grid", "list", "text", "binder"] as ViewMode[]).map((v) => (
            <button key={v} onClick={() => chooseView(v)} className={pill(view === v)}>
              {v}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="font-mono text-sm text-mana-r">Failed to load: {String(error)}</p>}
      {result?.warnings?.length ? (
        <p className="mb-3 rounded-card border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-ink/80 dark:text-ink-dark/80">
          {result.warnings.join(" · ")}
        </p>
      ) : null}

      {pager && <div className="mb-4">{pager}</div>}

      {result && <ResultViews cards={result.cards} view={view} />}
      {result && result.cards.length === 0 && (
        <p className="py-12 text-center font-body italic text-ink/50 dark:text-ink-dark/40">
          {result.total === 0 ? `No cards matched “${q || ci}”.` : "No cards on this page — go back."}
        </p>
      )}

      {pager && <div className="mt-8">{pager}</div>}
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<main className="py-6 text-center font-mono text-sm text-ink/50 dark:text-ink-dark/40">Loading…</main>}>
      <Results />
    </Suspense>
  );
}
