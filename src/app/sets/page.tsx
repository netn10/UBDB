"use client";
import Link from "next/link";
import useSWR from "swr";
import { getSets } from "@/lib/api";

export default function SetsPage() {
  const { data: sets = [] } = useSWR("sets", getSets);

  return (
    <main className="py-6">
      <h1 className="mb-4 text-2xl font-bold">Sets</h1>
      <ul className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
        {sets.map((s) => (
          <li key={s.name}>
            <Link href={`/search?q=${encodeURIComponent(`set:"${s.name}"`)}`}
                  className="flex items-center justify-between rounded-lg border border-black/10 px-3 py-2 text-sm hover:border-accent dark:border-white/10">
              <span>{s.name}</span>
              <span className="text-black/40 dark:text-white/30">{s.count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
