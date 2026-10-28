# Hosted deployment and publishing

The hosted reader uses Cloudflare Pages with Pages Functions and Supabase Postgres. Student links use `/p/<slug>`; local-file import is at `/import`. App deployment and script publication are independent. For local use, automated checks, and the security model, see the [development guide](development.md).

## Local development and checks

Requires Node 22.12+. Run `npm ci`, then:

```sh
npm run dev:hosted
```

Open `http://127.0.0.1:5173/p/synthetic-garden`. This runs the actual application API with a temporary local PostgreSQL database (PGlite), seeded only with fictional data. Everything is cleared on shutdown. The video's synthetic IDs are placeholders; browser tests intercept them instead of contacting YouTube. There are no Supabase credentials needed for this demo.

```sh
npm test
npm run build:demo
npx playwright install chromium
npm run test:hosted-browser
```

The browser check exercises the local publisher, API, browser cookies, preloading, larger context, sixth-character rejection, mobile widths and print. It writes synthetic artifacts to the ignored output directory reported by the check script. `PLAYWRIGHT_EXECUTABLE_PATH` can select an existing Chromium installation. Playwright and PGlite are development dependencies, not student requirements or production storage.

## First-time setup

Routine content updates do not recreate infrastructure or rerun applied migrations. Check the target project's migration history when setting up or updating an installation.

### Database migrations

The checked-in SQL migrations create four RLS-protected tables and two server-only RPC functions. Apply the migrations once to your intended Supabase project, using Supabase's migration tools or the connected Supabase integration. Keep the remote migration history aligned with the checked-in version. Do not run the SQL again on an already-migrated project.

`reader_publish` validates its basic payload contract and creates a complete revision in one transaction, then changes the active pointer. `reader_fetch` performs throttling and character admission in one transaction and returns metadata or the private revision **only to the trusted server**. It uses row locking for count-and-admit and separate allowances for each production/day.

Only `service_role` has application privileges. `anon`, `authenticated`, and `PUBLIC` cannot select script tables or execute these RPC functions. RLS intentionally has no client policies because browsers have no direct database access; the advisor's informational “RLS Enabled No Policy” result is expected for this design ([Supabase explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)).

### Cloudflare build and runtime

Connect the GitHub repository to a Pages project. Use Node 22, build command `npm run build`, and output directory `dist`. The root `functions/` directory supplies the API, and `wrangler.jsonc` supplies non-secret runtime settings. Production follows the chosen production branch. The Cloudflare GitHub installation and Cloudflare API/tool authentication are separate connections; authorizing one does not establish the other.

The server expects these encrypted runtime bindings:

| Binding | Purpose |
| --- | --- |
| `SUPABASE_URL` | Target database project's API URL |
| `SUPABASE_SECRET_KEY` | Server key used by the database adapter |
| `BROWSER_COOKIE_SECRET` | Cryptographically random browser-cookie signing secret |

The URL is encrypted in this setup alongside the two secrets because checked-in Wrangler runtime variables override dashboard plaintext variables. None of these bindings needs a `VITE_` prefix. Local publisher credentials can be configured using `.env.example` and an ignored `.env`; API-based publishing does not require the database password.

The cookie is Secure, HttpOnly, SameSite=Lax, and host-only, so hosted use requires HTTPS. Replacing its signing secret or changing hostname resets browser identities and their allowances. A local Cloudflare-runtime preview uses ignored `.dev.vars` with `npm run preview:cloudflare` after building. The synthetic hosted development workflow needs no cloud credentials.

### Request controls

`wrangler.jsonc` defines configurable per-minute browser, IP, and new-identity request limits. The database enforces five distinct characters per browser/production/Korean day. Requesting the same character or more context does not consume another slot. Rate responses include `Retry-After`; character-allowance responses identify the next midnight in Asia/Seoul.

API calls clean up expired allowance/rate buckets. The retention migration also schedules cleanup every five minutes while the database project is running. Cleanup retains the current/prior Korean allowance days and two days of rate buckets. The local embedded database uses API-time cleanup.

## Validate and publish a production

Prepare matching script/cast files and an optional complete media file using the [input preparation guide](csv-tagging-guide.md).

```sh
npm run publish:script -- --slug paper-garden --title "The paper garden" --script /path/to/script.csv --cast /path/to/cast.csv --media /path/to/media.csv
```

This command validates only; it prints counts and diagnostics, not dialogue. Both script and cast are required for hosted publishing. Character choices preserve cast CSV row order; reorder that roster to organize a production without hard-coding its roles into the reader.

The optional media CSV has exactly these columns:

```text
No,YouTubeURL
```

Provide one existing Song record number and an HTTPS YouTube URL per row. Only YouTube watch, short-link, shorts, or embed URLs with valid video IDs are accepted; duplicate song numbers and non-song associations fail validation. Song membership tags are not inferred or changed. URLs identify videos, not permission to stream them: embedding may still be restricted by the uploader or browser, so the reader retains an external link.

After validation, adding `--publish` explicitly performs the publication. Every revision is self-contained: omitting the media file means **no media associations in the new revision**, rather than carrying potentially incorrect record-number mappings from an earlier script.

New visits use the active revision. An existing reader does not mix revisions: if a later request finds an update, it asks for reload. Previously downloaded text can remain in memory until reload; this is not remote revocation of content already delivered.

## Content revisions and recovery

Each publication saves a complete script/cast/media snapshot and atomically switches the production's active revision. The publisher returns the new revision identifier. Previous snapshots remain available for rollback; this is application-managed publication history, not Git history or a record of unpublished edits.

Keeping a production's slug stable updates that production; choosing another slug creates a separate production with its own revision and allowances. To roll back content, confirm that an earlier revision belongs to the intended production, then transactionally set its `active_revision` to that revision through a trusted administrator connection. Verify metadata and a representative selected view. Restoring the pointer does not require editing stored snapshots or changing database grants.

Application rollback is separate: select a known-good Cloudflare deployment and reconcile the code with a normal revert commit so the next deployment preserves the correction. Existing tags and source history can remain intact.
