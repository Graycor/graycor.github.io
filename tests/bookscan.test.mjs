// Tests for bookscan.html. Zero dependencies: the page's inline script is loaded into a
// Node VM, which only works because the pure part (BOOKCORE) never touches the DOM.
//
// Run: node --test tests/

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { inlineBlocks, withHashes } from "../tools/csp.mjs";

const html = readFileSync(new URL("../bookscan.html", import.meta.url), "utf8");
const { script } = inlineBlocks(html);
const B = vm.runInNewContext(`${script}\n;BOOKCORE`, { URL });
// Objects made inside the VM have another realm's prototypes; a JSON round trip makes
// them comparable with deepEqual.
const plain = (v) => JSON.parse(JSON.stringify(v));

// Check digits computed here from the published rules, not by calling the page: a test
// that reuses the code it tests agrees with it about everything, including its mistakes.
function isbn10Check(first9) {
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(first9[i]) * (10 - i);
  const r = (11 - (sum % 11)) % 11;
  return r === 10 ? "X" : String(r);
}
function ean13Check(first12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
}

test("CSP hashes match the inline script and style", () => {
  assert.equal(withHashes(html), html, "run node tools/csp.mjs");
});

test("CSP only lets the page talk to the two book services", () => {
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
  const dir = Object.fromEntries(csp.split(";").map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));
  assert.deepEqual(dir["default-src"], ["'none'"]);
  assert.deepEqual(dir["connect-src"], ["https://www.googleapis.com", "https://openlibrary.org"]);
  assert.equal(dir["script-src"].length, 1);
  assert.match(dir["script-src"][0], /^'sha256-[A-Za-z0-9+/=]{44}'$/);
  for (const d of ["font-src", "form-action", "base-uri", "object-src", "worker-src", "frame-src"]) assert.deepEqual(dir[d], ["'none'"], d);
  assert.doesNotMatch(csp, /unsafe-|\*\.com|https:\s|http:/);
  // Covers may only come from the services' own image hosts.
  for (const h of dir["img-src"]) assert.match(h, /^(data:|blob:|https:\/\/(books\.google\.com|books\.googleusercontent\.com|covers\.openlibrary\.org|archive\.org|\*\.archive\.org))$/, h);
  assert.match(html, /<meta name="referrer" content="strict-origin" \/>/);
});

