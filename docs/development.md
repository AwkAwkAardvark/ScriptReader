# Local use and development

Hosted deployment and publishing are covered in the [operations guide](hosted-delivery.md); input preparation is covered in the [CSV guide](csv-tagging-guide.md).

Requires Node.js 22.12 or newer (Node 22 is selected in `.nvmrc`).

```sh
npm ci
npm run dev
```

Open the local address shown in the terminal. Choose **Open Script** and **Open Cast** (a `Tag,Name` CSV), in either order, then select a character. The cast supplies canonical names and supports characters without dialogue.

Existing scripts can still be opened alone; without a cast file, names are derived from solo-tagged dialogue rows. **Remove cast** returns to that single-file fallback. Both files stay in browser memory and are cleared on reload.

```sh
npm test
npm run build
npm run check:exposure
npm run preview
```

The hosted root opens the main production; use `/import` for CSV import in a production preview. Local Vite development at `/` and the portable file demo retain their import entry points. The preview serves only the built application. Private script files are never included in it.

Balanced parentheses within dialogue, including nested or multiline actions, are italicized on screen and in print. The original text is preserved; unmatched parentheses and square brackets remain literal text. Structural headings and songs are not parsed as dialogue.

Actions and cues are shown by default. **Hide actions & cues** removes standalone direction/effect rows and stops tagged nonverbal actions from initiating windows. Inline parentheticals in spoken lines stay visible. Songs and scene headings remain for included scenes. Context still counts original source rows, so hiding a cue does not pull in a replacement dialogue row. Screen and print use the same reduced view.

Context uses two independent sliders (Before/After), each from 0–5 and initially 2/1. Dragging applies the passage change on release; keyboard changes apply immediately.

Choose **Print / Save PDF** after selecting a character. It prints the current passages, context and Korean display choice, with an ink-friendly A4 layout. The button becomes available once the bundled English/Korean font is ready; retry if loading fails. Use the browser dialog to print or save a PDF. The layout requests A4 portrait and 14 mm margins; keep scale at 100% and disable browser headers/footers for the intended result. Printer/browser settings can override page size and margins.

For a portable staff demo:

```sh
npm run build:demo
```

Copy `.agent-local/demo/ScriptReader-demo.html` to the demo computer and open it in a current desktop browser (Chrome or Edge recommended for the tested PDF layout). It is a single offline file, including its font and font license. Open authorized script/cast CSVs separately with the file controls. It contains no script data, and reload clears imported files. No server or installation is needed. Mobile file-opening behavior depends on the device; desktop browsers are the reliable demo path.

The demo is about 14 MB because it includes the complete Korean font for offline use. Regenerate it after app changes. Generated demo files and review PDFs stay outside version control. The bundled [Noto Sans KR font license](../src/assets/fonts/OFL.txt) permits redistribution with the font.

Optional browser/PDF regression review (synthetic content only): install the Playwright Chromium browser with `npx playwright install chromium`, build the demo, run `npm run preview -- --port 4174` in one terminal, then `npm run test:browser` in another. `APP_URL` can select another preview address; `PLAYWRIGHT_EXECUTABLE_PATH` can select an installed Chromium executable. PDFs, desktop/mobile screenshots and results are saved under ignored `.agent-local/previews/milestone-2/`. For independent PDF text, margins and pagination checks, install PyMuPDF in a temporary Python environment and run `python scripts/check-pdf.py`.

## Hosted development

Run `npm run dev:hosted` to exercise fictional production links with a temporary local PostgreSQL database and no cloud credentials. See the [operations guide](hosted-delivery.md#local-development-and-checks) for hosted browser checks.

## Checks

Choose checks appropriate to the change. Documentation-only edits need content and link checks, plus validation of any CSV examples against the parser. Application changes need relevant unit tests and a build; use browser checks for affected UI, import, hosted API, or print interactions. A separate full browser review is not required for every edit. The CI suite below still runs its configured checks. Automated fixtures remain synthetic.

## Releases and contributions

Milestones 1–3 are complete; the latest release tag is `v0.3.0`. See [release notes](../CHANGELOG.md).

Use short, tool-neutral branches such as `feat/audio-playback`, `fix/print-layout`, or `docs/operations`. Create focused commits at meaningful completed checkpoints, after appropriate checks, and push them regularly. A checkpoint does not need its own pull request or release tag. Merge reviewed changes into `main`, preserving history.

Use descriptive commit messages with Conventional Commit prefixes; common examples are `feat:`, `fix:`, and `docs:`. Commit prefixes describe the change and do not determine the release size.

Each successful pull-request merge into `main` receives the next patch version, such as `0.3.0` → `0.3.1`, without separate release approval. Update the package version and lockfile consistently, record the change in the changelog, and create and push an annotated `vX.Y.Z` tag on the resulting main commit. Minor or major release changes, such as `0.3.x` → `0.4.0` or `1.0.0`, require explicit owner authorization. Do not create retrospective tags without a separate request. Private script-data revisions are independent of app versions and do not automatically create releases. Preserve existing tags and history.

## CI and deployment

The GitHub Actions `CI` workflow runs on pull requests targeting `main`, pushes to `main`, and manual requests. It performs locked dependency installation, tests, typecheck/build, the exposure check, and synthetic hosted/import/offline/print browser checks. It uses read-only repository permissions and pinned action commits, needs no provider secrets, and does not upload generated review artifacts. Results appear on each PR; mandatory merge checks require a separate branch-protection rule.

Cloudflare automatically builds and publishes `main` with `npm run build` and output directory `dist`. Other branches do not deploy automatically. Cloudflare does not independently wait for the push-triggered CI run, so verify PR checks before merging and the production deployment afterward. See the [operations guide](hosted-delivery.md) for publishing and recovery.

Keep private source files, credentials, generated review artifacts, and local guidance out of Git and application bundles. The explicitly authorized eleven-record documentation excerpt in the [CSV guide](csv-tagging-guide.md#worked-example-chapter-3) is a limited exception for documentation only. Automated fixtures remain synthetic. Script publication to Supabase is a separate administrative operation.
