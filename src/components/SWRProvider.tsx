"use client";
import { SWRConfig } from "swr";

// Global data-cache policy for in-app navigation:
//  - revalidateOnFocus off: personal DB, no refetch-storm on tab focus
//  - dedupingInterval 60s: same key within a minute served from cache, no fetch
//  - keepPreviousData: show stale data instantly while the new key loads
export default function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{ revalidateOnFocus: false, dedupingInterval: 60000, keepPreviousData: true }}
    >
      {children}
    </SWRConfig>
  );
}
