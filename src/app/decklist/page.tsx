"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { resolveDecklist, getImageSrc, ResolvedEntry } from "@/lib/api";
import { buildMpcXml, zipImages, downloadBlob, Pick } from "@/lib/export";

interface Row extends ResolvedEntry {
  selected: string; // chosen image url
}

/** Parse "2x Lightning Bolt" / "1 Aang" / "Sol Ring" lines into name+qty. */
function parseDecklist(text: string): { name: string; qty: number }[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("//") && !l.startsWith("#"))
    .map((l) => {
      const m = /^(\d+)\s*[xX]?\s+(.*)$/.exec(l);
      return m ? { name: m[2].trim(), qty: Math.max(1, +m[1]) } : { name: l, qty: 1 };
    });
}

function officialOf(r: ResolvedEntry): { name: string; url: string } | null {
  const c = r.card;
  if (!c) return null;
  const url = c.prints[0]?.image_normal ?? c.art_uri ?? "";
  return url ? { name: c.name, url } : null;
}

function defaultSelection(r: ResolvedEntry): string {
  const rec = r.reskins.find((x) => x.is_recommended) ?? r.reskins[0];
  if (rec) return rec.image_url;
  return officialOf(r)?.url ?? "";
}

export default function DecklistPage() {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState<null | "resolve" | "zip">(null);
  const [error, setError] = useState<string | null>(null);

  async function resolve() {
    setError(null);
    setBusy("resolve");
    try {
      const parsed = parseDecklist(text);
      const res = await resolveDecklist(parsed);
      setRows(res.map((r) => ({ ...r, selected: defaultSelection(r) })));
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(null);
    }
  }

  const matched = rows.filter((r) => r.card);
  const unmatched = rows.filter((r) => !r.card);

  // Duplicate-art: which chosen images appear on more than one card.
  const dupImages = useMemo(() => {
    const count = new Map<string, number>();
    matched.forEach((r) => count.set(r.selected, (count.get(r.selected) ?? 0) + 1));
    return new Set([...count].filter(([, n]) => n > 1).map(([url]) => url));
  }, [matched]);

  function picks(): Pick[] {
    return matched.map((r) => {
      const chosen =
        r.reskins.find((x) => x.image_url === r.selected)?.reskin_name ??
        officialOf(r)?.name ??
        r.query;
      return { name: chosen, query: r.query, qty: r.qty, imageUrl: r.selected };
    });
  }

  function exportXml() {
    downloadBlob("ubdb-order.xml", new Blob([buildMpcXml(picks())], { type: "application/xml" }));
  }
  async function exportZip() {
    setBusy("zip");
    try {
      downloadBlob("ubdb-images.zip", await zipImages(picks()));
    } finally {
      setBusy(null);
    }
  }

  function setSelected(idx: number, url: string) {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, selected: url } : r)));
  }

  return (
    <main className="py-8">
      <h1 className="mb-1 font-display text-2xl font-black uppercase tracking-[0.15em] text-gold dark:text-gold-dark">
        Decklist → proxies
      </h1>
      <p className="mb-6 font-body text-sm text-ink/55 dark:text-ink-dark/55">
        Paste a decklist, pick a version per card, then export a print sheet, an image zip, or order XML.
      </p>

      <div className="no-print grid gap-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder={"1 Aang, at the Crossroads\n2x Abby, Merciless Soldier\nAbsolute Virtue"}
          className="w-full rounded-card border border-gold/40 bg-transparent px-3 py-2 font-mono text-sm focus:border-gold"
        />
        <div className="flex flex-wrap gap-2">
          <button onClick={resolve} disabled={busy !== null || !text.trim()}
                  className="rounded-card bg-gold px-4 py-2 font-display uppercase tracking-wider text-frame transition hover:brightness-110 disabled:opacity-50">
            {busy === "resolve" ? "Resolving…" : "Resolve"}
          </button>
          {matched.length > 0 && (
            <>
              <button onClick={() => window.print()} className="rounded-card border border-gold/40 px-4 py-2 font-display uppercase tracking-wide hover:border-gold hover:text-gold">Print sheet</button>
              <button onClick={exportZip} disabled={busy !== null} className="rounded-card border border-gold/40 px-4 py-2 font-display uppercase tracking-wide hover:border-gold hover:text-gold disabled:opacity-50">
                {busy === "zip" ? "Zipping…" : "Image zip"}
              </button>
              <button onClick={exportXml} className="rounded-card border border-gold/40 px-4 py-2 font-display uppercase tracking-wide hover:border-gold hover:text-gold">Order XML</button>
            </>
          )}
        </div>

        {error && <p className="font-mono text-sm text-mana-r">Failed: {error}</p>}

        {unmatched.length > 0 && (
          <p className="rounded-card border border-mana-r/40 bg-mana-r/10 px-3 py-2 font-body text-sm text-ink/80 dark:text-ink-dark/80">
            Not found: {unmatched.map((r) => r.query).join(", ")}
          </p>
        )}
        {dupImages.size > 0 && (
          <p className="rounded-card border border-gold/50 bg-gold/10 px-3 py-2 font-body text-sm">
            ⚠ Some cards share the same art — you may want distinct versions before printing.
          </p>
        )}

        <div className="grid gap-4">
          {matched.map((r, i) => {
            const idx = rows.indexOf(r);
            const off = officialOf(r);
            const options = [
              ...(off ? [{ key: "official", name: `${off.name} (official)`, url: off.url, recommended: false }] : []),
              ...r.reskins.map((rk) => ({ key: rk._id, name: rk.reskin_name, url: rk.image_url, recommended: rk.is_recommended })),
            ];
            return (
              <div key={idx} className={`rounded-card border p-3 ${dupImages.has(r.selected) ? "border-gold" : "border-gold/25"}`}>
                <div className="mb-2 flex items-baseline gap-2 font-body text-sm">
                  <span className="font-mono text-gold">{r.qty}×</span>
                  <span className="font-medium">{r.card!.name}</span>
                  {r.reskins.length === 0 && (
                    <Link href={`/card/${r.card!.oracle_id}/suggest`} className="ml-auto font-mono text-xs text-gold hover:underline">
                      no reskin — suggest one →
                    </Link>
                  )}
                </div>
                <div className="flex flex-wrap gap-3">
                  {options.map((o) => (
                    <button key={o.key} onClick={() => setSelected(idx, o.url)}
                            className={`block w-24 shrink-0 rounded-card border-2 p-0.5 text-left transition ${r.selected === o.url ? "border-gold" : "border-transparent opacity-70 hover:opacity-100"}`}>
                      <img src={getImageSrc(o.url)} alt={o.name} loading="lazy" className="w-full rounded-[3px]" />
                      <span className="mt-0.5 block truncate font-mono text-[10px] text-ink/60 dark:text-ink-dark/50">
                        {o.recommended ? "★ " : ""}{o.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Print-only proxy sheet: real card size, qty copies each. */}
      <div className="print-sheet flex-wrap gap-0">
        {matched.flatMap((r) =>
          Array.from({ length: r.qty }, (_, k) => (
            <img key={`${rows.indexOf(r)}-${k}`} src={getImageSrc(r.selected)} alt=""
                 style={{ width: "63mm", height: "88mm" }} />
          )),
        )}
      </div>
    </main>
  );
}
