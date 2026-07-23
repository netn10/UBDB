"use client";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/** Slim gold bar that crawls + fades on every route settle. Dependency-free.
 *  Not shown for users who prefer reduced motion. */
export default function TopProgress() {
  const pathname = usePathname();
  const params = useSearchParams();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    setShow(true);
    const t = setTimeout(() => setShow(false), 600);
    return () => clearTimeout(t);
  }, [pathname, params]);

  if (!show) return null;
  return <div className="top-progress" aria-hidden />;
}
