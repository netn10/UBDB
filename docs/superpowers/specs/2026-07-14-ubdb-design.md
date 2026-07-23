# UBDB — Universes Beyond Reskin Database — Design

**Date:** 2026-07-14
**Status:** Approved design, pre-plan
**Source of requirements:** r/ThroughTheOmenPaths thread "What do you expect from the 'definitive' UB website-database?" + follow-up decisions.

## Purpose

A Scryfall-like site scoped to Magic: The Gathering **Universes Beyond (UB)** cards, pairing each UB card with community **Universes Within (UW)** reskins. Users browse/search UB cards, view reskin designs, submit their own designs, and export chosen versions as printer-ready proxies. Open-source, never-for-profit, transparent costs.

## Scope

Full loop, shipped in verifiable slices:
1. Browse/search + card pages (read-only backbone)
2. Proxy export (PDF / MPCfill XML / image ZIP)
3. Auth + designer submit flow
4. Moderation (maintainer queue + git dump)

Deferred (post-MVP): multiple selectable reskin styles per user preference beyond one recommended pick, upvote-based recommendation, in-browser "Conjurer-like" card creator, contact-the-designer messaging.

## Architecture

Reuses the proven technique from `custom-cube-website` (Next.js front + Flask/Mongo back, JSON git seed).

- **Frontend:** Next.js 14 + Tailwind. Client-side search over a prebuilt index. jsPDF for proxy PDF export.
- **Backend:** Flask + MongoDB Atlas. In-memory fallback seeded from on-disk git JSON (mirrors cube's `_load_cube_docs`), so reads survive a DB outage.
- **Card backbone (UB):** a sync script hits the Scryfall API and snapshots all UB cards into git JSON (`data/ub_cards/*.json`). Refreshed by rerun, not live per request. An `image-proxy` backend route caches/serves Scryfall art.
- **Reskins (UW):** community submissions stored in Mongo, linked to a Scryfall card id, many per card. Approved reskins periodically dumped to git JSON to keep the dataset open/transparent and to feed the fallback seed.
- **Auth:** JWT + werkzeug password hashing (cube pattern) for designers and maintainers.
- **Deploy:** frontend on Heroku/Vercel, backend on Render, MongoDB Atlas free tier.

## Data Model

### `ub_cards` (Scryfall-synced, read-only, git JSON)
```
{
  oracle_id, name,              // oracle_id = stable anchor across all prints
  oracle_text, mana_cost, type_line,
  ub_franchises,                // sorted unique set names, e.g. ["Warhammer 40K", ...]
  official_uw_image | null,     // WotC-made reskin if one exists
  art_uri,                      // convenience thumb = first print with art
  prints: [                     // every UB printing of this logical card
    { scryfall_id, set, set_name, collector_number, art_uri }
  ]
}
```

### `reskins` (community, Mongo + periodic git dump)
```
{
  _id, oracle_id,               // FK -> ub_cards.oracle_id (anchor identity)
  designer_user_id, designer_name,
  reskin_name,                  // in-universe name shown on the card
  image_url,                    // uploaded card image / art
  art_credit,                   // REQUIRED (sub rule 4)
  style,                        // "bottom-name" | "godzilla-bar" | "mystical-archive" | ...
  type_reskin, keyword_reskin,  // notes: Necron->Effigy, Airbend->Enweb, etc.
  no_ai_attested,               // bool, must be true to submit (sub rule 5)
  status,                       // "pending" | "approved" | "rejected"
  reject_reason | null,
  is_recommended,               // maintainer-set default pick
  created_at
}
```

### `users` (designers / maintainers)
```
{ _id, email, password_hash, display_name, role }  // role: "designer" | "maintainer"
```

**Identity decision:** reskins anchor on `oracle_id` (Scryfall's stable per-logical-card id), NOT a per-print `scryfall_id`. A card appearing in two UB sets (e.g. reprinted across products) is one `ub_card` with multiple entries in `prints[]`, so it has a single reskin target while still showing every set it appeared in. Sync fetches with `unique=prints` and groups by `oracle_id`.

**Recommendation decision:** `is_recommended` is maintainer-picked for MVP. Upvote-based ranking is deferred (needs vote storage + abuse handling).

A card page renders one `ub_card` plus all its `approved` reskins: recommended shown first, the rest browsable (addresses differing style preferences). No approved reskin yet -> "Suggest a design" button.

## Key Flows

### Browse / search (anonymous)
Client index (prebuilt JSON: ub_cards + approved-reskin counts). Search by UB name / franchise / type. Card page fetches that card's reskins live from the backend.

### Submit (designer, authenticated)
Pick a UB card via Scryfall-backed search -> upload card image + metadata (`reskin_name`, `art_credit` **required**, `style`, `type_reskin`, `keyword_reskin`) -> POST to Flask -> stored `status: pending`. A "no AI" attestation checkbox is required (sub rule 5). Confirmation shown.

### Moderate (maintainer)
Queue of `pending` reskins -> approve / reject (+ optional reason) -> optionally set `is_recommended`. Approval flips status live; the next git dump includes it.

### Export (anonymous)
Paste a decklist (card names) -> match to `ub_cards` -> per card pick a version (recommended pre-selected) -> export as:
- printer-ready **PDF** (jsPDF; cube already implements this)
- **MPCfill XML**
- **ZIP** of images

Duplicate art across the export is flagged (shared art sources make collisions likely).

### Sync (manual / cron script)
Scryfall API -> `data/ub_cards/*.json`. Rerun picks up newly released UB sets automatically.

## Error Handling

- **Scryfall down / rate-limited:** serve the last git JSON snapshot; browse never hard-fails. Sync script throttles (~100 ms between calls, sets a descriptive User-Agent) per Scryfall API etiquette.
- **Mongo down:** in-memory fallback (cube pattern) — reads work, writes disabled behind a banner.
- **Submit validation:** reject missing `art_credit`, non-image uploads, or oversize files before any write.
- **Export:** an unmatched card name is flagged as a row, never silently dropped.

## Testing

- **Backend (pytest):** Scryfall sync parsing, submit validation, moderation state transitions, export XML/PDF shape. Match cube's existing test setup.
- **Frontend:** smoke tests on search and export flows.

## Non-Goals / Deferred

- In-browser card creator ("Conjurer-like")
- Upvotes / community ranking
- Per-user selectable style variants beyond the recommended pick
- Designer messaging / error-report threads
- Payment / donations UI (transparency doc only for now)
