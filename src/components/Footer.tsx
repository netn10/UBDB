import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-gold/20 px-4 py-6 text-center text-xs text-ink/50 dark:text-ink-dark/40">
      The Omen Archive — open-source, never-for-profit. Card data via Scryfall.{" "}
      <Link href="/about" className="text-gold hover:underline">About</Link>.
    </footer>
  );
}
