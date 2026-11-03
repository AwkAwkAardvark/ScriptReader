# Hosted deployment and publishing

The hosted reader uses Cloudflare Pages with Pages Functions and Supabase Postgres. Student links use `/p/<slug>`; local-file import is at `/import`. The root opens the production or blank importer selected by an approved administrator; the production directory is private. App deployment and script publication are independent. For local use, automated checks, and the security model, see the [development guide](development.md).

## Crawling and search indexing

Application responses carry `X-Robots-Tag: noindex`; API entrypoints set it directly because Pages static headers do not apply to Functions. The deployed `robots.txt` permits Googlebot and bingbot to fetch pages and discover that instruction, separately opts out of Google-Extended usage, and asks other cooperating crawlers not to fetch the site. Google's ownership-verification path remains accessible, including its extensionless Pages URL.

These instructions are voluntary crawler preferences, not authorization controls. They do not replace protected staff APIs or request limits. Search removal and crawler refreshes are not immediate. See [Google's noindex guidance](https://developers.google.com/search/docs/crawling-indexing/block-indexing).

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

The initial reader migrations create four RLS-protected tables and two server-only RPC functions. Admin membership is added by the later migration described below. Apply the migrations once to your intended Supabase project, using Supabase's migration tools or the connected Supabase integration. Keep the remote migration history aligned with the checked-in version. Do not run the SQL again on an already-migrated project.

`reader_publish` validates its basic payload contract and creates a complete revision in one transaction, then changes the active pointer. `reader_fetch` performs throttling and character admission in one transaction and returns metadata or the private revision **only to the trusted server**. It uses row locking for count-and-admit and separate allowances for each production/day.

Only `service_role` has application privileges. `anon`, `authenticated`, and `PUBLIC` cannot select script tables or execute these RPC functions. RLS intentionally has no client policies because browsers have no direct database access; the advisor's informational “RLS Enabled No Policy” result is expected for this design ([Supabase explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)).

### Student-reader measurements

The public reader uses manually scoped Cloudflare Web Analytics. Keep blanket Pages analytics injection disabled; it would bypass the application’s staff-page exclusions. See the [development guide](development.md#student-reader-analytics) for scope, configuration and checks.

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

Prepare matching script/cast files and an optional media update file using the [input preparation guide](csv-tagging-guide.md).

```sh
npm run publish:script -- --slug paper-garden --title "The paper garden" --script /path/to/script.csv --cast /path/to/cast.csv --media /path/to/media.csv
```

This command validates only; it prints counts and diagnostics, not dialogue. Both script and cast are required for hosted publishing. Character choices preserve cast CSV row order; reorder that roster to organize a production without hard-coding its roles into the reader.

The optional media CSV has exactly these columns:

```text
No,YouTubeURL
```

Provide one existing Song record number and an HTTPS YouTube URL per row. Only YouTube watch, short-link, shorts, or embed URLs with valid video IDs are accepted; duplicate song numbers and non-song associations fail validation. Song membership tags are not inferred or changed. URLs identify videos, not permission to stream them: embedding may still be restricted by the uploader or browser, so the reader retains an external link.

After validation, adding `--publish` explicitly performs the publication. Existing links are retained by unique song-title matches after trimming, collapsing whitespace, and ignoring case; record numbers alone never establish a match. Supplied media rows override only the specified songs. New productions begin without associations. Each saved revision still contains a complete resolved snapshot.

The fallback publisher checks existing associations when credentials are configured. Without credentials, it can validate the files but cannot check existing links. Renamed, repeated, or removed linked songs stop publication until mappings have been reviewed and `--acknowledge-unmatched` is explicitly supplied. Use the media CSV to reassign links to new song numbers; `--remove-media 9,17` explicitly removes links from those Song record numbers. Blank URLs are invalid, not a request to delete links. Concurrent changes require revalidation.

New visits use the active revision. An existing reader does not mix revisions: if a later request finds an update, it asks for reload. Previously downloaded text can remain in memory until reload; this is not remote revocation of content already delivered.

## Content revisions and recovery

Each publication saves a complete script/cast/media snapshot and atomically switches the production's active revision. The publisher returns the new revision identifier. Previous snapshots remain available for rollback; this is application-managed publication history, not Git history or a record of unpublished edits.

Keeping a production's slug stable updates that production; choosing another slug creates a separate production with its own revision and allowances. To roll back content, confirm that an earlier revision belongs to the intended production, then transactionally set its `active_revision` to that revision through a trusted administrator connection. Verify metadata and a representative selected view. Restoring the pointer does not require editing stored snapshots or changing database grants.

Application rollback is separate: select a known-good Cloudflare deployment and reconcile the code with a normal revert commit so the next deployment preserves the correction. Existing tags and source history can remain intact.

## Admin authentication setup

Enable Google in the project's Supabase Auth provider settings using a Google Web OAuth client. Register the Supabase project's `/auth/v1/callback` as Google's redirect URI and the application's `/api/admin/auth/callback` in Supabase's redirect allowlist. The application uses identity scopes only. Google client credentials belong in the provider settings, not frontend configuration.

The server additionally needs `SUPABASE_PUBLISHABLE_KEY` for its authentication client and `ADMIN_ORIGIN` set to the exact canonical HTTPS origin. The privileged database adapter continues to use its separate server key. Authenticated responses are not cached. Routine deployments retain the existing cookie-signing and database secrets.

The admin-membership migration adds two RLS-protected tables and server-only operations. Neither `anon` nor `authenticated` receives membership-table or RPC privileges; the server checks the verified user ID against current membership. Do not derive roles from user-editable profile metadata. `reader_admin_bootstrap` is a trusted, one-time setup operation after the intended first account's Google identity has been verified. There is no HTTP bootstrap endpoint or automatic first-user promotion.

For succession, an existing master can promote a successor, the successor can sign in and verify access, and the predecessor can then demote or revoke their own access. Membership changes do not transfer ownership of Google Cloud, Cloudflare, Supabase, or GitHub, and do not delete the person's login identity.

## Manage productions in the browser

Open **My Account** at `/admin` for sign-in, your own account status, sign-out, and navigation. Personal preferences can be added there later without mixing them with staff permissions. Approved admins and masters use `/admin/scripts` to select a production from a dropdown, edit its reader title and initial context (0–5 lines before/after), and explicitly choose the student homepage. Selecting **Blank / file import** opens `/import`. Publishing does not change the homepage, and previous production links remain usable. Treat each year's production as a separate entry, with its year in the title and new link identifier; updates during that production become revisions of the same entry.

For a new production, choose **New production** and supply a title, script CSV, cast CSV, and optional YouTube mapping CSV. The link identifier is generated automatically and is not a staff-editable setting. For an existing production, select it from the dropdown and expand **Script files** to upload matching script and cast files, with optional media updates. Existing file sections and CSV examples start collapsed; examples are expanded for new productions and can be downloaded as small matching CSV files selected from the Chapter 3 merchant excerpt and Butter marker, with original record identifiers. See the [tagging guide](csv-tagging-guide.md#downloadable-examples-in-administration). The selected production is included in the page URL for refresh and direct links. Use **Validate and preview**, review the character view, then explicitly confirm **Publish**. The server validates the files again and atomically creates the revision. Omitting media retains uniquely matched existing links. The song list shows the resolved associations, and unmatched old links require review before publication. Validation/publication requests must fit within 5 MiB, including request encoding; unfinished uploads are held only in browser memory.

The initial before/after controls appear first and use the same 0–5 sliders as the student reader. Titles and initial context can be saved without uploading files again. Defaults apply when a reader loads the production; students can still adjust them. Conflicting changes are rejected: refresh the list before editing a production or homepage that another admin has changed. Production link identifiers remain fixed after creation. The local publisher above remains available as a fallback.

Administrative operations check current approved membership, including inside database mutations. The production-management migration adds protected homepage storage and per-production settings. The public homepage API returns only the selected destination, never the directory. Account management remains master-only. Student assignments and full-script staff viewing are separate features.

### Song links and separate admin pages

The separate Songs page at `/admin/songs` lists every detected Song record and its current association, independently of the selected preview character. Select a production and expand its single song card. Edit a URL to replace a link, choose **Remove link** to remove it explicitly, or undo the change. **Save song links** creates a new immutable revision without re-uploading the script or cast. Links are scoped to a production; other productions are not searched automatically.

When replacing files on the Scripts page, a single collapsed song-review card appears at the bottom, after the YouTube mapping CSV and preview. Review the new revision's song list there; this keeps unsaved uploads on the same page. Renamed or repeated titles are not automatically assigned videos: select an existing video or enter a URL for the intended song, revalidate edits, and acknowledge any old linked songs that could not be matched. The preview uses these resolved links, and the server repeats resolution against the checked current revision before publication.

**Access Management** at `/admin/accounts` is master-only and controls staff requests, approvals, roles, and revocation. This is separate from My Account, which concerns the signed-in person. Approved admins have production controls but no account directory. Navigation and direct routes preserve these permission checks. Full-script staff viewing and student assignments remain separate features.

Use the pencil beside a staff name to edit its display name, then **Save** or **Cancel**. **Use account name** restores the Google-name default. The chosen name is used throughout the staff interface; the email and account permissions are unchanged. Apply the staff-display-name migration before deploying this feature. No new secret bindings or Google settings are needed.


## Staff rehearsal viewer and assignments

Approved admins and masters can open **Teacher Viewer** at `/admin/viewer`. It shows the complete script, both performance casts, and independent class/performance highlighting; settings collapse to conserve mobile space. **Roster** at `/admin/roster` provides reviewed name/class/label and casting edits. **Import / export** within Roster provides committed JSON backups to all approved staff and optional CSV imports/complete JSON restores to masters, described in the [input guide](csv-tagging-guide.md#optional-student-assignments-staff-only). These tools do not change the public student reader or grant access to pending accounts.

Bulk assignment updates require master access, validation, preview and explicit confirmation. Ordinary staff can continue reviewed roster edits. The old `/admin/assignments` route redirects to Roster with its production/language selection. Replacement/deletion affects only that production's current private assignments, without republishing the script or changing homepage/defaults. The database rejects changes against stale assignment or production versions. Publishing a character roster that removes assigned tags requires updating or removing affected assignments first, including when using the local publisher.

Apply the teacher-viewer, roster-editor, audit and roster bulk-tool migrations before deploying their corresponding application changes. The roster migration backfills students by existing stable ID while preserving casting and version tokens; it introduces no new public storage or permissions. No new secret bindings or authentication providers are required. Assignment endpoints and their RPC/table remain server-only; do not add grants or policies for anonymous or signed-in browser roles. CSV replacement retains students and optional labels, replacing their casting; complete JSON restore replaces students and casting; master-only global deletion clears both even when no roles remain; backup retention follows the project's provider configuration.

Masters can use the collapsed **Reader allowances** section in Access Management for an explicit all-production daily reset. Check the displayed Korean date and scope before confirming. After a date change, refresh and confirm the new date. If the outcome is uncertain, retry the same confirmation to recover the original result without clearing newer choices. Apply the master quota-reset migration before deploying this control; deployment does not itself reset allowances.
