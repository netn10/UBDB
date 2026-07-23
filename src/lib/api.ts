import { preload } from "swr";
import { UbCard, SearchResult, Reskin, SuggestResponse } from "@/types/types";

// Same-origin by default: the browser hits /api on this host and Next's
// rewrite proxies it to the internal Flask backend. Override with
// NEXT_PUBLIC_API_URL only when the backend lives on a separate origin.
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "/api";

// Cross-origin (Scryfall) images go through the CORS proxy; local/data URIs don't.
export function getImageSrc(url?: string | null): string {
  if (!url) return "";
  if (url.startsWith("data:") || url.startsWith("/")) return url;
  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`);
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

export interface SearchParams {
  q?: string;
  order?: string;
  dir?: string;
  page?: number;
  page_size?: number;
}

export async function searchCards(params: SearchParams): Promise<SearchResult> {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.order) qs.set("order", params.order);
  if (params.dir) qs.set("dir", params.dir);
  if (params.page) qs.set("page", String(params.page));
  if (params.page_size) qs.set("page_size", String(params.page_size));
  return get<SearchResult>(`/search?${qs.toString()}`);
}

export async function getCard(id: string): Promise<UbCard> {
  return get<UbCard>(`/cards/${id}`);
}

export async function getReskins(id: string): Promise<Reskin[]> {
  const body = await get<{ reskins: Reskin[] }>(`/cards/${id}/reskins`);
  return body.reskins;
}

export async function getFranchises(): Promise<{ name: string; count: number }[]> {
  const body = await get<{ franchises: { name: string; count: number }[] }>("/franchises");
  return body.franchises;
}

export async function getRandom(): Promise<string> {
  const body = await get<{ oracle_id: string }>("/random");
  return body.oracle_id;
}

// SWR cache keys — single source so page reads and hover-prefetch never drift.
export const cardKey = (id: string) => ["card", id];
export const reskinsKey = (id: string) => ["reskins", id];

/** Warm the SWR cache for a card + its reskins (call on tile hover).
 *  Prefetch is best-effort: swallow rejections so a failing fetch (e.g. a
 *  503 when the DB is unavailable) can't surface as an unhandled rejection. */
export function prefetchCard(id: string): void {
  preload(cardKey(id), () => getCard(id)).catch(() => {});
  preload(reskinsKey(id), () => getReskins(id)).catch(() => {});
}

export interface ResolvedEntry {
  query: string;
  qty: number;
  card: UbCard | null;
  reskins: Reskin[];
}

export async function resolveDecklist(
  names: { name: string; qty: number }[],
): Promise<ResolvedEntry[]> {
  const res = await fetch(`${API_BASE_URL}/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ names }),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  const body = await res.json();
  return body.results as ResolvedEntry[];
}

function authHeaders(token?: string): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function login(
  username: string,
  password: string,
): Promise<{ token: string; expires_at: string }> {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(res.status === 401 ? "invalid credentials" : `${res.status}`);
  return res.json();
}

export async function logout(token: string): Promise<void> {
  await fetch(`${API_BASE_URL}/auth/logout`, {
    method: "POST",
    headers: authHeaders(token),
  });
}

export async function me(token: string): Promise<{ username: string; role: string }> {
  const res = await fetch(`${API_BASE_URL}/auth/me`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error("unauthorized");
  return res.json();
}

export async function adminPending(token?: string): Promise<Reskin[]> {
  const res = await fetch(`${API_BASE_URL}/admin/reskins/pending`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? "unauthorized" : `${res.status}`);
  return (await res.json()).reskins as Reskin[];
}

export async function adminModerate(
  id: string,
  action: "approve" | "reject",
  token?: string,
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/admin/reskins/${id}/${action}`, {
    method: "POST",
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? "unauthorized" : `${res.status}`);
}

export interface ReskinSubmission {
  reskin_name: string;
  image_url: string;
  designer_name: string;
  art_credit?: string;
  art_source?: string;
  style?: string;
  tags?: string[];
  face?: number;
}

export async function submitReskin(
  oracleId: string,
  body: ReskinSubmission,
): Promise<{ ok: boolean; id: string; status: string }> {
  const res = await fetch(`${API_BASE_URL}/cards/${oracleId}/reskins`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `${res.status}`);
  }
  return res.json();
}

export async function suggestCards(body: {
  description: string;
  image_url?: string;
  facets?: { colors: string[]; roles: string[] };
}): Promise<SuggestResponse> {
  const res = await fetch(`${API_BASE_URL}/suggest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Suggest failed (${res.status})`);
  }
  return res.json();
}

/** Card-name typeahead source. Blank query and fetch errors resolve to []. */
export async function completeCardNames(q: string): Promise<string[]> {
  if (!q.trim()) return [];
  try {
    const r = await get<{ names: string[] }>(
      `/complete/cards?q=${encodeURIComponent(q)}`,
    );
    return r.names;
  } catch {
    return [];
  }
}

/** Distinct reskin field values (approved only). Errors resolve to []. */
export async function completeReskinValues(
  field: "designer" | "art_credit" | "tags",
): Promise<string[]> {
  try {
    const r = await get<{ values: string[] }>(
      `/complete/reskin-values?field=${field}`,
    );
    return r.values;
  } catch {
    return [];
  }
}
