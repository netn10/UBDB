import Link from "next/link";

export const metadata = { title: "About — The Omen Archive" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12" data-reveal>
      <h2 className="font-display text-2xl uppercase tracking-wider text-gold dark:text-gold-dark">{title}</h2>
      <div className="mt-3 space-y-3 font-body text-ink/75 dark:text-ink-dark/65">{children}</div>
    </section>
  );
}

export default function About() {
  return (
    <main className="py-16">
      <h1 className="font-display font-black tracking-tight text-ink dark:text-ink-dark"
          style={{ fontSize: "clamp(2.5rem, 7vw, 4.5rem)", lineHeight: 1.05 }}>
        What is The Omen Archive?
      </h1>
      <p className="mt-4 max-w-2xl font-body text-lg text-ink/70 dark:text-ink-dark/60">
        A community catalogue of Magic: The Gathering cards and the Universes Beyond
        reskins that reimagine them — mapping every card to the alternate-universe
        designs the community dreams up for it.
      </p>

      <Section title="The mission">
        <p>
          Universes Beyond turns Magic cards into crossovers. The Omen Archive collects those
          reskins in one searchable place: pick any card, see every reimagining, and
          suggest your own. Community-curated, open-source, and never-for-profit.
        </p>
      </Section>

      <Section title="How it works">
        <p>Search accepts Scryfall-style filters. A few to try:</p>
        <ul className="space-y-1 font-mono text-sm">
          <li><span className="text-gold">t:creature</span> — filter by card type</li>
          <li><span className="text-gold">id:w</span> — filter by color identity</li>
          <li><span className="text-gold">cmc&lt;=3</span> — filter by mana value</li>
          <li><span className="text-gold">fr:fallout</span> — filter by franchise (Avatar, Warhammer, Fallout)</li>
          <li><span className="text-gold">set:tla</span> — filter by set code or name (e.g. set:&quot;final fantasy commander&quot;)</li>
          <li><span className="text-gold">is:unreskinned</span> — cards with no Universes Within version yet</li>
          <li><span className="text-gold">reskins&gt;=2</span> — filter by how many reskins a card has</li>
          <li><span className="text-gold">o:/deal \d+ damage/</span> — regex match on oracle text</li>
        </ul>
        <p>
          Open any card and its <em>reskins</em> appear beneath it — alternate designs
          with art credits and tags. Hit <Link href="/search" className="text-gold hover:underline">the database</Link>{" "}
          and use “+ Suggest a design” on a card to add your own.
        </p>
      </Section>

      <Section title="Credits">
        <p>
          Card data comes from <span className="text-gold">Scryfall</span>. The Omen Archive is an
          open-source, non-commercial fan project and is not affiliated with or endorsed
          by Wizards of the Coast.
        </p>
      </Section>

      <div className="mt-14">
        <Link href="/search" className="rounded-card border border-gold/50 px-5 py-2 font-display uppercase tracking-wide transition hover:border-gold hover:text-gold">
          Enter the database →
        </Link>
      </div>
    </main>
  );
}
