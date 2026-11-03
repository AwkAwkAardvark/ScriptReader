# Changelog

## v0.3.25 — 2026-11-03

- Silently suppress the context menu in the hosted student reader while preserving selection, keyboard shortcuts and printing.

## v0.3.24 — 2026-11-03

- Serve the Google Search Console ownership-verification file at its required public address.

## v0.3.23 — 2026-11-02

- Add master-managed staff display names with inline editing and a Google-name default, preserving account identities and access permissions.

## v0.3.22 — 2026-11-02

- Add a master-only, explicitly confirmed reset of the current Korean day’s reader allowances across all productions, with safe retries and a private metadata-only operation record.

## v0.3.21 — 2026-11-02

- Add local character focus to the teacher viewer using the student reader’s passage/context/action rules, while retaining independent rehearsal emphasis and both cast columns.

## v0.3.20 — 2026-11-02

- Consolidate casting edits and transfer tools in Roster; redirect the former assignment page.
- Add complete versioned JSON roster backups, reviewed master-only restores and cleanup, while keeping routine roster edits and committed exports available to all approved staff.

## v0.3.19 — 2026-11-02

- Add transactional, server-attributed roster change audits for editor saves, assignment CSV imports and clearing, retaining identifiers and changed field names without historical personal values.

## v0.3.18 — 2026-11-02

- Protect unsaved script preparation, song edits and assignment imports when switching productions or leaving the page.
- Keep homepage, production settings and file publication changes independent; retain preparation after failed operations.
- Treat equivalent song URLs and reverted settings as clean, while protecting empty/invalid file selections and asynchronous reads.

## v0.3.17 — 2026-10-31

- Keep commas between teacher-viewer role names outside individual role highlights.

## v0.3.16 — 2026-10-31

- Add teacher-only reading text sizing, a compact collapsible settings sidebar, and chapter links derived from existing scene headings.
- Enlarge English script text while role labels, student names, Korean, headings and controls retain their normal sizes; preserve browser zoom and rehearsal highlights.

## v0.3.15 — 2026-10-30

- Share compact staff headers, collapsible desktop navigation and mobile disclosure menus across admin pages; keep rehearsal navigation closed by default.
- Preserve production and interface-language context across staff pages, with consistent production selectors.
- Standardize bounded, keyboard-accessible CSV examples, downloads and concise helper notes across script uploads, assignment imports and the roster.

## v0.3.14 — 2026-10-30

- Add a staff roster editor with production-local students, name/class/optional-label editing, role assignment for both performances, review, undo and confirmed saving.
- Retain unassigned students, duplicate-name markers and muted multiple-role shading; place classes beside names.
- Share stale-update protection with CSV imports, preserve existing casting during migration, and keep student data separate from public scripts.

## v0.3.13 — 2026-10-30

- Apply muted orange shading to multiple-role students throughout the roster preview, including their role cards and picker choices; shared-name asterisks remain a separate cue.
- Align the teacher viewer’s compact settings strip, hamburger, typography, panel spacing and Korean-display toggle with the student reader using a shared settings label.
- Preserve teaching highlights, real casting and view-setting behavior.

## v0.3.12 — 2026-10-30

- Keep reader and teacher settings reachable while scrolling; compact mobile panels open over the page without moving script content, with bounded scrolling and keyboard dismissal.
- Use Korean placeholder names consistently in roster and assignment examples, mark shared names with an asterisk, and shade students holding multiple distinct roles only within the roster picker.
- Remove redundant roster helper text while preserving the desktop sidebar and existing teaching highlights.

## v0.3.11 — 2026-10-30

- Add a staff-only, isolated roster interface preview with fictional students, role/performance selection, duplicate-name context, optional distinguishing labels, search, undo and sample change review.
- Preview a compact app header, persistent desktop sidebar and collapsible mobile navigation, plus a consolidated CSV help pattern. Existing roster data and editing APIs remain unchanged.

## v0.3.10 — 2026-10-30

- Keep expanded assignment CSV examples within their cards on mobile, with horizontal scrolling for long rows.
- Include two or three fictional students using the selected production’s valid character tags.

## v0.3.9 — 2026-10-30

- Add a private full-script Teacher Viewer with both performance casts, independent class/performance highlighting, and compact collapsed controls for mobile.
- Add validated student-assignment CSV uploads, preview, confirmed replacement/deletion, and stale-update protection separate from public script revisions.
- Prevent script replacements from removing assigned character tags and test student-data isolation from anonymous reader responses and public artifacts.
- Place song line references beside their titles rather than beside the video buttons.

## v0.3.8 — 2026-10-29

- Lead song editing with clean title headings and subdued italic line references beside the video action; retain unavailable actions in a faded disabled state.
- Remove routine link-status rows, keep pending-removal feedback, and make Remove/Undo controls quieter.
- Move the upload publication note beside validation as compact italic helper text.
- Rename personal account navigation to My Account and master-only staff controls to Access Management, with matching page titles.

## v0.3.7 — 2026-10-29

- Replace fictional staff CSV examples with selected Chapter 3 merchant records, their actual cast mappings, and the Butter marker with its official video association; preserve source identifiers.
- Style reader, song-management, and video links as consistent secondary actions with visible keyboard focus and external-link indicators.
- Clarify three-letter tags for new named roles and three-letter-plus-number tags for ensemble members, while preserving established identifiers.

## v0.3.6 — 2026-10-29

- Move published song-link management to a dedicated Songs page, grouped in one collapsed card per selected production.
- Place default context sliders first, matching the student reader; generate production link identifiers automatically.
- Collapse existing-production file uploads, add small downloadable CSV examples, and keep replacement-song review together at the bottom of the upload workflow.

## v0.3.5 — 2026-10-29

- Separate administration into account/status, Scripts, and master-only Accounts pages; use a production dropdown with refreshable direct links.
- Retain song links through unique title matches when replacing scripts; media CSV rows now override only supplied associations.
- Add song-link inspection, explicit replacement/removal, unmatched-song review, and independent immutable link revisions.
- Align the fallback publisher, validation/preview, documentation, and browser checks with the new retention behavior.

## 0.3.4

- Add private production administration with CSV validation, interactive preview, and explicit publication for approved staff.
- Add independent reader-title and per-production context defaults, with conflict protection for concurrent updates.
- Allow staff to choose a published production or blank importer as the homepage, preserving existing direct links and keeping the production directory private.
- Keep annual productions separate and retain the current Aladdin 2026 title, content revision, and homepage during rollout.

## v0.3.3 — 2026-10-29

- Add Google sign-in support through Supabase Auth and a bilingual `/admin` account-management interface.
- Add access requests, approvals, role changes, revocation and re-requests, backed by server-only membership operations.
- Support equal masters with transactional protection against a fourth master or removal of the last master, including self-service handover.
- Keep authentication in server-managed browser-session cookies and preserve anonymous student reading.
- Add authentication, permission, concurrency and browser workflow tests. Google provider configuration and trusted first-master setup are installation steps.

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
