// Rewrites the script and style hashes in each locked-down page's Content-Security-Policy
// so they match the inline blocks. The policy only runs code whose hash it lists, so any
// edit to either block without rerunning this leaves the page blank. `--check` only
// verifies, for tests.
//
// Run: node tools/csp.mjs [--check]

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

// Pages whose policy is hash-only. A page added here must carry exactly one inline
// <script> and one <style>, and no inline event handlers or style attributes.
export const PAGES = ["index.html", "qr.html", "bookscan.html", "cms.html", "carnivorenutrition.html"];

export function inlineBlocks(html) {
  const one = (tag) => {
    const all = [...html.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g"))];
    // A second block would run unhashed and be refused, so insist on exactly one.
    if (all.length !== 1) throw new Error(`expected exactly one <${tag}> block, found ${all.length}`);
    return all[0][1];
  };
  return { script: one("script"), style: one("style") };
}

const sha = (s) => `'sha256-${createHash("sha256").update(s, "utf8").digest("base64")}'`;

export function expectedPolicyHashes(html) {
  const { script, style } = inlineBlocks(html);
  return { script: sha(script), style: sha(style) };
}

export function withHashes(html) {
  const h = expectedPolicyHashes(html);
  return html
    .replace(/(script-src )'sha256-[^']*'/, `$1${h.script}`)
    .replace(/(style-src )'sha256-[^']*'/, `$1${h.style}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let stale = false;
  for (const name of PAGES) {
    const file = fileURLToPath(new URL(`../${name}`, import.meta.url));
    const html = readFileSync(file, "utf8");
    const fixed = withHashes(html);
    if (process.argv.includes("--check")) {
      if (fixed !== html) {
        console.error(`${name} CSP hashes are stale: run node tools/csp.mjs`);
        stale = true;
      } else console.log(`${name} CSP hashes match`);
    } else if (fixed !== html) {
      writeFileSync(file, fixed);
      console.log(`${name} CSP hashes updated`);
    } else {
      console.log(`${name} CSP hashes already current`);
    }
  }
  if (stale) process.exit(1);
}
