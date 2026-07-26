"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { UbCard } from "@/types/types";
import { useSettings } from "@/lib/settings";
import { identityTint } from "@/lib/colors";
import { tileArt } from "@/lib/reskinArt";
import { isDimmed, dimImgClass, NoUwTag, ReskinTag } from "./UwDim";

const PER_SHEET = 9; // 3×3

function Pocket({ card, dim, prefer }: { card: UbCard; dim: boolean; prefer: boolean }) {
  const art = tileArt(card, prefer);
  const tint = identityTint(card.color_identity);
  const dimmed = isDimmed(card.reskin_count, dim);
  return (
    <Link
      href={`/card/${card.oracle_id}`}
      className="sleeve group relative block overflow-hidden rounded-card border-2 transition duration-200 hover:-translate-y-0.5"
      style={{ borderColor: `${tint}66` }}
    >
      {art.src ? (
        <img src={art.src} alt={art.alt} loading="lazy" className={`w-full ${dimmed ? dimImgClass : ""}`} />
      ) : (
        <div className="flex aspect-[5/7] items-center justify-center bg-surface p-2 text-center font-body text-xs dark:bg-surface-dark">
          {art.alt}
        </div>
      )}
      {dimmed && <NoUwTag />}
      {art.isReskin && <ReskinTag />}
    </Link>
  );
}

export default function BinderView({ cards }: { cards: UbCard[] }) {
  const { dimUnreskinned, preferReskinArt } = useSettings();
  const [sheet, setSheet] = useState(0);
  const [flipping, setFlipping] = useState(false);
  const sheetCount = Math.max(1, Math.ceil(cards.length / PER_SHEET));

  // Clamp when the result set shrinks (new search) so we never strand on an empty sheet.
  useEffect(() => { setSheet((s) => Math.min(s, sheetCount - 1)); }, [sheetCount]);

  const reduced = typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function go(next: number) {
    const target = Math.min(Math.max(next, 0), sheetCount - 1);
    if (target === sheet) return;
    if (reduced) { setSheet(target); return; }
    setFlipping(true);
    setTimeout(() => { setSheet(target); setFlipping(false); }, 450);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") go(sheet + 1);
      if (e.key === "ArrowLeft") go(sheet - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet, sheetCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = sheet * PER_SHEET;
  const pockets = cards.slice(start, start + PER_SHEET);

  return (
    <div className="mx-auto max-w-3xl" style={{ perspective: "1800px" }}>
      {/* Binder chrome: leather edge + ring-hole spine on the left. */}
      <div className="relative rounded-card border-2 border-gold/30 bg-surface/60 p-4 pl-8 shadow-lg dark:bg-surface-dark/60">
        <div className="pointer-events-none absolute inset-y-4 left-3 flex flex-col justify-around">
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} className="h-3 w-3 rounded-full border border-gold/40 bg-frame/20 dark:bg-cardstock/10" />
          ))}
        </div>
        <div className={`grid grid-cols-3 gap-3 ${flipping ? "sheet-flipping" : ""}`}>
          {pockets.map((c) => <Pocket key={c.oracle_id} card={c} dim={dimUnreskinned} prefer={preferReskinArt} />)}
          {/* Pad the last sheet so the 3×3 grid keeps its shape. */}
          {Array.from({ length: PER_SHEET - pockets.length }).map((_, i) => (
            <div key={`empty-${i}`} className="aspect-[5/7] rounded-card border-2 border-dashed border-gold/15" />
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-center gap-4 text-sm">
        <button
          onClick={() => go(sheet - 1)}
          disabled={sheet <= 0}
          className="rounded-card border border-gold/40 px-3 py-1 transition hover:border-gold hover:text-gold disabled:opacity-30"
          aria-label="Previous page"
        >↞</button>
        <span className="font-mono text-xs">Sheet {sheet + 1} / {sheetCount}</span>
        <button
          onClick={() => go(sheet + 1)}
          disabled={sheet >= sheetCount - 1}
          className="rounded-card border border-gold/40 px-3 py-1 transition hover:border-gold hover:text-gold disabled:opacity-30"
          aria-label="Next page"
        >↠</button>
      </div>
    </div>
  );
}
