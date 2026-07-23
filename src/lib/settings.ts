"use client";
import { useEffect, useState } from "react";

export interface Settings {
  splitDfcTiles: boolean;
  dimUnreskinned: boolean;
}

const KEY = "ubdb.settings";
const DEFAULT: Settings = { splitDfcTiles: false, dimUnreskinned: false };
const EVENT = "ubdb-settings";

export function readSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT;
  try {
    return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return DEFAULT;
  }
}

export function writeSettings(next: Settings): void {
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(EVENT));
}

export function useSettings(): Settings {
  const [settings, setSettings] = useState<Settings>(DEFAULT);
  useEffect(() => {
    const sync = () => setSettings(readSettings());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return settings;
}
