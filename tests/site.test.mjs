// Site-wide rules for every page. Each page is a standalone file, so a rule that only lived in
// one page's tests would quietly lapse on the next page added.
//
// Run: node --test tests/

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { PAGES, inlineBlocks, withHashes } from "../tools/csp.mjs";

const root = new URL("../", import.meta.url);
const pages = readdirSync(root).filter((f) => f.endsWith(".html"));
const read = (f) => readFileSync(new URL(f, root), "utf8");

test("every page is under the hash-only CSP", () => {
  assert.deepEqual([...PAGES].sort(), [...pages].sort(), "add the page to PAGES in tools/csp.mjs");
  for (const f of pages) {
    const html = read(f);
    assert.equal(withHashes(html), html, `${f}: run node tools/csp.mjs`);
    const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1] ?? "";
    assert.match(csp, /default-src 'none'/, f);
    assert.match(csp, /font-src 'none'/, f);
    assert.doesNotMatch(csp, /unsafe-/, f);
    // A hash-only policy refuses inline handlers and style attributes, so one would be a
    // silent breakage rather than a working feature.
    const { script } = inlineBlocks(html);
    assert.doesNotMatch(html.replace(script, ""), /\son[a-z]+="|\sstyle="/i, `${f}: inline handler or style attribute`);
    assert.doesNotMatch(script, /style="/, `${f}: style attribute built in script`);
  }
});

test("no page loads web fonts, CDN code or anything else from another site", () => {
  for (const f of pages) {
    const html = read(f);
    // Google Fonts sees every visitor's address and the page they opened.
    assert.doesNotMatch(html, /fonts\.googleapis|fonts\.gstatic|@font-face|@import/i, f);
    assert.doesNotMatch(html, /<(script|img|iframe)[^>]+src="(https?:)?\/\//i, f);
    assert.doesNotMatch(html, /<link[^>]+href="(https?:)?\/\//i, f);
    assert.match(html, /<link rel="icon" href="data:," \/>/, `${f}: no favicon, so every visit 404s`);
    assert.match(html, /<html lang="en-AU">/, f);
  }
});

test("Jekyll is switched off, so Pages serves the files as they are", () => {
  assert.ok(existsSync(new URL(".nojekyll", root)));
});
