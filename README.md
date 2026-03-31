# SnapRead ⚡

A minimalist RSVP speed reading app. Upload EPUB, PDF, TXT, or Markdown files and read them word-by-word at up to 1000 WPM.

**[Try it →](https://greysandstorm.github.io/SnapRead/)**

## Features

- **RSVP Speed Reading** — Rapid Serial Visual Presentation with ORP (Optimal Recognition Point) highlighting
- **Multiple Formats** — EPUB, PDF, TXT, and Markdown support
- **Offline-Ready** — PWA with service worker caching
- **Bookmarks** — Automatically saves your reading progress
- **Customizable** — Adjustable WPM (100–1000), display size, chunk size, and ORP highlight color
- **Keyboard Shortcuts** — Space (play/pause), ←→ (seek), ↑↓ (speed)

## Tech Stack

Vanilla HTML, CSS, and JavaScript — no build tools, no frameworks.

| Component | Tech |
|-----------|------|
| EPUB parsing | [epub.js](https://github.com/futurepress/epub.js) |
| PDF parsing | [pdf.js](https://mozilla.github.io/pdf.js/) |
| Storage | IndexedDB |
| Offline | Service Worker |

## Development

```bash
# Local dev server
node server.js
# → http://localhost:3000
```

## License

MIT
