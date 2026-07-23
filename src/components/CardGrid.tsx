"use client";
import Link from "next/link";
import { Fragment } from "react";
import { UbCard } from "@/types/types";
import { getImageSrc, prefetchCard } from "@/lib/api";
import { useSettings } from "@/lib/settings";
import { identityTint } from "@/lib/colors";
import { isDimmed, dimImgClass, NoUwTag } from "./UwDim";
import DfcTile from "./DfcTile";

function isFlipDfc(c: UbCard): boolean {
  return c.faces.length === 2 && !!c.prints[0]?.image_back_normal;
}

/** Bottom-of-tile badge: reskin count, or a prompt to add the first one. */
export function ReskinBadge({ count }: { count?: number }) {
  const n = count ?? 0;
  return (
    <span
      className={`pointer-events-none absolute inset-x-2 bottom-2 flex items-center justify-center gap-1 rounded-card px-2 py-0.5 text-center font-mono text-[11px] backdrop-blur-sm ${
        n > 0 ? "bg-gold/85 text-frame" : "bg-frame/70 text-ink-dark/80 ring-1 ring-gold/40"
      }`}
    >
      {n > 0 ? `◈ ${n} reskin${n === 1 ? "" : "s"}` : "+ suggest a design"}
    </span>
  );
}

/** Tile chrome: a 2px matte ring in the card's color identity, gold on hover. */
export function tileClass(identity: string[]): { className: string; style: React.CSSProperties } {
  return {
    className:
      "block overflow-hidden rounded-card border-2 transition duration-200 group-hover:-translate-y-0.5 group-hover:ring-2 group-hover:ring-gold group-hover:ring-offset-0",
    style: { borderColor: `${identityTint(identity)}66` },
  };
}

function BackTile({ card, dim }: { card: UbCard; dim: boolean }) {
  const back = card.prints[0]!.image_back_normal!;
  const t = tileClass(card.color_identity);
  const dimmed = isDimmed(card.reskin_count, dim);
  return (
    <Link href={`/card/${card.oracle_id}#face-back`} className="group relative block"
          onMouseEnter={() => prefetchCard(card.oracle_id)}>
      <img src={getImageSrc(back)} alt={`${card.faces[1].name} (back)`} loading="lazy"
           className={`w-full ${t.className} ${dimmed ? dimImgClass : ""}`} style={t.style} />
      {dimmed && <NoUwTag />}
    </Link>
  );
}

function PlainTile({ card, dim }: { card: UbCard; dim: boolean }) {
  const img = card.prints[0]?.image_normal ?? card.art_uri;
  const t = tileClass(card.color_identity);
  const dimmed = isDimmed(card.reskin_count, dim);
  return (
    <Link href={`/card/${card.oracle_id}`} className="group relative block"
          onMouseEnter={() => prefetchCard(card.oracle_id)}>
      {img ? (
        <img src={getImageSrc(img)} alt={card.name} loading="lazy"
             className={`w-full ${t.className} ${dimmed ? dimImgClass : ""}`} style={t.style} />
      ) : (
        <div className={`flex aspect-[5/7] items-center justify-center bg-surface p-2 text-center font-body text-xs dark:bg-surface-dark ${t.className} ${dimmed ? dimImgClass : ""}`}
             style={t.style}>
          {card.name}
        </div>
      )}
      {dimmed && <NoUwTag />}
      <ReskinBadge count={card.reskin_count} />
    </Link>
  );
}

export default function CardGrid({ cards }: { cards: UbCard[] }) {
  const { splitDfcTiles, dimUnreskinned } = useSettings();
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {cards.map((c, i) => {
        // Staggered entrance, capped so late tiles don't crawl in.
        const delay = { animationDelay: `${Math.min(i * 25, 350)}ms` };
        return isFlipDfc(c) ? (
          <Fragment key={c.oracle_id}>
            <div className="card-rise" style={delay}><DfcTile card={c} dim={dimUnreskinned} /></div>
            {splitDfcTiles && <div className="card-rise" style={delay}><BackTile card={c} dim={dimUnreskinned} /></div>}
          </Fragment>
        ) : (
          <div key={c.oracle_id} className="card-rise" style={delay}><PlainTile card={c} dim={dimUnreskinned} /></div>
        );
      })}
    </div>
  );
}
