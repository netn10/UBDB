"use client";
import Link from "next/link";
import { getImageSrc } from "@/lib/api";
import { SuggestResultItem } from "@/types/types";

type Facets = { colors: string[]; roles: string[] };

export default function SuggestResults({
  results,
  inferredFacets,
  imageUrl,
  onFacetsChange,
}: {
  results: SuggestResultItem[];
  inferredFacets: Facets;
  imageUrl: string;
  onFacetsChange: (f: Facets) => void;
}) {
  const chips: { kind: "colors" | "roles"; value: string }[] = [
    ...inferredFacets.colors.map((v) => ({ kind: "colors" as const, value: v })),
    ...inferredFacets.roles.map((v) => ({ kind: "roles" as const, value: v })),
  ];

  function removeChip(kind: "colors" | "roles", value: string) {
    onFacetsChange({
      ...inferredFacets,
      [kind]: inferredFacets[kind].filter((v) => v !== value),
    });
  }

  return (
    <div className="grid gap-6">
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display text-xs uppercase tracking-wider text-ink/60 dark:text-ink-dark/50">
            Read as:
          </span>
          {chips.map((c) => (
            <button
              key={`${c.kind}:${c.value}`}
              onClick={() => removeChip(c.kind, c.value)}
              className="rounded-full border border-gold/50 px-3 py-1 font-mono text-xs text-gold hover:bg-gold/10"
              title="Remove to re-rank"
            >
              {c.value} ✕
            </button>
          ))}
        </div>
      )}

      {results.length === 0 ? (
        <p className="font-body text-sm text-ink/60 dark:text-ink-dark/50">
          No strong match — try more descriptive words (a color, a role like
          “guardian” or “assassin”, or the franchise name).
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {results.map((r) => (
            <li key={r.oracle_id}>
              <Link
                href={`/card/${r.oracle_id}/suggest?image_url=${encodeURIComponent(
                  imageUrl,
                )}&name=${encodeURIComponent(r.name)}`}
                className="flex gap-3 rounded-card border border-gold/40 p-3 transition hover:border-gold hover:bg-gold/5"
              >
                {r.art_uri && (
                  <img
                    src={getImageSrc(r.art_uri)}
                    alt=""
                    className="h-24 w-16 flex-none rounded object-cover"
                  />
                )}
                <div className="grid content-start gap-1">
                  <span className="font-display text-sm text-gold">{r.name}</span>
                  <span className="font-mono text-xs text-ink/60 dark:text-ink-dark/50">
                    {r.type_line}
                  </span>
                  <ul className="mt-1 grid gap-0.5">
                    {r.why.map((w, i) => (
                      <li key={i} className="font-body text-xs text-ink/70 dark:text-ink-dark/60">
                        · {w}
                      </li>
                    ))}
                  </ul>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
