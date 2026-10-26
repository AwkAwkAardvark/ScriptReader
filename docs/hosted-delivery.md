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

## Cloudflare configuration — deployment checkpoint

Cloudflare authorization is required before this section can be completed. No custom domain or changes to the legacy hagwon website are required. Start with the provider's `pages.dev` address and a synthetic production.

Connect the private GitHub repository, use a Vite build with `npm run build`, output directory `dist`, Node 22, and the intended production branch. The root `functions/` directory supplies the same-origin API and `wrangler.jsonc` contains non-secret settings. Preview deployments must use a synthetic-only database; do not give branch previews access to real production material.

Cloudflare account-tool access and its GitHub installation are separate connections. Before creating a Git-integrated project, authorize the Cloudflare GitHub app for this repository through Pages' **Import an existing Git repository** flow. If project creation returns error `8000011` about the Pages Git installation, check that installation and its repository access before retrying; reconnecting the account tools alone does not establish Git access. During a private-data pilot, disable other branch previews and configure server secrets only for the intended deployment environment.

Configure these **server secrets** through the dashboard or authenticated Cloudflare tooling:

- `SUPABASE_URL`: intended project URL.
- `SUPABASE_SECRET_KEY`: the server key for that project.
- `BROWSER_COOKIE_SECRET`: a high-entropy signing secret, generated with `node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"` and saved privately.

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

## Release checklist

Verify the deployed synthetic workflow, HTTPS cookie persistence, response secrecy, no client-side script storage, mobile controls, and PDF output. Publish real material only after separate owner authorization. Keep all real inputs and media sidecars outside Git and application bundles. Defer the hagwon domain, legacy-site work and recording hosting.
