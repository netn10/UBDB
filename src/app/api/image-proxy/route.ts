import { NextRequest, NextResponse } from "next/server";

const PLACEHOLDER = `<svg xmlns="http://www.w3.org/2000/svg" width="265" height="370"><rect width="265" height="370" fill="#222"/><text x="50%" y="50%" font-family="sans-serif" font-size="14" text-anchor="middle" fill="#888">No image</text></svg>`;

// Only proxy known Scryfall image hosts; this is a public CORS proxy endpoint,
// so it must not act as an open SSRF relay to arbitrary/internal URLs.
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
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      return new NextResponse(PLACEHOLDER, {
        status: 200,
        headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" },
      });
    }
    const buf = await response.arrayBuffer();
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": response.headers.get("content-type") || "image/jpeg",
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
