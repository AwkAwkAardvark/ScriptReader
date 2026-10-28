# Changelog

## v0.3.2 — 2026-10-28

- Consolidate shared documentation into preparation, development, and hosting guides; keep operational account and incident notes local.
- Explain script/cast preparation with an eleven-record Chapter 3 example and the official BTS Butter video association.
- Document tool-neutral contribution branches, frequent checkpoints, and patch releases; complete the preceding release notes.

## v0.3.1 — 2026-10-28

Changes since v0.3.0:

- Fold mobile settings after character selection; use the production title and hamburger menu without repeated character headings. Keep header placement and corners stable when toggling.
- Replace context presets with independent 0–5 sliders, initially 2 before / 1 after; apply pointer changes on release and keyboard changes immediately.
- Show actions/cues by default and add an explicit hide toggle; retain inline parenthetical directions and consistent print behavior.
- Italicize balanced parenthetical directions in dialogue and use the approved header logo.
- Support unnamed cast-list dividers and explicitly label the character-allowance reset time.
- Route the hosted root to the main production, retain `/import`, and reject unknown routes.
- Add automatic tests/build/exposure/browser checks, strengthen rendering checks, and fix localhost hosted-preview access.

## v0.3.0 — 2026-10-26

- Hosted production links backed by Cloudflare Pages Functions and private Supabase storage, with no student login.
- Validated script/cast publishing, immutable revisions, and reload prompts when content changes.
- Server-side passage filtering, memory-only view caching, default 2-before/1-after context, and larger context on demand.
- Five distinct characters per browser/production/Korean day, with atomic admission and request throttles.
- Revision-local YouTube associations, one expandable player at a time, and external-link fallback.
- Existing bilingual display, print/PDF output, local CSV import, and portable offline demo retained.
- Deployed pilot accepted; script publication is versioned independently from application releases.

## v0.2.0

- Shared screen/print document with A4 PDF layout, bilingual font preparation, and oversized-entry pagination.
- Portable self-contained HTML demo without embedded script data.

## v0.1.1

- Explicit cast CSV import, canonical character identities, and roster-aware validation and attribution.

## v0.1.0

- Local CSV reader, deterministic character/context filtering, scene/song boundaries, mobile layout, and bilingual controls.
