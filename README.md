# graycor.github.io

A small collection of standalone, hand-written HTML tools and pages hosted on GitHub Pages. Each page is a single self-contained file that loads nothing from any other site: no web fonts, no CDN scripts, no trackers. Pages use the visitor's built-in fonts, and BookScan's book lookups are the only requests that leave the site.

**Live site:** https://graycor.github.io

## Pages

- [`index.html`](index.html): landing page linking to the tools below, plus a **Coming soon** section: a tile for each app that isn't public yet, opening a page with a summary, features, screenshots and a greyed-out download button. The app list is the JSON block in the page; set an app's `released` to `true` once its repo is public and the button links to its latest GitHub release. Logos and screenshots live in `img/apps/`, and every screenshot is taken from a throwaway install with made-up data, never a real one.
- [`bookscan.html`](bookscan.html): **BookScan**, a book barcode and ISBN scanner. Scan with the camera, read a barcode from a photo, or type any book number: ISBN-13, ISBN-10 or the nine-digit SBN of pre-1970 books, with or without hyphens, labels, an `x` check digit, full-width digits or a barcode's price add-on. All forms fold into one ISBN-13 (shared rules with Congregate's `lib/isbn.ts`), and each book shows its ISBN-13, ISBN-10 and SBN correctly hyphenated from the ISBN agency's range table along with its registration group. Product codes, UPCs, magazine ISSNs and bad check digits are refused with the reason. Details and covers come from Open Library (keyless, on by default) and Google Books (your own API key, kept in memory unless you tick Remember). Rescanning a book adds a copy, books with no number can be found by title, and the list stays in the browser and exports as a formula-safe CSV.

  Security: a hash-only CSP that runs no third-party code (the ZXing CDN library was replaced by a port of Congregate's EAN-13 decoder) and lets the page reach only `www.googleapis.com` and `openlibrary.org`. Covers only load from the services' image hosts. The key goes only to Google, with the site's origin as Referer so a website restriction works. BookScan refuses service-account files, client secrets and tokens, and warns when a key has no website restriction. Lookups are paced and capped per session, every response and the saved list are rebuilt field by field, text is only ever rendered as text, and the page will not run inside another site's frame.
- [`carnivorenutrition.html`](carnivorenutrition.html): **Carnivore Diet Coverage Map**, a personal nutritional reference charting nutrients, RDIs, and animal-based food sources. Informational only, not dietary or medical advice.
- [`qr.html`](qr.html): **QR Code Generator**, free and private. Makes codes for websites, text, email, phone calls, text messages, Wi-Fi, contact cards, map locations and calendar events, with colours and gradients, pattern and corner styles, centre icons (built-in, initials or your own image), frames with captions, and PNG, JPEG and SVG downloads. Everything runs in the browser: a Content-Security-Policy blocks every network request after load, and nothing is stored. It refuses disguised links (`user@host` tricks, mixed-alphabet lookalikes, hidden direction-reversing characters, script and file links) and payment or wallet requests, and warns about shorteners, brand lookalikes, bare IPs, redirects and app downloads. Where the browser has a built-in barcode reader it reads each code back to check it.
- [`cms.html`](cms.html): **Congregate**, an unlisted marketing/pitch page for a church management platform. Its Tailwind styles are compiled into the page, so it loads nothing from elsewhere and runs under the same hash-only CSP as the tools.

## Development

These are plain static files. To work on anything that needs a real origin (e.g. BookScan's camera), serve the folder locally:

```
python3 -m http.server 8080
```

Then open `http://localhost:8080/bookscan.html`.

### Content-Security-Policy on every page

Every page runs only the inline script and style whose hashes are in its CSP meta tag, so after editing either block run:

```
node tools/csp.mjs             # rewrite the hashes for every page
node --test tests/             # gate: hashes, CSP, no outside requests, encoder, ISBN parsing, decoder, misuse checks
```

A new page must be added to `PAGES` in `tools/csp.mjs`, carry exactly one inline `<script>` and one `<style>`, and use classes rather than `style=""` attributes or `onclick=""` handlers, which the policy refuses. `tests/site.test.mjs` enforces this for every page in the folder.

The QR encoder is a port of Congregate's `lib/qrcode.ts`, and BookScan's number rules and EAN-13 decoder are ports of its `lib/isbn.ts` and `lib/ean13.ts`. Keep them in step.

`cms.html` is styled with Tailwind classes compiled into its `<style>` block. After adding or changing a class, rebuild the CSS (this also rewrites the hashes; the gate fails on any class without CSS):

```
node tools/cms-css.mjs         # Tailwind 3.4.19 via npx, settings in tools/tailwind.cms.config.cjs
```

BookScan's hyphenation comes from the International ISBN Agency's range table, which changes monthly. To refresh it:

```
node tools/isbn-ranges.mjs     # downloads RangeMessage.xml (or pass a local path)
node tools/csp.mjs
```
