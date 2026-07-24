import { NextRequest, NextResponse } from "next/server";

const PLACEHOLDER = `<svg xmlns="http://www.w3.org/2000/svg" width="265" height="370"><rect width="265" height="370" fill="#222"/><text x="50%" y="50%" font-family="sans-serif" font-size="14" text-anchor="middle" fill="#888">No image</text></svg>`;

// Only proxy known Scryfall image hosts; this is a public CORS proxy endpoint,
// so it must not act as an open SSRF relay to arbitrary/internal URLs.
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB cap on proxied images
const ALLOWED_HOSTS = ["cards.scryfall.io", "c1.scryfall.com", "c2.scryfall.com", "svgs.scryfall.io"];

function isAllowed(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" && ALLOWED_HOSTS.includes(parsed.hostname);
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const imageUrl = request.nextUrl.searchParams.get("url");
  if (!imageUrl) return new NextResponse("No URL provided", { status: 400 });
  if (!isAllowed(imageUrl)) {
    return new NextResponse(PLACEHOLDER, {
      status: 200,
      headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" },
    });
  }
  try {
    const response = await fetch(imageUrl, {
      headers: {
        "User-Agent": "UBDB/0.1 (github.com/<user>/ubdb)",
        Accept: "image/*,*/*;q=0.8",
        Referer: "https://scryfall.com/",
      },
      redirect: "manual", // never follow a redirect off the allowlisted host
      signal: AbortSignal.timeout(15000),
    });
    const contentType = response.headers.get("content-type") || "";
    const declaredLen = Number(response.headers.get("content-length") || 0);
    // Only serve a real, in-budget image; anything else falls back to the placeholder.
    const buf =
      response.ok && contentType.startsWith("image/") && declaredLen <= MAX_BYTES
        ? await response.arrayBuffer()
        : null;
    if (!buf || buf.byteLength > MAX_BYTES) {
      return new NextResponse(PLACEHOLDER, {
        status: 200,
        headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" },
      });
    }
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": contentType || "image/jpeg",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new NextResponse(PLACEHOLDER, {
      status: 200,
      headers: { "Content-Type": "image/svg+xml" },
    });
  }
}
