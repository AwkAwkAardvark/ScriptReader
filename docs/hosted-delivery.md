# Hosted reader operations

The hosted site uses Cloudflare Pages with Pages Functions and Supabase Postgres. The browser calls the same-origin application API; it never receives a database secret or the complete stored revision. The local-file reader at `/` and standalone HTML remain available separately. Student production links use `/p/<slug>`.

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

## Database migrations

The checked-in SQL migrations create four RLS-protected tables and two server-only RPC functions. Apply the migrations once to your intended Supabase project, using Supabase's migration tools or the connected Supabase integration. Keep the remote migration history aligned with the checked-in version. Do not run the SQL again on an already-migrated project.

`reader_publish` validates its basic payload contract and creates a complete revision in one transaction, then changes the active pointer. `reader_fetch` performs throttling and character admission in one transaction and returns metadata or the private revision **only to the trusted server**. It uses row locking for count-and-admit and separate allowances for each production/day.

Only `service_role` has application privileges. `anon`, `authenticated`, and `PUBLIC` cannot select script tables or execute these RPC functions. RLS intentionally has no client policies because browsers have no direct database access; the advisor's informational “RLS Enabled No Policy” result is expected for this design ([Supabase explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)). The automatic-RLS event trigger remains enabled, but its helper is not exposed as a public RPC.

## Validate and publish a production

Copy `.env.example` to ignored `.env` and enter the project's URL and a server secret key there. A new `sb_secret_...` key or legacy `service_role` key is supported. Never use a publishable key for the publisher and never put a secret in a `VITE_` variable, Git, chat, or browser code. The tool loads `.env` locally. Keep the database password in your password manager; these API operations do not require it.

```sh
npm run publish:script -- --slug paper-garden --title "The paper garden" --script /path/to/script.csv --cast /path/to/cast.csv --media /path/to/media.csv
```

This command validates only; it prints counts and diagnostics, not dialogue. Both script and cast are required for hosted publishing. Their schemas match the existing CSV guide.

The optional media CSV has exactly these columns:

```text
No,YouTubeURL
```

Provide one existing Song record number and an HTTPS YouTube URL per row. Only YouTube watch, short-link, shorts, or embed URLs with valid video IDs are accepted; duplicate song numbers and non-song associations fail validation. Song membership tags are not inferred or changed. URLs identify videos, not permission to stream them: embedding may still be restricted by the uploader or browser, so the reader retains an external link.

Review the counts, including video count. Add `--publish` to the same command to publish. Every revision is self-contained: omitting the media file means **no media associations in the new revision**, rather than carrying potentially incorrect record-number mappings from an earlier script.

New visits use the active revision. An existing reader does not mix revisions: if a later request finds an update, it asks for reload. Previously downloaded text can remain in memory until reload; this is not remote revocation of content already delivered.

## Cloudflare configuration

The hosted deployment is active on Cloudflare Pages with Pages Functions, using the provider's `pages.dev` address. Production follows `main`; other branch previews are disabled. The local-file route remains available at `/`. No custom domain or legacy website changes are required. The following instructions describe setup and maintenance; inspect the existing project before creating resources or applying migrations.

Connect the private GitHub repository, use a Vite build with `npm run build`, output directory `dist`, Node 22, and the intended production branch. The root `functions/` directory supplies the same-origin API and `wrangler.jsonc` contains non-secret settings. Preview deployments must use a synthetic-only database; do not give branch previews access to real production material.

Cloudflare account-tool access and its GitHub installation are separate connections. Before creating a Git-integrated project, authorize the Cloudflare GitHub app for this repository through Pages' **Import an existing Git repository** flow. If project creation returns error `8000011` about the Pages Git installation, check that installation and its repository access before retrying; reconnecting the account tools alone does not establish Git access. During a private-data pilot, disable other branch previews and configure server secrets only for the intended deployment environment.

Configure these **server secrets** through the dashboard or authenticated Cloudflare tooling:

- `SUPABASE_URL`: intended project URL.
- `SUPABASE_SECRET_KEY`: the server key for that project.
- `BROWSER_COOKIE_SECRET`: a high-entropy signing secret, generated with `node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"` and saved privately.