test("no third-party code, inline handlers, style attributes or HTML injection sinks", () => {
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href="(?!data:,")|@import|url\(https?:/i, "nothing loaded from elsewhere");
  // A hash-only policy refuses these outright, so one slipping in is a dead control.
  assert.doesNotMatch(html.replace(script, ""), /\son[a-z]+="/i, "inline event handler");
  assert.doesNotMatch(html.replace(script, ""), /\sstyle="/i, "style attribute");
  for (const sink of ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval(", "new Function", "import(", "setTimeout(\"", "javascript:"]) {
    assert.ok(!script.includes(sink), `script uses ${sink}`);
  }
  // Nothing but these three keys goes into browser storage, and never a cookie.
  assert.ok(!script.includes("document.cookie") && !script.includes("sessionStorage") && !script.includes("indexedDB"));
  const keys = [...script.matchAll(/"bookscan:v2:[a-z-]+"/g)].map((m) => m[0]);
  assert.deepEqual([...new Set(keys)].sort(), ['"bookscan:v2:books"', '"bookscan:v2:google-key"', '"bookscan:v2:prefs"']);
});

test("house style: no em dashes, Australian English", () => {
  assert.ok(!html.includes("—"));
  const { style } = inlineBlocks(html);
  assert.doesNotMatch(html.replace(script, "").replace(style, ""), /\b(color|organiz\w*|behavior|catalog)\b/i);
});

const BOOKS = [
  // [SBN, ISBN-10, ISBN-13], from Congregate's test-isbn.mjs and the ISBN users' manual.
  ["310286476", "0310286476", "9780310286479"],
  ["851110134", "0851110134", "9780851110134"],
  ["340008652", "0340008652", "9780340008652"],
  ["306406152", "0306406152", "9780306406157"],
];

test("one book in every notation becomes the same ISBN-13", () => {
  for (const [sbn, ten, thirteen] of BOOKS) {
    assert.equal(ten[9], isbn10Check(ten.slice(0, 9)), `fixture ${ten}`);
    assert.equal(thirteen[12], ean13Check(thirteen.slice(0, 12)), `fixture ${thirteen}`);
    assert.deepEqual(plain(B.parseBookCode(sbn)), { ok: true, isbn13: thirteen, kind: "SBN", addon: null });
    assert.deepEqual(plain(B.parseBookCode(ten)), { ok: true, isbn13: thirteen, kind: "ISBN-10", addon: null });
    assert.deepEqual(plain(B.parseBookCode(thirteen)), { ok: true, isbn13: thirteen, kind: "ISBN-13", addon: null });
    assert.equal(B.isbn13To10(thirteen), ten);
    const f = B.bookForms(thirteen);
    assert.equal(f.sbn, sbn);
    assert.equal(f.isbn10, ten);
  }
});

test("accepts the ways people actually write book numbers", () => {
  const same = "9780306406157";
  for (const raw of ["978-0-306-40615-7", "978 0 306 40615 7", "ISBN 978-0-306-40615-7", "ISBN-13: 978-0-306-40615-7",
    "isbn-10: 0-306-40615-2", "ISBN10 0306406152", "ISBN0306406152", "SBN 306-40615-2", "0–306–40615–2",
    "０３０６４０６１５２", " 0.306.40615.2 ", "0306406152\n"]) {
    const p = B.parseBookCode(raw);
    assert.ok(p.ok, raw);
    assert.equal(p.isbn13, same, raw);
  }
  assert.equal(B.parseBookCode("043942089x").isbn13, B.parseBookCode("043942089X").isbn13);
  assert.equal(B.parseBookCode("043942089X").kind, "ISBN-10");
});

test("keeps a barcode's price add-on apart from the ISBN", () => {
  assert.deepEqual(plain(B.parseBookCode("978030640615751995")), { ok: true, isbn13: "9780306406157", kind: "ISBN-13", addon: "51995" });
  assert.deepEqual(plain(B.parseBookCode("978030640615712")), { ok: true, isbn13: "9780306406157", kind: "ISBN-13", addon: "12" });
});

test("979 numbers, which have no ISBN-10, and sheet music", () => {
  const p = B.parseBookCode("979-10-90636-07-1");
  assert.equal(p.kind, "ISBN-13");
  assert.equal(B.isbn13To10(p.isbn13), null);
  const f = B.bookForms(p.isbn13);
  assert.equal(f.isbn10, null);
  assert.equal(f.sbn, null);
  assert.equal(f.isbn13Hyphen, "979-10-90636-07-1");
  assert.equal(f.region, "France");
  // ISMN: 979-0 is music. Valid, but no book service will have it.
  const m = "97900" + "0000000";
  const ismn = m.slice(0, 12) + ean13Check(m.slice(0, 12));
  assert.equal(B.parseBookCode(ismn).kind, "ISMN");
});

test("refuses what is not a book number, and says why", () => {
  const why = (raw) => B.parseBookCode(raw).reason ?? "";
  assert.match(why("0310286470"), /check digit/, "ISBN-10 bad check");
  assert.match(why("9780310286470"), /check digit/, "ISBN-13 bad check");
  assert.match(why("310286470"), /SBN/, "SBN bad check");
  assert.match(why("0360406152"), /swapped|mistyped/, "transposed digits");
  assert.match(why("5000159484695"), /product code/, "cereal box");
  assert.match(why("9770317847001"), /ISSN/, "magazine barcode");
  assert.match(why("036000291452"), /UPC/, "UPC-A");
  assert.match(why("0317-8471"), /ISSN/, "bare ISSN");
  assert.match(why("12345"), /13, 10 or 9 digits/);
  assert.match(why("Knowing God"), /search/);
  assert.match(why("03X6406152"), /last character/);
  assert.match(why(""), /Type or scan/);
  assert.match(why(null), /Type or scan/);
});

test("hyphenates by the ISBN agency's ranges", () => {
  const h = (raw) => B.bookForms(B.parseBookCode(raw).isbn13);
  assert.equal(h("9780306406157").isbn13Hyphen, "978-0-306-40615-7");
  assert.equal(h("9780306406157").isbn10Hyphen, "0-306-40615-2");
  assert.equal(h("9780306406157").sbnHyphen, "306-40615-2");
  assert.equal(h("9780306406157").region, "English language");
  assert.equal(h("9783161484100").isbn13Hyphen, "978-3-16-148410-0");
  assert.equal(h("9783161484100").region, "German language");
  assert.equal(h("9780140328721").isbn13Hyphen, "978-0-14-032872-1");
  assert.equal(h("9780140328721").sbnHyphen, "14-032872-6", "the SBN keeps the ISBN-10 check digit");
  // Group 0 is English: an ISBN-10 in group 3 has no SBN.
  assert.equal(h("9783161484100").sbn, null);
  assert.ok(/^\w/.test(B.ISBN_RANGES.date) && Object.keys(B.ISBN_RANGES.groups).length > 200, "range table present");
  for (const [prefix, [, rules]] of Object.entries(B.ISBN_RANGES.groups)) {
    assert.ok(rules.endsWith(":0") || rules.split(",").at(-1).startsWith(":"), `${prefix} rules reach 9999999`);
  }
});

// An independent EAN-13 encoder, straight from the symbology tables, to draw barcodes for
// the decoder to read.
const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = L.map((p) => [...p].map((b) => (b === "0" ? "1" : "0")).reverse().join(""));
const R = L.map((p) => [...p].map((b) => (b === "0" ? "1" : "0")).join(""));
const FIRST = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];
function ean13Modules(code) {
  let bits = "101";
  for (let i = 1; i <= 6; i++) bits += (FIRST[code[0]][i - 1] === "L" ? L : G)[code[i]];
  bits += "01010";
  for (let i = 7; i <= 12; i++) bits += R[code[i]];
  return `${bits}101`;
}
function barcodeImage(code, { scale = 3, flip = false, width = 420, height = 60, noise = 0 } = {}) {
  let bits = ean13Modules(code);
  if (flip) bits = [...bits].reverse().join("");
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const left = Math.floor((width - bits.length * scale) / 2);
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const m = Math.floor((x - left) / scale);
      const dark = m >= 0 && m < bits.length && bits[m] === "1";
      const v = Math.max(0, Math.min(255, (dark ? 30 : 230) + (rand() - 0.5) * noise));
      const p = (y * width + x) * 4;
      data[p] = data[p + 1] = data[p + 2] = v;
    }
  }
  return data;
}

