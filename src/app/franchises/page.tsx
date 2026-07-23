"use client";
import Link from "next/link";
import useSWR from "swr";
import { getFranchises } from "@/lib/api";

export default function FranchisesPage() {
  const { data: franchises = [] } = useSWR("franchises", getFranchises);

  return (
    <main className="py-6">
      <h1 className="mb-4 text-2xl font-bold">Franchises</h1>
      <ul className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
        {franchises.map((f) => (
          <li key={f.name}>
            <Link href={`/search?q=${encodeURIComponent(`fr:"${f.name}"`)}`}
                  className="flex items-center justify-between rounded-lg border border-black/10 px-3 py-2 text-sm hover:border-accent dark:border-white/10">
              <span>{f.name}</span>
              <span className="text-black/40 dark:text-white/30">{f.count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
