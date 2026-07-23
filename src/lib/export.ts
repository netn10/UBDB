import JSZip from "jszip";
import { getImageSrc } from "./api";

export interface Pick {
  name: string;      // chosen reskin/card name
  query: string;     // original decklist line name
  qty: number;
  imageUrl: string;  // chosen image
}

/** Trigger a browser download for a blob. */
export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function xmlEscape(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c] as string));
}

/** Approximate MPCfill-style order XML. NOTE: real MPCfill references drive file
 *  IDs; this emits image URLs instead, so it documents the order, not a 1:1 import. */
export function buildMpcXml(picks: Pick[]): string {
  const total = picks.reduce((n, p) => n + p.qty, 0);
  const cards = picks
    .map(
      (p) =>
        `    <card>\n` +
        `      <name>${xmlEscape(p.name)}</name>\n` +
        `      <query>${xmlEscape(p.query)}</query>\n` +
        `      <qty>${p.qty}</qty>\n` +
        `      <image>${xmlEscape(p.imageUrl)}</image>\n` +
        `    </card>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<order>\n  <details>\n    <quantity>${total}</quantity>\n  </details>\n  <fronts>\n${cards}\n  </fronts>\n</order>\n`;
}

function safeFile(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "card";
}

/** Zip the chosen card images (fetched through the same-origin proxy). */
export async function zipImages(picks: Pick[]): Promise<Blob> {
  const zip = new JSZip();
  const seen = new Map<string, number>();
  await Promise.all(
    picks.map(async (p, i) => {
      try {
        const res = await fetch(getImageSrc(p.imageUrl));
        if (!res.ok) return;
        const blob = await res.blob();
        const base = safeFile(p.name);
        const n = (seen.get(base) ?? 0) + 1;
        seen.set(base, n);
        const suffix = n > 1 ? `_${n}` : "";
        zip.file(`${String(i + 1).padStart(3, "0")}_${base}${suffix}.jpg`, blob);
      } catch {
        /* skip images that fail to fetch */
      }
    }),
  );
  return zip.generateAsync({ type: "blob" });
}