test("decodes EAN-13 barcodes, upside down too, and only valid ones", () => {
  for (const code of ["9780306406157", "9780140328721", "9791090636071", "9780310286479"]) {
    assert.equal(B.decodeEan13(barcodeImage(code), 420, 60), code);
    assert.equal(B.decodeEan13(barcodeImage(code, { flip: true }), 420, 60), code, `${code} upside down`);
    assert.equal(B.decodeEan13(barcodeImage(code, { scale: 2, noise: 60 }), 420, 60), code, `${code} small and noisy`);
  }
  // A misprinted check digit draws a symbol that is perfectly readable and wrong.
  assert.equal(B.decodeEan13(barcodeImage("9780306406158"), 420, 60), null);
  assert.equal(B.decodeEan13(new Uint8ClampedArray(420 * 60 * 4).fill(128), 420, 60), null);
});

test("Google key check refuses secrets that are not API keys", () => {
  const good = "AIza" + "Sy0123456789abcdefghijklmnopqrstu_-";
  assert.equal(good.length, 39);
  assert.equal(B.checkGoogleKey(`  ${good} `).key, good);
  assert.match(B.checkGoogleKey('{"type": "service_account", "private_key": "-----BEGIN PRIVATE KEY-----"}').reason, /service account/);
  assert.match(B.checkGoogleKey("GOCSPX-abcdefghijklmnop").reason, /client secret/);
  assert.match(B.checkGoogleKey("ya29.a0AfH6SMB").reason, /token/);
  assert.match(B.checkGoogleKey("hunter2").reason, /AIza/);
  assert.match(B.checkGoogleKey(good + "x").reason, /AIza/);
  assert.match(B.checkGoogleKey("AIza<script>alert(1)</script>12345678901").reason, /AIza/);
  assert.ok(B.checkGoogleKey("").empty);
});

test("the key only ever goes to Google, and user text is encoded", () => {
  const key = "AIza" + "x".repeat(35);
  const g = new URL(B.googleIsbnUrl("9780306406157", key));
  assert.equal(g.origin, "https://www.googleapis.com");
  assert.equal(g.searchParams.get("key"), key);
  assert.equal(g.searchParams.get("q"), "isbn:9780306406157");
  const t = new URL(B.googleTitleUrl('Knowing "God"&key=evil', "J. I. Packer", key));
  assert.equal(t.searchParams.getAll("key").length, 1);
  assert.equal(t.searchParams.get("q"), 'intitle:"Knowing \\"God\\"&key=evil" inauthor:"J. I. Packer"');
  const o = new URL(B.openLibraryIsbnUrl("9780306406157"));
  assert.equal(o.origin, "https://openlibrary.org");
  assert.equal(o.searchParams.get("bibkeys"), "ISBN:9780306406157,ISBN:0306406152");
  assert.equal(new URL(B.openLibraryIsbnUrl("9791090636071")).searchParams.get("bibkeys"), "ISBN:9791090636071");
  assert.equal(new URL(B.openLibrarySearchUrl("a&b=c")).searchParams.get("q"), "a&b=c");
  assert.ok(!B.openLibraryIsbnUrl("9780306406157").includes("AIza") && !B.openLibrarySearchUrl("x").includes("key="));
  assert.equal(new URL(B.googleIsbnUrl("9780306406157", null)).searchParams.has("key"), false);
});

