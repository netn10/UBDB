"use client";
import { useState } from "react";
import { suggestCards, getImageSrc } from "@/lib/api";
import SuggestResults from "@/components/SuggestResults";
import { SuggestResponse } from "@/types/types";

const field =
  "rounded-card border border-gold/40 bg-transparent px-3 py-2 text-sm focus:border-gold";
const legend =
  "font-display text-sm uppercase tracking-wider text-ink/70 dark:text-ink-dark/70";

type Facets = { colors: string[]; roles: string[] };

export default function SuggestReskinPage() {
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [data, setData] = useState<SuggestResponse | null>(null);
  const [status, setStatus] = useState<"idle" | "loading">("idle");
  const [error, setError] = useState<string | null>(null);

  async function run(facets?: Facets) {
    setError(null);
    setStatus("loading");
    try {
      const res = await suggestCards({
        description: description.trim(),
        image_url: imageUrl.trim() || undefined,
        facets,
      });
      setData(res);
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setStatus("idle");
    }
  }

  return (
    <main className="py-8">
      <h1 className="mb-6 font-display text-2xl font-black uppercase tracking-[0.15em] text-gold dark:text-gold-dark">
        Suggest a Reskin
      </h1>
      <p className="mb-6 max-w-xl font-body text-sm text-ink/70 dark:text-ink-dark/60">
        Describe your character and (optionally) link a picture. We’ll suggest UB
        cards that fit, and you can submit a reskin from there.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
        className="grid max-w-xl gap-5"
      >
        <fieldset className="grid gap-2">
          <label className={legend}>Description *</label>
          <textarea
            required
            rows={3}
            className={field}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. a loyal guardian who protects survivors — tough, from The Last of Us"
          />
        </fieldset>

        <fieldset className="grid gap-2">
          <label className={legend}>Picture link (optional)</label>
          <input
            type="url"
            className={field}
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://… (self-hosted; carried into the reskin form)"
          />
          {imageUrl.trim() && (
            <img
              src={getImageSrc(imageUrl.trim())}
              alt="preview"
              className="mt-1 w-32 rounded-card border-2 border-gold/40"
            />
          )}
        </fieldset>

        {error && <p className="font-mono text-sm text-mana-r">Failed: {error}</p>}

        <button
          disabled={status === "loading"}
          className="rounded-card bg-gold px-4 py-2 font-display uppercase tracking-wider text-frame transition hover:brightness-110 disabled:opacity-50"
        >
          {status === "loading" ? "Matching…" : "Suggest cards"}
        </button>
      </form>

      {data && (
        <section className="mt-10">
          <SuggestResults
            results={data.results}
            inferredFacets={data.inferred_facets}
            imageUrl={imageUrl.trim()}
            onFacetsChange={(f) => {
              setData({ ...data, inferred_facets: f });
              run(f);
            }}
          />
        </section>
      )}
    </main>
  );
}
