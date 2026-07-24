"use client";
import { Suspense, useState, useCallback } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { submitReskin, getImageSrc, getCard, cardKey, completeReskinValues } from "@/lib/api";
import { ArtSource, ReskinStyle } from "@/types/types";
import Autocomplete from "@/components/Autocomplete";

const ART_SOURCES: ArtSource[] = ["original", "token", "unset", "alchemy"];
const STYLES: ReskinStyle[] = ["name-bottom", "nickname-bar", "code"];
const field = "rounded-card border border-gold/40 bg-transparent px-3 py-2 text-sm focus:border-gold";
const legend = "font-display text-sm uppercase tracking-wider text-ink/70 dark:text-ink-dark/70";

function SuggestForm({ oracleId }: { oracleId: string }) {
  const params = useSearchParams();
  const face = Number(params.get("face") ?? "0");

  // The reskin is named after the card being reskinned (the clicked card).
  const { data: card } = useSWR(cardKey(oracleId), () => getCard(oracleId));
  const cardName = card ? (card.faces[face]?.name ?? card.name) : "";
  const cardImg = card
    ? face === 1
      ? card.prints[0]?.image_back_normal ?? card.prints[0]?.image_normal ?? card.art_uri
      : card.prints[0]?.image_normal ?? card.art_uri
    : null;

  const [designer, setDesigner] = useState("");
  const [imageUrl, setImageUrl] = useState(params.get("image_url") ?? "");
  const [artCredit, setArtCredit] = useState("");
  const [artSource, setArtSource] = useState<ArtSource>("original");
  const [style, setStyle] = useState<ReskinStyle>("name-bottom");
  const [tags, setTags] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const filterBy = (all: string[], query: string) => {
    const low = query.toLowerCase();
    return all.filter((v) => v.toLowerCase().includes(low)).slice(0, 10);
  };
  const fetchDesigner = useCallback(
    async (q: string) => filterBy(await completeReskinValues("designer"), q),
    [],
  );
  const fetchArtCredit = useCallback(
    async (q: string) => filterBy(await completeReskinValues("art_credit"), q),
    [],
  );
  const fetchTags = useCallback(
    async (q: string) => filterBy(await completeReskinValues("tags"), q),
    [],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!cardName.trim()) { setError("Card still loading, try again in a moment."); return; }
    setError(null);
    setStatus("sending");
    try {
      await submitReskin(oracleId, {
        reskin_name: cardName.trim(),
        designer_name: designer.trim(),
        image_url: imageUrl.trim(),
        art_credit: artCredit.trim(),
        art_source: artSource,
        style,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        face,
      });
      setStatus("done");
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
      setStatus("idle");
    }
  }

  if (status === "done") {
    return (
      <div className="rounded-card border border-gold/40 bg-gold/10 p-6">
        <p className="font-display text-lg text-gold">Submitted. Thanks!</p>
        <p className="mt-2 font-body text-sm text-ink/70 dark:text-ink-dark/70">
          Your reskin is pending moderation and will appear once approved.
        </p>
        <Link href={`/card/${oracleId}`} className="mt-4 inline-block font-display text-sm uppercase tracking-wide text-gold hover:underline">
          ← Back to card
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col-reverse gap-8 md:flex-row md:items-start">
    <form onSubmit={submit} className="grid max-w-xl flex-1 gap-5">
      <fieldset className="grid gap-2">
        <label className={legend}>Reskin for</label>
        <p className="rounded-card border border-gold/20 bg-gold/5 px-3 py-2 font-display text-sm text-gold">
          {cardName || "Loading card…"}
        </p>
      </fieldset>

      <fieldset className="grid gap-2">
        <label className={legend}>Your designer name *</label>
        <Autocomplete
          required
          className={field}
          value={designer}
          onChange={setDesigner}
          fetchSuggestions={fetchDesigner}
        />
      </fieldset>

      <fieldset className="grid gap-2">
        <label className={legend}>Image link *</label>
        <input required type="url" className={field} value={imageUrl} onChange={(e) => setImageUrl(e.target.value)}
               placeholder="https://… (host it yourself: imgur, drive, etc.)" />
      </fieldset>

      <div className="grid grid-cols-2 gap-4">
        <fieldset className="grid gap-2">
          <label className={legend}>Art source</label>
          <select className={field} value={artSource} onChange={(e) => setArtSource(e.target.value as ArtSource)}>
            {ART_SOURCES.map((s) => <option key={s} value={s} className="bg-surface text-ink">{s}</option>)}
          </select>
        </fieldset>
        <fieldset className="grid gap-2">
          <label className={legend}>Name style</label>
          <select className={field} value={style} onChange={(e) => setStyle(e.target.value as ReskinStyle)}>
            {STYLES.map((s) => <option key={s} value={s} className="bg-surface text-ink">{s}</option>)}
          </select>
        </fieldset>
      </div>

      <fieldset className="grid gap-2">
        <label className={legend}>Art credit *</label>
        <Autocomplete
          required
          className={field}
          value={artCredit}
          onChange={setArtCredit}
          fetchSuggestions={fetchArtCredit}
          placeholder="Artist / source (required by community rules)"
        />
      </fieldset>

      <fieldset className="grid gap-2">
        <label className={legend}>Tags (comma-separated)</label>
        <Autocomplete
          tokenized
          className={field}
          value={tags}
          onChange={setTags}
          fetchSuggestions={fetchTags}
          placeholder="e.g. Fallout, ghoul, flavor text"
        />
      </fieldset>

      <p className="rounded-card border border-mana-r/40 bg-mana-r/10 px-3 py-2 font-body text-xs text-ink/70 dark:text-ink-dark/70">
        No AI art. No existing paper-Magic art. Submissions are reviewed before going live.
      </p>

      {error && <p className="font-mono text-sm text-mana-r">Failed: {error}</p>}

      <button disabled={status === "sending" || !cardName}
              className="rounded-card bg-gold px-4 py-2 font-display uppercase tracking-wider text-frame transition hover:brightness-110 disabled:opacity-50">
        {status === "sending" ? "Submitting…" : "Submit reskin"}
      </button>
    </form>

      {cardImg && (
        <aside className="w-64 shrink-0 space-y-4 md:sticky md:top-20">
          <figure>
            <img src={getImageSrc(cardImg)} alt={cardName}
                 className="w-full rounded-card border-2 border-gold/30 shadow-lg" />
            <figcaption className="mt-2 text-center font-mono text-xs text-ink/50 dark:text-ink-dark/40">
              the card you&rsquo;re reskinning
            </figcaption>
          </figure>
          <figure>
            <p className="mb-1 text-center font-mono text-xs uppercase tracking-widest text-gold/70">reskinned to ↓</p>
            {imageUrl.trim() ? (
              <img src={getImageSrc(imageUrl.trim())} alt="reskin preview"
                   className="w-full rounded-card border-2 border-gold shadow-lg" />
            ) : (
              <div className="flex aspect-[5/7] w-full items-center justify-center rounded-card border-2 border-dashed border-gold/50 p-4 text-center font-body text-xs text-ink/40 dark:text-ink-dark/30">
                your reskin appears here
              </div>
            )}
          </figure>
        </aside>
      )}
    </div>
  );
}

export default function SuggestPage({ params }: { params: { id: string } }) {
  return (
    <main className="py-8">
      <Link href={`/card/${params.id}`} className="font-display text-sm uppercase tracking-wide text-ink/60 hover:text-gold dark:text-ink-dark/50">
        ← Back to card
      </Link>
      <h1 className="mb-6 mt-3 font-display text-2xl font-black uppercase tracking-[0.15em] text-gold dark:text-gold-dark">
        Suggest a design
      </h1>
      <Suspense fallback={<p className="font-mono text-sm text-ink/50">Loading…</p>}>
        <SuggestForm oracleId={params.id} />
      </Suspense>
    </main>
  );
}
