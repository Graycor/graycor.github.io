# graycor.github.io

A small collection of standalone, hand-written HTML tools and pages hosted on GitHub Pages. Each page is a single self-contained file — no build step, no dependencies beyond a couple of CDN links.

**Live site:** https://graycor.github.io

## Pages

- [`index.html`](index.html) — landing page linking to the tools below.
- [`bookscan.html`](bookscan.html) — **BookScan**, a barcode/ISBN library scanner. Uses the device camera (via [ZXing](https://github.com/zxing-js/library)) to scan book barcodes, then exports the list as a tab-separated `.txt`. Requires an `https://` or `http://localhost` origin — camera access is blocked over `file://`.
- [`carnivorenutrition.html`](carnivorenutrition.html) — **Carnivore Diet Coverage Map**, a personal nutritional reference charting nutrients, RDIs, and animal-based food sources. Informational only — not dietary or medical advice.
- [`cms.html`](cms.html) — **Congregate**, an unlisted marketing/pitch page for a church management platform.

## Development

These are plain static files. To work on anything that needs a real origin (e.g. BookScan's camera), serve the folder locally:

```
python3 -m http.server 8080
```

Then open `http://localhost:8080/bookscan.html`.
