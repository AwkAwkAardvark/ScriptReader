# Hosted reader operations

The hosted site uses Cloudflare Pages with Pages Functions and Supabase Postgres. The browser calls the same-origin application API; it never receives a database secret or the complete stored revision. App deployment and content publishing are separate operations.

This guide describes procedures, not permission to execute them. A request to fix script, cast, participation tags, or media means **prepare and validate the correction, then ask the owner explicitly for permission to publish**. Summarize the changes and target production in that request. Do not publish until approval arrives; app merge/deployment authorization does not authorize content publication. Project provisioning and credential changes also require their own applicable authorization.

## Current deployment settings

| Setting | Current configuration |
| --- | --- |
| Hosting | Cloudflare Pages with Pages Functions, on its `pages.dev` address |
| Production branch | `main`; automatic Git-connected builds |
| Build | Node 22, `npm run build`, output `dist` |
| Branch previews | Disabled |
| Main production | `/p/aladdin`; `/` redirects here |
| Three-scene review sample | `/p/aladdin-pilot`, normally using `Gua1` |
| Local-file reader | `/import`; unknown routes do not open the importer |

Student production links use `/p/<slug>`. The standalone HTML demo is separate. These settings describe the existing deployment; they are not instructions to recreate it.

Default configurable server limits:

| Setting | Default |
| --- | --- |
| `BROWSER_REQUESTS_PER_MINUTE` | 60 |
| `IP_REQUESTS_PER_MINUTE` | 1,200 |
| `NEW_IDENTITIES_PER_MINUTE` | 120 |
| Distinct characters | 5 per browser/production/Korean calendar day |

The IP throttle is deliberately shared-network tolerant; the five-character allowance is never per IP. Reopening the same character or requesting more context does not consume another slot. Rate responses include `Retry-After`; quota responses include the next midnight in Asia/Seoul. A Supabase Cron job purges expired data every five minutes while the project is running; API requests also purge it. It retains current/prior Korean allowance days and two days of rate buckets, with up to five minutes of scheduled-cleanup delay. The embedded local database uses API-time cleanup. No raw IP addresses or script text are logged by the application.

Context controls use independent Before/After sliders from 0–5, initially 2/1. Pointer dragging changes the number locally and applies the passage request on release; keyboard adjustments apply immediately. The API rejects non-integer or out-of-range counts before contacting the database. Small context views remain prefetched; larger supported views are fetched on demand.

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

The browser check exercises the local publisher, API, browser cookies, preloading, larger context, sixth-character rejection, mobile widths and print. It writes synthetic artifacts under ignored `.agent-local/previews/milestone-3/`. `PLAYWRIGHT_EXECUTABLE_PATH` can select an existing Chromium installation. Playwright and PGlite are development dependencies, not student requirements or production storage.

## First-time setup

Inspect the intended project and its migration history before setup. Apply only missing setup steps; routine content updates do not require recreating resources or rerunning applied migrations.

### Database migrations

The checked-in SQL migrations create four RLS-protected tables and two server-only RPC functions. Apply the migrations once to your intended Supabase project, using Supabase's migration tools or the connected Supabase integration. Keep the remote migration history aligned with the checked-in version. Do not run the SQL again on an already-migrated project.

`reader_publish` validates its basic payload contract and creates a complete revision in one transaction, then changes the active pointer. `reader_fetch` performs throttling and character admission in one transaction and returns metadata or the private revision **only to the trusted server**. It uses row locking for count-and-admit and separate allowances for each production/day.

Only `service_role` has application privileges. `anon`, `authenticated`, and `PUBLIC` cannot select script tables or execute these RPC functions. RLS intentionally has no client policies because browsers have no direct database access; the advisor's informational “RLS Enabled No Policy” result is expected for this design ([Supabase explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)). The automatic-RLS event trigger remains enabled, but its helper is not exposed as a public RPC.

### Cloudflare configuration

Connect the private GitHub repository, use a Vite build with `npm run build`, output directory `dist`, Node 22, and the intended production branch. The root `functions/` directory supplies the same-origin API and `wrangler.jsonc` contains non-secret settings. Preview deployments must use a synthetic-only database; do not give branch previews access to real production material.

Cloudflare account-tool access and its GitHub installation are separate connections. Before creating a Git-integrated project, authorize the Cloudflare GitHub app for this repository through Pages' **Import an existing Git repository** flow. If project creation returns error `8000011` about the Pages Git installation, check that installation and its repository access before retrying; reconnecting the account tools alone does not establish Git access. Keep branch previews disabled and configure server secrets only for the intended deployment environment.

Configure these **server secrets** through the dashboard or authenticated Cloudflare tooling:

- `SUPABASE_URL`: intended project URL.
- `SUPABASE_SECRET_KEY`: the server key for that project.
- `BROWSER_COOKIE_SECRET`: a high-entropy signing secret, generated with a cryptographically secure random generator and saved directly to a private, ignored file or the provider’s encrypted settings. Do not print it in logs or put it in chat. Preserve an existing signing secret during routine deployments.

Local `.env` access is not required to configure hosting. From another device, copy the Supabase server key directly from that project's **Settings > API Keys** into the Pages project's **Settings > Variables and Secrets**, selecting **Production** and **Encrypt/Secret**. Never send it through chat. Set **all three bindings above as encrypted secrets**, including the URL, then redeploy so the Functions receive the settings. This matters because the checked-in Wrangler configuration controls plaintext runtime variables and overrides dashboard plaintext settings during deployment. Secret presence can be verified by name/type without revealing its value. A connected administrator may also publish a locally validated payload through the existing `reader_publish` RPC using the Supabase management connection; this does not require copying the server key to the local workstation.

