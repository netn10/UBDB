"use client";
import Link from "next/link";
import useSWR from "swr";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCard, getReskins, getRandom, getImageSrc, cardKey, reskinsKey, adminModerate } from "@/lib/api";
import { CardFace, Reskin } from "@/types/types";
import ManaCost from "@/components/ManaCost";

function ReskinSection({ oracleId, reskins, face, onRemove }: { oracleId: string; reskins: Reskin[]; face: number; onRemove?: (rid: string) => void }) {
  const ordered = reskins
    .filter((r) => (r.face ?? 0) === face)
    .sort((a, b) => Number(b.is_recommended) - Number(a.is_recommended));

  return (
    <div>
      <div className="mb-3 mt-8 flex items-center justify-between">
        <h2 className="font-display text-lg uppercase tracking-wider text-gold dark:text-gold-dark">
          Reskins {ordered.length > 0 && <span className="font-mono text-sm text-ink/50 dark:text-ink-dark/50">({ordered.length})</span>}
        </h2>
        <Link href={`/card/${oracleId}/suggest?face=${face}`}
              className="rounded-card border border-gold/50 px-3 py-1 text-sm font-display uppercase tracking-wide hover:border-gold hover:text-gold">
          + Suggest a design
        </Link>
      </div>
      {ordered.length === 0 ? (
        <div className="rounded-card border border-dashed border-gold/30 p-6 text-center">
          <p className="font-body italic text-ink/55 dark:text-ink-dark/50">
            No reskin yet. Be the first to suggest one.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {ordered.map((r) => (
            <div key={r._id} className="rounded-card border-2 border-gold/40 p-3 transition hover:border-gold hover:-translate-y-0.5">
              <img src={getImageSrc(r.image_url)} alt={r.reskin_name} className="w-full rounded-card" />
              <div className="mt-1.5 flex items-center gap-1.5 font-body text-sm">
                {r.reskin_name}
                {r.is_recommended && (
                  <span className="rounded-card bg-gold/85 px-1.5 text-[11px] font-semibold text-frame">★ recommended</span>
                )}
              </div>
              <div className="font-mono text-[11px] text-ink/50 dark:text-ink-dark/40">
                by {r.designer_name} · art: {r.art_credit}
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {r.art_source && <span className="rounded-card bg-gold/10 px-1.5 text-[10px] uppercase tracking-wide text-gold">{r.art_source}</span>}
                {r.style && <span className="rounded-card bg-gold/10 px-1.5 text-[10px] uppercase tracking-wide text-gold">{r.style}</span>}
                {(r.tags ?? []).map((t) => (
                  <span key={t} className="rounded-card bg-ink/5 px-1.5 text-[10px] text-ink/55 dark:bg-ink-dark/10 dark:text-ink-dark/50">{t}</span>
                ))}
              </div>
              {onRemove && (
                <button onClick={() => onRemove(r._id)}
                        className="no-print mt-2 rounded-card border border-mana-r/50 px-2 py-0.5 font-display text-[11px] uppercase tracking-wide text-mana-r hover:bg-mana-r/10">
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FaceDetails({ name, mana_cost, type_line, oracle_text, power, toughness, loyalty }: CardFace) {
  return (
    <div className="max-w-lg flex-1">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">{name}</h1>
        <ManaCost cost={mana_cost} />
      </div>
      <p className="mt-1 font-body text-ink/60 dark:text-ink-dark/50">{type_line}</p>
      <p className="mt-4 whitespace-pre-line font-body">{oracle_text}</p>
      {(power || loyalty) && (
        <p className="mt-3 font-mono text-sm text-ink/60 dark:text-ink-dark/50">
          {power != null ? `${power}/${toughness}` : `Loyalty ${loyalty}`}
        </p>
      )}
    </div>
  );
}

export default function CardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: card, error } = useSWR(cardKey(id), () => getCard(id));
  const { data: reskins = [], mutate: mutateReskins } = useSWR(reskinsKey(id), () => getReskins(id));

  const [adminToken, setAdminToken] = useState<string | null>(null);
  useEffect(() => { setAdminToken(localStorage.getItem("ubdb.session")); }, []);

  async function removeReskin(rid: string) {
    if (!adminToken) return;
    if (!window.confirm("Remove this reskin? This can't be undone.")) return;
    try {
      await adminModerate(rid, "reject", adminToken);
      mutateReskins();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "unauthorized") {
        localStorage.removeItem("ubdb.session");
        setAdminToken(null);
      } else {
        window.alert("Remove failed: " + msg);
      }
    }
  }

  if (error) return <main className="py-10 font-body">Card not found.</main>;
  if (!card) return <main className="py-10 font-mono text-sm text-ink/50 dark:text-ink-dark/40">Loading…</main>;

  const isDfc = card.faces.length === 2;
  const frontImg = card.prints[0]?.image_normal ?? card.art_uri;
  const backImg = card.prints[0]?.image_back_normal ?? null;

  const frontFace: CardFace = isDfc
    ? card.faces[0]
    : {
        name: card.name, mana_cost: card.mana_cost, type_line: card.type_line,
        oracle_text: card.oracle_text, colors: card.colors,
        power: card.power, toughness: card.toughness, loyalty: card.loyalty,
      };

  return (
    <main className="py-6">
      <div className="mb-4 flex items-center justify-between text-sm">
        <Link href="/search" className="font-display uppercase tracking-wide text-ink/60 hover:text-gold dark:text-ink-dark/50">← Back</Link>
        <button onClick={() => getRandom().then((id) => router.push(`/card/${id}`)).catch(() => {})}
                className="rounded-card border border-gold/40 px-3 py-1 hover:border-gold hover:text-gold">
          Random
        </button>
      </div>

      <p className="mb-2 flex flex-wrap gap-2 text-sm">
        {card.franchises.map((f) => (
          <Link key={f} href={`/search?q=${encodeURIComponent(`fr:"${f}"`)}`}
                className="rounded-card bg-gold/15 px-3 py-1 font-mono text-xs uppercase tracking-wide text-gold hover:bg-gold/25">
            {f}
          </Link>
        ))}
      </p>

      <p className="mb-4 flex flex-wrap gap-2 text-sm">
        {card.set_names.map((s) => (
          <Link key={s} href={`/search?q=${encodeURIComponent(`set:"${s}"`)}`}
                className="rounded-card border border-gold/25 px-3 py-1 font-mono text-xs uppercase tracking-wide text-ink/50 hover:border-gold hover:text-gold dark:text-ink-dark/40">
            {s}
          </Link>
        ))}
      </p>

      <section className="flex flex-wrap gap-8">
        <div className="w-72 shrink-0">
          {frontImg && <img src={getImageSrc(frontImg)} alt={frontFace.name} className="w-full rounded-card border-2 border-gold/30 shadow-lg transition duration-200 hover:border-gold/60" />}
        </div>
        <FaceDetails {...frontFace} />
      </section>
      <ReskinSection oracleId={card.oracle_id} reskins={reskins} face={0} onRemove={adminToken ? removeReskin : undefined} />

      {isDfc && (
        <section id="face-back" className="mt-12 border-t border-gold/20 pt-8">
          <div className="flex flex-wrap gap-8">
            <div className="w-72 shrink-0">
              {backImg && <img src={getImageSrc(backImg)} alt={card.faces[1].name} className="w-full rounded-card border-2 border-gold/30 shadow-lg transition duration-200 hover:border-gold/60" />}
            </div>
            <FaceDetails {...card.faces[1]} />
          </div>
          <ReskinSection oracleId={card.oracle_id} reskins={reskins} face={1} onRemove={adminToken ? removeReskin : undefined} />
        </section>
      )}

      <h2 className="mt-10 font-display text-sm uppercase tracking-wider text-ink/50 dark:text-ink-dark/40">
        Printed in
      </h2>
      <ul className="mt-1 font-body text-sm text-ink/70 dark:text-ink-dark/60">
        {card.prints.map((p) => (
          <li key={p.scryfall_id}>
            {p.set_name} ({p.set?.toUpperCase()}) #{p.collector_number}
            {p.rarity ? ` · ${p.rarity}` : ""}
          </li>
        ))}
      </ul>
    </main>
  );
}