test("cover links are https and only from the allowed hosts", () => {
  assert.equal(B.safeCoverUrl("http://books.google.com/books/content?id=abc&printsec=frontcover&img=1&zoom=5&edge=curl&source=gbs_api"),
    "https://books.google.com/books/content?id=abc&printsec=frontcover&img=1&zoom=1&source=gbs_api");
  assert.equal(B.safeCoverUrl("https://covers.openlibrary.org/b/id/240727-M.jpg"), "https://covers.openlibrary.org/b/id/240727-M.jpg");
  for (const bad of ["javascript:alert(1)", "data:image/svg+xml,<svg onload=alert(1)>", "https://evil.example/x.jpg",
    "https://books.google.com.evil.example/x", "https://user@books.google.com/x", "https://books.google.com:8443/x", "//covers.openlibrary.org/x", null, 42]) {
    assert.equal(B.safeCoverUrl(bad), null, String(bad));
  }
});

const GOOGLE = {
  totalItems: 2,
  items: [
    { id: "other", volumeInfo: { title: "A neighbouring edition", industryIdentifiers: [{ type: "ISBN_13", identifier: "9780306406164" }] } },
    { id: "zyTCAlFPjgYC", volumeInfo: {
      title: "The Google Story‮", subtitle: "Inside", authors: ["David A. Vise", "Mark Malseed", 7], publisher: "Random House",
      publishedDate: "2005-11-15", description: "<p>An <b>inside</b> look &amp; more<br>second line &#8211; &#x263A;</p><script>alert(1)</script>",
      pageCount: 207, language: "en", categories: ["Business & Economics"],
      industryIdentifiers: [{ type: "ISBN_10", identifier: "0306406152" }],
      imageLinks: { thumbnail: "http://books.google.com/books/content?id=zyTCAlFPjgYC&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api" },
    } },
  ],
};

test("parses a Google Books answer, preferring the volume with the number asked for", () => {
  const g = plain(B.parseGoogleIsbn(GOOGLE, "9780306406157"));
  assert.equal(g.title, "The Google Story", "direction override stripped");
  assert.equal(g.authors, "David A. Vise, Mark Malseed");
  assert.equal(g.year, "2005");
  assert.equal(g.pages, 207);
  assert.equal(g.description, "An inside look & more\nsecond line \u2013 \u263A\nalert(1)");
  assert.equal(g.cover, "https://books.google.com/books/content?id=zyTCAlFPjgYC&printsec=frontcover&img=1&zoom=1&source=gbs_api");
  assert.equal(g.isbn13, "9780306406157");
  assert.equal(B.parseGoogleIsbn({}, "9780306406157"), null);
  assert.equal(B.parseGoogleIsbn({ items: [{ volumeInfo: { title: 5 } }] }, "9780306406157"), null);
  assert.equal(B.parseGoogleIsbn("<html>", "9780306406157"), null);
  assert.equal(B.parseGoogleList(GOOGLE)[1].ref, "g:zyTCAlFPjgYC");
});

test("parses Open Library answers and merges them under Google's", () => {
  const ol = {
    "ISBN:0306406152": {
      title: "Fantastic Mr. Fox", authors: [{ name: "Roald Dahl" }], publishers: [{ name: "Puffin" }], publish_date: "October 1, 1988",
      number_of_pages: 96, subjects: [{ name: "Foxes" }, { name: "Fiction" }], cover: { large: "https://covers.openlibrary.org/b/id/1-L.jpg" },
    },
  };
  const o = plain(B.parseOpenLibrary(ol, "9780306406157"));
  assert.equal(o.title, "Fantastic Mr. Fox");
  assert.equal(o.year, "1988");
  assert.equal(o.publisher, "Puffin");
  assert.equal(o.categories, "Foxes, Fiction");
  assert.equal(B.parseOpenLibrary({}, "9780306406157"), null);
  const merged = plain(B.mergeMeta({ title: "Google title", cover: null, pages: null }, o));
  assert.equal(merged.title, "Google title");
  assert.equal(merged.cover, "https://covers.openlibrary.org/b/id/1-L.jpg");
  assert.equal(merged.pages, 96);
  const s = plain(B.parseOpenLibrarySearch({ docs: [
    { key: "/works/OL45804W", title: "Knowing God", author_name: ["J. I. Packer"], first_publish_year: 1973, isbn: ["junk", "0340176415", "9780340176412"], cover_i: 12345 },
    { key: "javascript:alert(1)", title: "No ISBN" },
  ] }));
  assert.equal(s[0].isbn13, "9780340176412");
  assert.equal(s[0].cover, "https://covers.openlibrary.org/b/id/12345-M.jpg");
  assert.equal(s[0].ref, "ol:/works/OL45804W");
  assert.equal(s[1].ref, null);
});

