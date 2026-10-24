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
