# Credentials and administrative access

The main concern is accidental access to Supabase, Cloudflare, GitHub, or other administrative accounts. Student script access is intentionally anonymous. Do not treat disabling copy/paste, hiding browser code, or the character allowance as protection for account credentials.

## Boundaries

- The browser receives selected script text, cast names, revision identifiers and video IDs. JavaScript, delivered text, public project identifiers and URLs can be inspected. None of these grant administrative access.
- Supabase server keys and the cookie-signing secret exist only in encrypted Cloudflare server settings or explicitly ignored local files. Never prefix server secrets with `VITE_`, print them, put them in examples, or send them through chat. Example credentials must be clear placeholders.
- `anon` and `authenticated` have no table or RPC access to the application database. Only the server's `service_role` can fetch private revisions or publish. RLS is enabled; the lack of client policies is intentional. The [informational Supabase notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) is expected for this design.
- No GitHub, Cloudflare, or Supabase administrative token is needed by the frontend. React renders imported text and names as text, rather than trusted markup. A hosted Content Security Policy limits scripts and connections to the same origin and permits YouTube frames; framing the app is denied. Print layout requires inline styles. SoundCloud is not yet supported and will need an explicit frame-policy change when implemented.
- The API enforces input bounds, origin checks, server-side throttling and signed browser identity. Origin can be spoofed by non-browser clients, and cookies can be reset; these are accepted script-access limitations, not database administrative permissions.

## Before pushing or deploying

Run the relevant tests, `npm run build`, `npm audit`, and `npm run check:exposure`. The exposure check inspects tracked/non-ignored source and build artifacts for recognized credential patterns, privileged Supabase JWTs and unexpected development/private artifacts. It prints paths and rule names only, never matched values. It is a guard against common mistakes, not a guarantee: opaque Cloudflare tokens and arbitrary passwords may not have a recognizable format. Do not paste real credentials into the checker as test fixtures.

Review changes to docs, configuration and build scripts. Keep `data/`, `.agent-local/`, `.env*`, credentials, source maps and private reviews outside deployments. Vite's public directory is disabled; only the explicit deployment control files are copied into the build. Source maps are disabled, but bundled frontend code remains inspectable.

Use read-only checks to verify deployed files, response bodies, headers, repository visibility and database privileges. An SPA can return application HTML with status 200 for a nonexistent filename; inspect the response content before declaring a file exposed. Keep source/path probe results private and omit response bodies from logs. Test account boundaries with rejected requests; do not retrieve or rotate administrative credentials just to verify their presence.

## Configuration changes and recovery

Cloudflare secret GET responses contain masked values. PATCH only intentionally changed entries; never write a masked configuration map back. Inspect names/types only during ordinary maintenance. Pages Functions are configured to fail closed if their allowance is exhausted; quotas and account billing are otherwise unchanged.

If an actual credential is exposed, remove the exposure and rotate that specific credential, then verify service behavior. Removing it from the latest commit alone does not revoke it or erase Git history. Preserve a private incident record without the credential itself. Avoid rotating unrelated keys.

## Review checkpoint — 2026-10-27

The targeted review found zero known dependency advisories, no recognized credentials or long source excerpts in scanned Git history/build artifacts, and no production source maps. GitHub repository visibility was private. Read-only database checks confirmed browser roles cannot read revisions or execute application RPCs. These checks do not constitute a full penetration test or cover unrelated account settings, dashboard sessions, or future changes. No administrative credentials were retrieved or changed during the review.