test("the saved list is rebuilt field by field when read back", () => {
  const tampered = JSON.stringify([
    { isbn13: "9780306406157", copies: 3, status: "found", added: "2026-10-16T00:00:00Z", sources: ["Google Books", "evil"],
      meta: { title: "x".repeat(5000), cover: "https://evil.example/track.gif", pages: -4, description: { toString: 1 } }, extra: "<img onerror>" },
    { isbn13: "0306406152", copies: 1 },
    { isbn13: "9780306406158" },
    { ref: "g:../../etc" },
    { ref: "ol:/works/OL45804W", kind: "search", copies: 99999, meta: { title: "Knowing God" } },
    "junk", null, 7,
  ]);
  const list = plain(B.sanitiseBooks(tampered));
  assert.equal(list.length, 2, "duplicate, invalid and junk rows dropped");
  assert.equal(list[0].meta.title.length, 300);
  assert.equal(list[0].meta.cover, null);
  assert.equal(list[0].meta.pages, null);
  assert.equal(list[0].meta.description, null);
  assert.deepEqual(list[0].sources, ["Google Books"]);
  assert.equal(list[0].extra, undefined);
  assert.equal(list[1].copies, 1, "out-of-range copies reset");
  assert.deepEqual(plain(B.sanitiseBooks("{not json")), []);
  assert.deepEqual(plain(B.sanitiseBooks('{"a":1}')), []);
});

test("CSV export neutralises formulas and quotes properly", () => {
  assert.equal(B.csvCell("=HYPERLINK(\"http://evil\")"), "\"'=HYPERLINK(\"\"http://evil\"\")\"");
  for (const c of ["+1", "-2", "@SUM(A1)", "\tx"]) assert.ok(B.csvCell(c).startsWith("'") || B.csvCell(c).startsWith("\"'"), c);
  assert.equal(B.csvCell("Hello, world"), "\"Hello, world\"");
  assert.equal(B.csvCell("978-0-306-40615-7"), "978-0-306-40615-7");
  assert.equal(B.csvCell(null), "");
  const book = B.sanitiseBook({ isbn13: "9780306406157", kind: "SBN", input: "306406152", copies: 2, status: "found", sources: ["Open Library"],
    added: "2026-10-16T00:00:00Z", meta: { title: "=cmd|' /C calc'!A0", authors: "A, B", description: "line one\nline two" } });
  const csv = B.toCsv([book]);
  assert.ok(csv.startsWith("﻿isbn13,isbn13_hyphenated,isbn10,"));
  const row = csv.split("\r\n")[1];
  assert.ok(row.startsWith("9780306406157,978-0-306-40615-7,0306406152,0-306-40615-2,306-40615-2,'=cmd|' /C calc'!A0,,\"A, B\","), row);
  assert.ok(csv.includes("\"line one\nline two\""));
  assert.ok(csv.endsWith("\r\n"));
});

test("the limiter paces requests and caps a session", () => {
  const lim = B.makeLimiter({ gapMs: 300, perMinute: 3, perSession: 5 });
  assert.equal(lim.delay(0), 0);
  lim.take(0);
  assert.equal(lim.delay(100), 200);
  lim.take(300);
  lim.take(600);
  assert.equal(lim.delay(900), 59100, "fourth in a minute waits for the first to age out");
  assert.equal(lim.delay(60001), 0);
  lim.take(60001);
  lim.take(60301);
  assert.ok(lim.exhausted());
  assert.equal(lim.used, 5);
  assert.ok(B.PACE.google.perSession <= 1000, "stays under Google's default daily quota");
  assert.ok(B.PACE.openLibrary.gapMs >= 1000, "no more than one Open Library call a second");
});
