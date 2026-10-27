# Local use and development

Hosted deployment and publishing are covered in the [operations guide](hosted-delivery.md); input preparation is covered in the [CSV guide](csv-tagging-guide.md).

Requires Node.js 22.12 or newer (Node 22 is selected in `.nvmrc`).

```sh
npm ci
npm run dev
```

Open the local address shown in the terminal. Choose **Open Script** and **Open Cast** (a `Tag,Name` CSV), in either order, then select a character. The cast supplies canonical names and supports characters without dialogue.

Existing scripts can still be opened alone; without a cast file, names are derived from solo-tagged dialogue rows. **Remove cast** returns to that legacy mode. Both files stay in browser memory and are cleared on reload.

```sh
npm test
npm run build
npm run check:exposure
npm run preview
```

The hosted root opens the main production; use `/import` for CSV import in a production preview. Local Vite development at `/` and the portable file demo retain their import entry points. The preview serves only the built application. Private script files are never included in it.

Balanced parentheses within dialogue, including nested or multiline actions, are italicized on screen and in print. The original text is preserved; unmatched parentheses and square brackets remain literal text. Structural headings and songs are not parsed as dialogue.

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

## Releases and contributions

Milestones 1–3 are complete at `v0.3.0`; see [release notes](../CHANGELOG.md). Future work uses short branches such as `codex/feat/audio-playback`, `codex/fix/print-layout`, or `codex/docs/operations`, with reviewed changes merged into `main`. Push focused checkpoints after relevant checks pass. Production builds follow `main`; other branches do not deploy automatically. Cloudflare is connected to GitHub and automatically runs `npm run build` and publishes `dist` after a merge into `main`. The GitHub Actions `CI` workflow runs locked dependency installation, tests, typecheck/build, the exposure check, and fictional hosted/import/offline/print browser checks for pull requests targeting `main` and pushes to `main`. It also supports manual runs. The workflow has read-only repository permissions, uses pinned action commits, and needs no Supabase or Cloudflare secrets. Generated review files stay in the temporary runner and are not uploaded. Check results are visible on each PR; making them mandatory requires a separate repository branch-protection rule. Cloudflare deployment still follows merges to `main` and does not independently wait for the push-triggered CI run. Application changes and shared documentation are recorded in commits and pull requests. Private source CSVs, secrets, generated review artifacts, and local agent guidance remain excluded from Git. Script-data publication to Supabase is a separate administrative operation.

Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/): `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `perf:`, `ci:`, `build:`, and `chore:`. Use `fix:` for urgent repairs too; debugging work takes the type of the resulting change. Commit types are distinct from release tags. Use patch releases for fixes and minor releases for new capabilities; private script revisions do not automatically change the app version. Preserve existing history and version tags.

YouTube is the current media source. Planned recordings will use owner-managed SoundCloud links and its embedded player; no custom player or recording storage is required for that approach. SoundCloud support is not implemented yet. Song-participation annotation is data preparation and may be revised independently. The custom domain and legacy website remain deferred.
