# Script Reader

A mobile-friendly rehearsal reader with character selection, context controls, bilingual display, YouTube embeds, and Print / Save PDF. Hosted reading requires no student login; local CSV import is also available.

Hosted `/` opens the main production. CSV import is at `/import`; the offline HTML demo remains available.

## Develop locally

Requires Node.js 22.12+.

```sh
npm ci
npm run dev
```

## Documentation

- [Development, architecture, print, and releases](docs/development.md)
- [Hosting, publishing, and recovery](docs/hosted-delivery.md)
- [CSV preparation and character tagging](docs/csv-tagging-guide.md)
- [Release notes](CHANGELOG.md)
