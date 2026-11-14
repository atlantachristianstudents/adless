# Chronological Bible

The full and short installed-app names are both **Chronological Bible**. Its icon pairs an open Bible with a three-point timeline, using the rounded background and simple line artwork of the live app icons.

Static, offline-capable Bible reader. Serve this folder with any static web server; no build step or dependencies required. Includes timeline navigation, reference/text search, URL references, saved verse bookmarks, reading position, and text/theme settings. Local storage is browser-specific. Saved verse bookmarks can be exported or imported from Settings as a JSON file.

The app ships only the chronological ordering (`order.js`); the Recovery Version text is downloaded at runtime from the shared RcV text file (`https://cdn.rapidfile.cc/VbLdPuh9Yxb4/RcV`, documented in the "Scripture text source — RcV" section of the root `AGENTS.md`) and cached in IndexedDB with a 15-day refresh window, matching the other RcV consumers. The first run needs internet; afterwards the reader works offline from the cache. A stale cache is used if a refresh fails. The text is validated against 31,103 verses before it is cached. Sequence comes from reese-chronological-verse-order.json, with era labels from the local Reese EPUB. All 31,102 supplied references matched; RcV Revelation 12:18 was inserted after 12:17. Study notes are not included. Chronological ordering follows Reese, with local adjustments: Genesis 1:1, Isaiah 45:18, and Genesis 2:4 begin the "Original Creation and Satan’s Rebellion" chapter, followed by Ezekiel 28:11–19 and Isaiah 14:12–17 ("Satan Cast Out of Heaven"); Revelation 21:1–22:5 appears in a final "Eternity Future" chapter after the writings of John.

Run `python3 -m http.server 8080 --directory .` from this directory for local use.

## Passage selection

Reference searches accept full book names or RcV abbreviations (for example, `Genesis 1:1`, `Gen. 1:1`, or `1 Cor. 13`), with optional spaces around chapter and verse numbers. `Psalms` is accepted as a book name. Phrase searches preserve the words you enter. Results update immediately from the first character as you type. The passage picker hides while a query is entered and returns when the field is cleared. Results follow chronological reading order and show up to 80 matches.

Click a verse or press Space to toggle its highlight; the highlighted verse has a margin bookmark control that saves that verse. Use ↑/↓ or k/j to move it; ←/→ or h/l moves between readings; m saves the current verse; / opens Search; ? opens Settings and lists all shortcuts. Open Search to choose a book, chapter, and verse from tables, or type a reference or phrase. Click a cell, or Tab into the table and use the arrow keys to move between cells. Enter or Space selects the focused cell; selecting a verse opens it in the reader. Home/End move to the first/last cell in a row; Ctrl+Home/End move to the first/last cell in the table. Use the Books, book name, and chapter buttons above the table to revisit a selection. Escape closes Search. On phones, book tables use two readable columns and touch targets are at least 44px high. Search opens with the passage table focused on touch devices, keeping the keyboard closed until you tap the text field. The text field uses 16px type, and the dialog fits the available viewport; normal pinch zoom remains available.

## ACS Web Apps integration

The home-page registry links directly to this folder, the self-contained runnable app. No build is required. Open `index.html` directly for local reading, or serve this folder over HTTP for installation and offline caching. On a supported browser, open the app online once, then use the browser’s Install/Add to Home Screen command. Wait for the initial cache download before going offline.

The deployed reader uses the standard ACS anonymous usage counts with the fixed `chronological-bible` identifier; Scripture, searches, bookmarks, and reading position are never sent. Local hosting and privacy opt-outs disable counts. The standalone HTML export is a separate local-use artifact and does not report usage.

When changing runnable files, update `sw.js`’s cache version and keep its `FILES` list complete. Cache upgrades remove only this reader’s old caches, preserve saved verse bookmarks in localStorage, and keep the downloaded Scripture text in IndexedDB. `build-data.py` is an optional import helper that regenerates `order.js` from the shared RcV text file and the local Reese source files; it is not a deployment step.

Open `https://acswebapps.com/apps/chronological-bible/`. The former `apps/chronological-bible/dist/` URL redirects here, preserving queries and verse fragments. The About dialog links to ACS Web Apps. The original `rcv-chronological` localStorage key and Scripture IndexedDB database are retained across the rename.
