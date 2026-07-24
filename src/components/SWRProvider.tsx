"use client";
import { SWRConfig } from "swr";

// In-app data-cache policy: no revalidate-on-focus (personal DB), 60s dedupe,
// keepPreviousData so stale shows instantly while the new key loads.
export default function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{ revalidateOnFocus: false, dedupingInterval: 60000, keepPreviousData: true }}
    >
      {children}
    </SWRConfig>
  );
}
