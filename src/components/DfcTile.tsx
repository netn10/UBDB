"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { UbCard } from "@/types/types";
import { prefetchCard } from "@/lib/api";
import { identityTint } from "@/lib/colors";
import { tileArt } from "@/lib/reskinArt";
import { ReskinBadge } from "./CardGrid";
import { isDimmed, dimImgClass, NoUwTag, ReskinTag } from "./UwDim";

const FLIP_DELAY_MS = 150;
const HOLD_MS = 2000;

export default function DfcTile({ card, dim, prefer }: { card: UbCard; dim: boolean; prefer: boolean }) {
  const [flipped, setFlipped] = useState(false);
  const timers = useRef<number[]>([]);
  const front = tileArt(card, prefer);
  // Gated on the official back image, not the reskin: the flip only makes
  // sense for a genuinely double-faced card.
  const back = card.prints[0]?.image_back_normal ? tileArt(card, prefer, true) : null;
  const dimmed = isDimmed(card.reskin_count, dim);

  function clearTimers() {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current = [];
  }
  useEffect(() => clearTimers, []);

  function onEnter() {
    prefetchCard(card.oracle_id);
    if (!back) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    clearTimers();
    timers.current.push(window.setTimeout(() => setFlipped(true), FLIP_DELAY_MS));
    timers.current.push(window.setTimeout(() => setFlipped(false), FLIP_DELAY_MS + HOLD_MS));
  }
  function onLeave() {
    clearTimers();
    setFlipped(false);
  }

  return (
    <Link href={`/card/${card.oracle_id}`} onMouseEnter={onEnter} onMouseLeave={onLeave}
          className="group relative block [perspective:1000px]">
      <div
        className={`relative aspect-[5/7] w-full rounded-card border-2 transition-transform duration-500 [transform-style:preserve-3d] group-hover:ring-2 group-hover:ring-gold ${flipped ? "[transform:rotateY(180deg)]" : ""}`}
        style={{ borderColor: `${identityTint(card.color_identity)}66` }}
      >
        {front.src && (
          <img src={front.src} alt={front.alt} loading="lazy"
               className={`absolute inset-0 h-full w-full rounded-card [backface-visibility:hidden] ${dimmed ? dimImgClass : ""}`} />
        )}
        {back && (
          <img src={back.src} alt={back.alt} loading="lazy"
               className={`absolute inset-0 h-full w-full rounded-card [transform:rotateY(180deg)] [backface-visibility:hidden] ${dimmed ? dimImgClass : ""}`} />
        )}
      </div>
      {dimmed && <NoUwTag />}
      {front.isReskin && <ReskinTag />}
      <ReskinBadge count={card.reskin_count} />
    </Link>
  );
}