Local `.env` access is not required to configure hosting. From another device, copy the Supabase server key directly from that project's **Settings > API Keys** into the Pages project's **Settings > Variables and Secrets**, selecting **Production** and **Encrypt/Secret**. Never send it through chat. Set **all three bindings above as encrypted secrets**, including the URL, then redeploy so the Functions receive the settings. This matters because the checked-in Wrangler configuration controls plaintext runtime variables and overrides dashboard plaintext settings during deployment. Secret presence can be verified by name/type without revealing its value. A connected administrator may also publish a locally validated payload through the existing `reader_publish` RPC using the Supabase management connection; this does not require copying the server key to the local workstation.

When updating Pages secrets through the API, send only the changed entries in `deployment_configs.production.env_vars`, as Wrangler's Pages secret commands do. The API merges those entries. Never copy the environment map from a GET response into a PATCH: secret values are masked there, and sending those blank values replaces the stored secrets.

For an authenticated local Cloudflare-runtime preview, put the same values in ignored `.dev.vars` and run `npm run preview:cloudflare` after building. The synthetic `dev:hosted` workflow remains independent of those secrets.

The application sets a Secure, HttpOnly, SameSite=Lax, host-only cookie. Deploy behind HTTPS. Keep keys the same across deployments to preserve browser identity; changing the cookie secret or moving to a different hostname resets browser identities and allowances. These allowances do not identify students across browsers or cookie deletion.

Default configurable server limits:

| Setting | Default |
| --- | --- |
| `BROWSER_REQUESTS_PER_MINUTE` | 60 |
| `IP_REQUESTS_PER_MINUTE` | 1,200 |
| `NEW_IDENTITIES_PER_MINUTE` | 120 |
| Distinct characters | 5 per browser/production/Korean calendar day |

The IP throttle is deliberately shared-network tolerant; the five-character allowance is never per IP. Reopening the same character or requesting more context does not consume another slot. Rate responses include `Retry-After`; quota responses include the next midnight in Asia/Seoul. A Supabase Cron job purges expired data every five minutes while the project is running; API requests also purge it. It retains current/prior Korean allowance days and two days of rate buckets, with up to five minutes of scheduled-cleanup delay. The embedded local database uses API-time cleanup. No raw IP addresses or script text are logged by the application.

## Publishing and recovery

Script publishing and application deployment are independent. Publishing changes the active data revision without rebuilding the frontend. Validate the complete script, cast, and optional complete media sidecar before each publication; preserve source order and record identifiers. Current song participation may remain blank while casting is finalized. Blank song tags do not independently select a passage, but song markers still appear in included scenes. Never infer participants or rewrite source text.

Keep the production slug stable when revising an existing script. A separately named pilot remains a separate production with its own revision and allowance. Existing tabs detect changed revisions on a subsequent server request and ask for reload; downloaded text is not remotely revoked.

Before publishing, record the existing active revision identifier privately, along with aggregate validation results and the new revision identifier afterward. Previous immutable revisions remain in Supabase. To recover, use the trusted administrator connection to confirm the old revision belongs to the intended production, then transactionally set that production's `active_revision` to that exact revision. Do not edit the revision payload, change grants, rotate secrets, or delete other productions as part of rollback. Verify metadata and a representative passage after switching the pointer.

Application recovery is separate: roll back to a known-good Cloudflare production deployment and reconcile the source with a normal revert commit on `main` so the next build preserves the fix. Preserve history; do not force-push release tags or reset the main branch.

## Release verification

Milestone 3 was accepted after the deployed three-scene pilot. Verify the synthetic suite and build before release; use authorized private input only for manual acceptance. Check representative roles, context and cue modes, scene/song boundaries, Korean display, mobile widths, YouTube playback/fallback, PDF output, secure cookie persistence, and absence of script storage in the browser. Check that the API returns selected views rather than a complete stored revision. Keep the existing five-role allowance and rate controls unchanged.

Keep all real inputs, media sidecars, private review artifacts, and agent guidance outside Git and application bundles. Publishing requires explicit owner authorization; the current full-script rollout is authorized, while future inputs still require their own intended publication scope. No further numbered milestones are defined. Recording storage/upload management is the next separately planned feature; the domain and legacy-site work remain deferred.
