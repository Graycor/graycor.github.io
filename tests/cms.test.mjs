// Tests for cms.html, whose Tailwind CSS is compiled ahead of time into its one <style>
// block (tools/cms-css.mjs) instead of being built in the browser by the Play CDN script.
//
// Run: node --test tests/

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inlineBlocks, withHashes } from "../tools/csp.mjs";

const html = readFileSync(new URL("../cms.html", import.meta.url), "utf8");
const { script, style } = inlineBlocks(html);

test("CSP hashes match the inline script and style", () => {
  assert.equal(withHashes(html), html, "run node tools/csp.mjs");
});

test("CSP forbids every outbound request and all third-party code", () => {
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
  for (const d of ["default-src 'none'", "connect-src 'none'", "font-src 'none'", "form-action 'none'", "base-uri 'none'", "frame-src 'none'"]) {
    assert.ok(csp.includes(d), d);
  }
  assert.doesNotMatch(csp, /unsafe-|https?:/);
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href="(?!data:,")|cdn\.tailwindcss|@import/i);
  assert.doesNotMatch(html.replace(script, ""), /\son[a-z]+="|\sstyle="/i, "inline handlers and style attributes are refused by the policy");
});

test("every class in the markup has compiled CSS, so a new class without a rebuild fails here", () => {
  // Tailwind escapes everything outside [A-Za-z0-9_-] in a selector with a backslash.
  const escape = (c) => c.replace(/[^A-Za-z0-9_-]/g, (ch) => `\\${ch}`);
  const classes = new Set([...html.replace(script, "").matchAll(/\sclass="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/)).filter(Boolean));
  // Classes the script toggles must exist too: the download popup depends on them.
  for (const c of script.matchAll(/classList\.(?:add|remove|toggle)\("([^"]+)"\)/g)) classes.add(c[1]);
  const missing = [...classes].filter((c) => !new RegExp(`\\.${escape(escape(c))}(?![A-Za-z0-9_\\\\-])`).test(style));
  assert.deepEqual(missing, [], "run node tools/cms-css.mjs");
  assert.ok(classes.size > 100);
});

test("house style: no em dashes", () => {
  assert.ok(!html.includes("—"));
});