For routine credential handling and safe partial updates, see the [security guide](security.md#configuration-changes-and-recovery). Never write a masked environment map back to Cloudflare.

For an authenticated local Cloudflare-runtime preview, put the same values in ignored `.dev.vars` and run `npm run preview:cloudflare` after building. The synthetic `dev:hosted` workflow remains independent of those secrets.

The application sets a Secure, HttpOnly, SameSite=Lax, host-only cookie. Deploy behind HTTPS. Keep keys the same across deployments to preserve browser identity; changing the cookie secret or moving to a different hostname resets browser identities and allowances. These allowances do not identify students across browsers or cookie deletion.

### Local publisher access

For local CLI access, copy `.env.example` to ignored `.env` and enter the project's URL and a server secret key there. A new `sb_secret_...` key or legacy `service_role` key is supported. Never use a publishable key for the publisher and never put a secret in a `VITE_` variable, Git, chat, or browser code. The tool loads `.env` locally. Keep the database password in your password manager; these API operations do not require it.

## Validate and publish a production

Prepare the full matching script/cast files and optional complete media file. Fix and validate inputs before requesting permission to publish.

```sh
npm run publish:script -- --slug paper-garden --title "The paper garden" --script /path/to/script.csv --cast /path/to/cast.csv --media /path/to/media.csv
```

This command validates only; it prints counts and diagnostics, not dialogue. Both script and cast are required for hosted publishing. Prepare them using the [CSV tagging guide](csv-tagging-guide.md). Character choices preserve cast CSV row order; reorder that roster to organize a production without hard-coding its roles into the reader.

The optional media CSV has exactly these columns:

```text
No,YouTubeURL
```

Provide one existing Song record number and an HTTPS YouTube URL per row. Only YouTube watch, short-link, shorts, or embed URLs with valid video IDs are accepted; duplicate song numbers and non-song associations fail validation. Song membership tags are not inferred or changed. URLs identify videos, not permission to stream them: embedding may still be restricted by the uploader or browser, so the reader retains an external link.

Review the counts, including video count, and obtain explicit owner approval for this publication. Only then add `--publish` to the same command. Every revision is self-contained: omitting the media file means **no media associations in the new revision**, rather than carrying potentially incorrect record-number mappings from an earlier script.

New visits use the active revision. An existing reader does not mix revisions: if a later request finds an update, it asks for reload. Previously downloaded text can remain in memory until reload; this is not remote revocation of content already delivered.

## Content revision history

Each publication saves a complete script/cast/media snapshot as a new database revision and switches the production's active revision in one transaction. Previous snapshots remain available for rollback. This history is implemented by the publisher; it is not Git history or an automatic record of every database edit. Unpublished CSV edits, change descriptions, and convenient diffs are not automatically recorded.

Before publication, privately record the production, existing active revision, a short description of the intended changes, and validation counts. Record the new revision afterward. These operational notes support the snapshots without adding another repository or spreadsheet integration.

## Publishing and recovery

Script publishing and application deployment are independent. Publishing changes the active data revision without rebuilding the frontend. Validate the complete script, cast, and optional complete media sidecar before each publication; preserve source order and record identifiers. Song participation may remain blank while casting is pending. Blank song tags do not independently select a passage, but song markers still appear in included scenes. Never infer participants or rewrite source text.

Keep the production slug stable when revising an existing script. A separately named pilot remains a separate production with its own revision and allowance. Existing tabs detect changed revisions on a subsequent server request and ask for reload; downloaded text is not remotely revoked.

To roll back content, use the trusted administrator connection to confirm the old revision belongs to the intended production, then transactionally set that production's `active_revision` to that exact revision. Do not edit the revision payload, change grants, rotate secrets, or delete other productions as part of rollback. Verify metadata and a representative passage after switching the pointer.

Application recovery is separate: roll back to a known-good Cloudflare production deployment and reconcile the source with a normal revert commit on `main` so the next build preserves the fix. Preserve history; do not force-push release tags or reset the main branch.

### Git connection recovery

If an existing project reports `Repository not found` even though the GitHub app has access and the saved repository owner/ID are correct, the project's saved Git connection may need refreshing. Reauthorizing the GitHub app alone may not refresh that project link. Save the existing source configuration, then use the Pages source endpoints to disconnect and reconnect **the same repository on the same project**: `DELETE /accounts/{account_id}/pages/projects/{project_name}/source`, followed by `POST` to that path with the saved `type` and `config`. Preserve the production branch, automatic deployment settings, and disabled previews. This operation uses source metadata only; do not send deployment configuration or masked environment maps. Keep the current project and its secrets. Verify the build configuration and secret names/types afterward, then start a fresh deployment and confirm it can fetch the private repository and serve the expected app/API. The current deployment remains available during reconnection.

## Release verification

Use checks appropriate to the change as described in the [development guide](development.md#checks); use authorized private input only for manual acceptance. Check representative roles, context and cue modes, scene/song boundaries, Korean display, mobile widths, YouTube playback/fallback, PDF output, secure cookie persistence, and absence of script storage in the browser. Check that the API returns selected views rather than a complete stored revision. Keep the existing five-role allowance and rate controls unchanged.

Keep full production inputs, media sidecars, private review artifacts, credentials, and local guidance outside Git and application bundles. The [CSV guide](csv-tagging-guide.md#worked-example-chapter-3) contains a specifically authorized documentation excerpt; it is not a production fixture. For credential boundaries and exposure checks, see the [security guide](security.md).
