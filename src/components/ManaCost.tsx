const PIP: Record<string, { bg: string; fg: string }> = {
  W: { bg: "#fefcd8", fg: "#111" },
  U: { bg: "#aae0fa", fg: "#111" },
  B: { bg: "#cbc2bf", fg: "#111" },
  R: { bg: "#f9aa8f", fg: "#111" },
  G: { bg: "#9bd3ae", fg: "#111" },
  C: { bg: "#cac5c0", fg: "#111" },
  P: { bg: "#cbb3d6", fg: "#111" },
};

function label(sym: string): { text: string; key: string } {
  const s = sym.replace(/\//g, "");
  if (/^\d+$/.test(s) || s === "X" || s === "Y" || s === "Z") {
    return { text: s, key: "C" };
  }
  const known = [...s].find((ch) => PIP[ch]);
  return { text: s, key: known ?? "C" };
}

export default function ManaCost({ cost }: { cost?: string | null }) {
  if (!cost) return null;
  const symbols = cost.match(/\{([^}]+)\}/g) || [];
  return (
    <span className="inline-flex gap-0.5 align-middle">
      {symbols.map((raw, i) => {
        const { text, key } = label(raw.slice(1, -1));
        const c = PIP[key];
        return (
          <span
            key={i}
            title={raw}
            className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold leading-none"
            style={{ backgroundColor: c.bg, color: c.fg }}
          >
            {text}
          </span>
        );
      })}
    </span>
  );
}
