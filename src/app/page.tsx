"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { searchCards } from "@/lib/api";
import { WUBRG, MANA_HEX } from "@/lib/colors";

export default function Welcome() {
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    // Read-only reuse of the existing search endpoint just for the count.
    searchCards({ q: "", order: "released", dir: "desc", page: 1, page_size: 1 })
      .then((r) => setTotal(r.total))
      .catch(() => {}); // count silently omitted on failure
  }, []);

  return (
    <main className="relative flex min-h-[85vh] flex-col items-center justify-center overflow-hidden py-16 text-center">
      <div className="welcome-aura" aria-hidden />

      <div className="mb-4 flex gap-2">
        {WUBRG.map((c, i) => (
          <Link
            key={c}
            href={`/search?ci=${c.toLowerCase()}`}
            className="pip-in h-4 w-4 rounded-full ring-1 ring-gold/30 transition hover:scale-125"
            style={{ backgroundColor: MANA_HEX[c], animationDelay: `${i * 90}ms` }}
            aria-label={`Browse ${c} cards`}
          />
        ))}
      </div>

      <h1 className="font-display font-black tracking-[0.22em] text-gold dark:text-gold-dark"
          style={{ fontSize: "clamp(3.5rem, 12vw, 8rem)", lineHeight: 1 }}>
        The Omen Archive
      </h1>
      <p className="mt-5 max-w-lg font-body text-lg text-ink/70 dark:text-ink-dark/60">
        The Universes Beyond reskin database. Every card, reimagined.
        Search the multiverse or wander the binder.
      </p>

      <Link
        href="/search"
        className="mt-8 rounded-card border border-gold/50 px-6 py-2.5 font-display uppercase tracking-wider transition hover:-translate-y-0.5 hover:border-gold hover:text-gold"
      >
        Enter the database →
      </Link>

      {total !== null && (
        <p className="mt-4 font-mono text-xs uppercase tracking-widest text-ink/45 dark:text-ink-dark/35">
          {total.toLocaleString()} cards catalogued
        </p>
      )}
    </main>
  );
}
