# Script Reader

A local-file rehearsal reader. Scripts stay in browser memory and are cleared on reload.

Requires Node.js 22.12 or newer (Node 22 is selected in `.nvmrc`).

```sh
npm ci
npm run dev
```

Open the local address shown in the terminal, choose **Open Script**, and select a character.

```sh
npm test
npm run build
npm run preview
```

The preview serves only the built application. Private script files are never included in it.
