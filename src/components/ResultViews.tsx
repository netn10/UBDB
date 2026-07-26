"use client";
import Link from "next/link";
import { useState } from "react";
import { UbCard } from "@/types/types";
import { useSettings } from "@/lib/settings";
import { tileArt } from "@/lib/reskinArt";
import ManaCost from "./ManaCost";
import CardGrid from "./CardGrid";
import BinderView from "./BinderView";
import { identityTint } from "@/lib/colors";

export type ViewMode = "grid" | "list" | "text" | "binder";

const PREVIEW_W = 240; // px; card aspect 5/7
const PREVIEW_H = Math.round((PREVIEW_W * 7) / 5);

type Preview = { src: string; x: number; y: number } | null;

/** Cursor-following card image, shown while hovering a name in list/text views. */
function HoverPreview({ preview }: { preview: Preview }) {
  if (!preview) return null;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const flipLeft = preview.x > vw * 0.6;
  const left = flipLeft ? preview.x - PREVIEW_W - 20 : preview.x + 20;
  const top = Math.min(Math.max(preview.y - PREVIEW_H / 2, 8), vh - PREVIEW_H - 8);
  return (
    <img
      src={preview.src}
      alt=""
      aria-hidden
      style={{ position: "fixed", left, top, width: PREVIEW_W, zIndex: 50, pointerEvents: "none" }}
      className="rounded-card border-2 border-gold shadow-2xl"
    />
  );
}

export default function ResultViews({ cards, view }: { cards: UbCard[]; view: ViewMode }) {
  const [preview, setPreview] = useState<Preview>(null);
  const { preferReskinArt } = useSettings();

  if (view === "grid") return <CardGrid cards={cards} />;
  if (view === "binder") return <BinderView cards={cards} />;

  // Shared hover handlers for name rows/links.
  const hover = (c: UbCard) => {
    const src = tileArt(c, preferReskinArt).src;
    return {
      onMouseEnter: (e: React.MouseEvent) => src && setPreview({ src, x: e.clientX, y: e.clientY }),
      onMouseMove: (e: React.MouseEvent) => src && setPreview({ src, x: e.clientX, y: e.clientY }),
      onMouseLeave: () => setPreview(null),
    };
  };

  if (view === "text") {
    return (
      <>
        <ul className="columns-2 gap-6 md:columns-3">
          {cards.map((c) => (
            <li key={c.oracle_id} className="mb-1 flex items-center gap-2 text-sm">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: identityTint(c.color_identity) }} />
              <Link href={`/card/${c.oracle_id}`} className="hover:text-gold" {...hover(c)}>{c.name}</Link>
            </li>
          ))}
        </ul>
        <HoverPreview preview={preview} />
      </>
    );
  }

  return (
    <>
      <ul className="divide-y divide-gold/15">
        {cards.map((c) => (
          <li key={c.oracle_id} className="flex items-center gap-3 py-2 text-sm hover:bg-gold/5" {...hover(c)}>
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: identityTint(c.color_identity) }} />
            <Link href={`/card/${c.oracle_id}`} className="w-56 shrink-0 font-medium hover:text-gold">
              {c.name}
            </Link>
            <ManaCost cost={c.mana_cost} />
            <span className="truncate text-ink/60 dark:text-ink-dark/50">{c.type_line}</span>
            <span className="ml-auto shrink-0 font-mono text-xs uppercase tracking-wide text-ink/40 dark:text-ink-dark/30">
              {c.franchises[0]}
            </span>
          </li>
        ))}
      </ul>
      <HoverPreview preview={preview} />
    </>
  );
}
