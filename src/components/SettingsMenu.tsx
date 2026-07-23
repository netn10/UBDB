"use client";
import { useEffect, useRef, useState } from "react";
import { useSettings, writeSettings } from "@/lib/settings";

export default function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const settings = useSettings();
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleMouseDown(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={popoverRef}>
      <button onClick={() => setOpen((o) => !o)} aria-label="Settings"
              className="rounded-card border border-gold/40 px-2 py-1 text-sm hover:border-gold hover:text-gold">
        ⚙
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-64 rounded-card border border-gold/40 bg-surface p-3 text-sm shadow-lg dark:bg-surface-dark">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.splitDfcTiles}
              onChange={() => writeSettings({ ...settings, splitDfcTiles: !settings.splitDfcTiles })}
            />
            Show both faces of double-faced cards
          </label>
          <label className="mt-2 flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.dimUnreskinned}
              onChange={() => writeSettings({ ...settings, dimUnreskinned: !settings.dimUnreskinned })}
            />
            Dim cards with no Universes Within version
          </label>
        </div>
      )}
    </div>
  );
}
