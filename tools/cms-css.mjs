// Compiles the Tailwind classes cms.html uses into plain CSS inside the page's one <style>
// block, then refreshes the CSP hashes. The page used to load Tailwind's Play CDN script,
// which built the CSS in every visitor's browser and ran third-party code with access to
// everything on graycor.github.io, including BookScan's remembered API key. Now the page
// loads nothing from anywhere.
//
// Run after adding or changing any class in cms.html: node tools/cms-css.mjs
// The pinned version is the newest Tailwind 3 (the Play CDN served 3.4.17 and the config
// is v3 syntax); npx fetches it on demand, so the repo carries no dependencies.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const TAILWIND = "tailwindcss@3.4.19";
const root = fileURLToPath(new URL("..", import.meta.url));
const page = join(root, "cms.html");
const dir = mkdtempSync(join(tmpdir(), "cms-css-"));
const input = join(dir, "in.css");
const output = join(dir, "out.css");
writeFileSync(input, "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n");
execFileSync("npx", ["--yes", TAILWIND, "-c", "tools/tailwind.cms.config.cjs", "-i", input, "-o", output, "--minify"], { cwd: root, stdio: "inherit" });

// The minified CSS is one line; the hash only has to match whatever sits between the tags.
const css = readFileSync(output, "utf8").trim();
const html = readFileSync(page, "utf8");
const next = html.replace(/<style>[\s\S]*?<\/style>/, () => `<style>${css}</style>`);
if (next === html && !html.includes(css)) throw new Error("cms.html has no <style> block to fill");
writeFileSync(page, next);
execFileSync(process.execPath, ["tools/csp.mjs"], { cwd: root, stdio: "inherit" });
console.log(`cms.html CSS rebuilt with ${TAILWIND} (${css.length} bytes)`);
