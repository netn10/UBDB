"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { adminPending, adminModerate, login as apiLogin, logout as apiLogout, getImageSrc } from "@/lib/api";
import { Reskin } from "@/types/types";

const TOKEN_KEY = "ubdb.session";

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<Reskin[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [authed, setAuthed] = useState(false);

  const load = useCallback(async (tok: string) => {
    setError(null);
    try {
      setPending(await adminPending(tok));
      setAuthed(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "unauthorized") {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setAuthed(false);
      } else {
        setError(msg);
      }
    }
  }, []);

  useEffect(() => {
    const t = localStorage.getItem(TOKEN_KEY);
    if (t) {
      setToken(t);
      load(t);
    }
  }, [load]);

  async function doLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const { token: tok } = await apiLogin(username.trim(), password);
      localStorage.setItem(TOKEN_KEY, tok);
      setToken(tok);
      setPassword("");
      await load(tok);
    } catch {
      setError("Invalid username or password.");
    }
  }

  async function doLogout() {
    if (token) await apiLogout(token);
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setAuthed(false);
    setPending([]);
  }

  async function moderate(id: string, action: "approve" | "reject") {
    if (!token) return;
    try {
      await adminModerate(id, action, token);
      setPending((p) => p.filter((r) => r._id !== id));
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }

  if (!authed) {
    return (
      <main className="py-8">
        <h1 className="mb-6 font-display text-2xl font-black uppercase tracking-[0.15em] text-gold dark:text-gold-dark">
          Admin login
        </h1>
        <form onSubmit={doLogin} className="grid max-w-xs gap-3">
          <input value={username} onChange={(e) => setUsername(e.target.value)}
                 placeholder="username" autoComplete="username"
                 className="rounded-card border border-gold/40 bg-transparent px-3 py-2 text-sm focus:border-gold" />
          <input value={password} onChange={(e) => setPassword(e.target.value)}
                 type="password" placeholder="password" autoComplete="current-password"
                 className="rounded-card border border-gold/40 bg-transparent px-3 py-2 text-sm focus:border-gold" />
          <button type="submit"
                  className="rounded-card bg-gold px-3 py-2 font-display text-sm uppercase tracking-wide text-frame hover:brightness-110">
            Sign in
          </button>
          {error && <p className="font-mono text-sm text-mana-r">{error}</p>}
        </form>
      </main>
    );
  }

  return (
    <main className="py-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="mb-1 font-display text-2xl font-black uppercase tracking-[0.15em] text-gold dark:text-gold-dark">
            Moderation
          </h1>
          <p className="font-body text-sm text-ink/55 dark:text-ink-dark/55">
            Pending reskin submissions. Approve to publish, reject to discard. Reject AI art and paper-Magic art per community rules.
          </p>
        </div>
        <button onClick={doLogout}
                className="no-print rounded-card border border-gold/40 px-3 py-1.5 font-display text-sm uppercase tracking-wide hover:border-gold hover:text-gold">
          Log out
        </button>
      </div>

      {error && <p className="mb-4 font-mono text-sm text-mana-r">Failed: {error}</p>}

      {authed && pending.length === 0 && (
        <p className="font-body italic text-ink/55 dark:text-ink-dark/50">Nothing pending. Inbox zero.</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {pending.map((r) => (
          <div key={r._id} className="flex gap-3 rounded-card border-2 border-gold/40 p-3">
            <img src={getImageSrc(r.image_url)} alt={r.reskin_name} className="w-28 shrink-0 rounded-card" />
            <div className="flex flex-1 flex-col">
              <div className="font-body font-medium">{r.reskin_name}</div>
              <div className="font-mono text-[11px] text-ink/50 dark:text-ink-dark/40">
                by {r.designer_name} · art: {r.art_credit || "—"}
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                <span className="rounded-card bg-gold/10 px-1.5 text-[10px] uppercase tracking-wide text-gold">{r.art_source}</span>
                <span className="rounded-card bg-gold/10 px-1.5 text-[10px] uppercase tracking-wide text-gold">{r.style}</span>
                {(r.tags ?? []).map((t) => (
                  <span key={t} className="rounded-card bg-ink/5 px-1.5 text-[10px] text-ink/55 dark:bg-ink-dark/10 dark:text-ink-dark/50">{t}</span>
                ))}
              </div>
              <Link href={`/card/${r.oracle_id}`} className="mt-1 font-mono text-[11px] text-gold hover:underline">
                view card →
              </Link>
              <div className="mt-auto flex gap-2 pt-2">
                <button onClick={() => moderate(r._id, "approve")}
                        className="rounded-card bg-gold px-3 py-1 font-display text-sm uppercase tracking-wide text-frame hover:brightness-110">
                  Approve
                </button>
                <button onClick={() => moderate(r._id, "reject")}
                        className="rounded-card border border-mana-r/50 px-3 py-1 font-display text-sm uppercase tracking-wide text-mana-r hover:bg-mana-r/10">
                  Reject
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
