# Script Reader

A local-file rehearsal reader. Scripts stay in browser memory and are cleared on reload.

To prepare another script, follow the [CSV and character-tagging guide](docs/csv-tagging-guide.md). It includes instructions for agents and a synthetic example.

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
npm run preview
```

The preview serves only the built application. Private script files are never included in it.

Choose **Print / Save PDF** after selecting a character. It prints the current passages, context and Korean display choice, with an ink-friendly A4 layout. The button becomes available once the bundled English/Korean font is ready; retry if loading fails. Use the browser dialog to print or save a PDF. The layout requests A4 portrait and 14 mm margins; keep scale at 100% and disable browser headers/footers for the intended result. Printer/browser settings can override page size and margins.

For a portable staff demo:

```sh
npm run build:demo
```

Copy `.agent-local/demo/ScriptReader-demo.html` to the demo computer and open it in a current desktop browser (Chrome or Edge recommended for the tested PDF layout). It is a single offline file, including its font and font license. Open authorized script/cast CSVs separately with the file controls. It contains no script data, and reload clears imported files. No server or installation is needed. Mobile file-opening behavior depends on the device; desktop browsers are the reliable demo path.

The demo is about 14 MB because it includes the complete Korean font for offline use. Regenerate it after app changes. Generated demo files and review PDFs stay outside version control. The bundled [Noto Sans KR font license](src/assets/fonts/OFL.txt) permits redistribution with the font.

Optional browser/PDF regression review (synthetic content only): install the Playwright Chromium browser with `npx playwright install chromium`, build the demo, run `npm run preview -- --port 4174` in one terminal, then `npm run test:browser` in another. `APP_URL` can select another preview address; `PLAYWRIGHT_EXECUTABLE_PATH` can select an installed Chromium executable. PDFs, desktop/mobile screenshots and results are saved under ignored `.agent-local/previews/milestone-2/`. For independent PDF text, margins and pagination checks, install PyMuPDF in a temporary Python environment and run `python scripts/check-pdf.py`.

Hosted delivery is documented in the [operations guide](docs/hosted-delivery.md). Run `npm run dev:hosted` to exercise fictional production links, the server API and a temporary local PostgreSQL database without cloud credentials. Default context is 2 before / 1 after; hosted views preload through 3 before / 2 after and fetch larger requests up to 10 as needed. Deployment requires a separate Cloudflare authorization/configuration step.
