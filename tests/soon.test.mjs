// Tests for the coming-soon section of index.html. The app list is a JSON block, so it is read
// straight out of the page; no browser needed.
//
// Run: node --test tests/

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const apps = JSON.parse(/<script type="application\/json" id="apps-data">([\s\S]*?)<\/script>/.exec(html)[1]);
const here = (p) => new URL(`../${p}`, import.meta.url);

test("every app has the fields the dialog shows", () => {
  assert.ok(apps.length > 0);
  for (const a of apps) {
    for (const k of ["id", "name", "repo", "logo", "tagline", "summary", "platforms"]) assert.ok(a[k], `${a.id}: ${k}`);
    assert.equal(typeof a.released, "boolean", `${a.id}: released`);
    assert.ok(Array.isArray(a.features) && a.features.length, `${a.id}: features`);
    assert.ok(Array.isArray(a.shots), `${a.id}: shots`);
    // The id is the URL hash, and the repo goes into a github.com URL.
    assert.match(a.id, /^[a-z0-9-]+$/);
    assert.match(a.repo, /^(Graycor|TheCentreHub)\/[A-Za-z0-9._-]+$/);
  }
  assert.equal(new Set(apps.map((a) => a.id)).size, apps.length, "duplicate id");
});

test("every logo and screenshot exists, and every image in img/apps is used", () => {
  const used = new Set();
  for (const a of apps) {
    for (const src of [a.logo, ...a.shots.map((s) => s.src)]) {
      assert.ok(existsSync(here(src)), `${a.id}: missing ${src}`);
      used.add(src);
    }
    for (const s of a.shots) assert.ok(s.caption, `${a.id}: ${s.src} has no caption`);
  }
  for (const f of readdirSync(here("img/apps"))) assert.ok(used.has(`img/apps/${f}`), `unused image img/apps/${f}`);
});

test("nothing links to a private repo: unreleased apps stay greyed out", () => {
  // Every repo is private until it ships, and a private repo's release page is a 404 to visitors.
  // The download link is built only for released apps; the HTML itself names no repo URL.
  assert.doesNotMatch(html, /github\.com\/(Graycor|TheCentreHub)\//i);
  for (const a of apps) if (a.more) assert.ok(existsSync(here(a.more)), `${a.id}: ${a.more}`);
});

test("house style: no em dashes, Australian spelling", () => {
  assert.ok(!html.includes("—"));
  for (const a of apps) {
    const text = [a.tagline, a.summary, ...a.features, ...a.shots.map((s) => s.caption)].join(" ");
    assert.doesNotMatch(text, /\b(organiz|color\b|behavior|analyz|favorite|center\b)/i, a.id);
  }
});

test("no image carries hidden text: run metastrip over img/apps before committing", () => {
  // The MediaBot logo arrived with its whole ComfyUI prompt and workflow in zTXt chunks. Generated
  // art carries its recipe like that, and a published page should not.
  for (const f of readdirSync(here("img/apps"))) {
    const buf = readFileSync(here(`img/apps/${f}`));
    if (f.endsWith(".png")) {
      for (let at = 8; at < buf.length;) {
        const len = buf.readUInt32BE(at);
        const type = buf.toString("latin1", at + 4, at + 8);
        assert.ok(!["tEXt", "zTXt", "iTXt", "eXIf"].includes(type), `${f}: ${type} chunk`);
        at += 12 + len;
      }
    } else if (f.endsWith(".webp")) {
      for (const tag of ["EXIF", "XMP "]) assert.ok(!buf.includes(tag, 12, "latin1"), `${f}: ${tag}`);
    }
  }
});
