# UBDB "Definitive DB" Milestone — Design

Date: 2026-07-16
Source: r/ThroughTheOmenPaths community brief ("What do you expect from the definitive UB database?").
Goal: turn UBDB from a read-only UW card DB into a community reskin database — multiple reskins per card, submission, and export.

## Community requirements → mapping
- Scryfall-for-UB search ✅ done
- Multiple reskins per card, not one enforced style — Slice 1
- "Recommended" reskin per card — Slice 1 (field exists)
- "Suggest a design" for cards without one — Slice 2
- Tagging/filter: name-style, plane, art-source (paper-MTG banned, token/un-set/alchemy tagged, **AI banned**), flavor-text, creature/keyword reskins — Slice 1 (schema) + 1b (filters)
- Decklist → pick-a-version → export (images / print PDF / MPCfill XML), duplicate-art flag — Slice 3
- Designer profiles/galleries, contact, flag errors/AI — later
- Trust: open-source, non-profit, vetting — governance, not code

## Forced order (dependencies)
Nothing works before the reskin data model exists.

### Slice 1 — Reskin data model + display  ← building now
- Data: `data/reskins/reskins.json`, array of reskin records (mirrors `cards.json` file pattern; no DB/infra yet).
- Schema per record: `_id`, `oracle_id`, `face` (0/1 for DFC), `designer_name`, `reskin_name`, `image_url`, `art_credit`, `art_source` (`original|token|unset|alchemy`), `style` (`name-bottom|nickname-bar|code`), `tags` (string[]), `is_recommended` (bool).
- Backend: load reskins at import → `_RESKINS_BY_ORACLE` + `_RESKIN_COUNTS`; enrich each card with `reskin_count`; `/cards/<id>/reskins` returns real list; `/search` passes `reskin_counts` (enables `is:reskinned`).
- Frontend: grid/list tile shows reskin count badge at bottom (or "suggest a design" affordance when 0); card page ReskinSection shows the gallery (recommended first), restyled to gold tokens.
- Types: `UbCard.reskin_count?: number`; extend `Reskin` with `art_source`, `tags`.
- Seed data is DEMO (points image_url at existing card art as a stand-in) — real designer images arrive with submission.

### Slice 1b — Reskin-aware search filters
- `style:`, `art:` (art_source), `tag:` operators — a card matches if it has a reskin with that property. Advanced page rows for style/art-source/tags.

### Slice 2 — Submission ("suggest a design")
- `/card/<id>/suggest` form: image + reskin_name + style + art_source + tags + credit.
- OPEN INFRA DECISIONS (surface before coding): image storage (upload vs designer-hosted URL like MPCfill), persistence (JSON append vs Mongo), auth (none / designer accounts), moderation (queue + AI-art flag before publish). Community demands vetting + no-AI, so a moderation gate is likely required.

### Slice 3 — Decklist → export
- Paste decklist → resolve names → pick-a-version per card → export (image folder / print PDF / MPCfill XML). Flag duplicate art across the export.

## Constraints
No auto-commit, no AI mentions in artifacts/commits. Seed reskin data is clearly demo, not real submissions.
