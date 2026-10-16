// Rewrites the ISBN range table inside bookscan.html from the International ISBN Agency's
// RangeMessage.xml. Hyphens in an ISBN are not decoration or a fixed pattern: where they
// fall depends on which country group and publisher block the number belongs to, and the
// agency hands out new blocks every month. So the table is regenerated, never hand-edited.
//
// Run: node tools/isbn-ranges.mjs [path/to/RangeMessage.xml]
//   With no path it downloads the current file from isbn-international.org.
//   Then run node tools/csp.mjs, because the script block's hash has changed.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SOURCE = "https://www.isbn-international.org/export_rangemessage.xml";
const page = fileURLToPath(new URL("../bookscan.html", import.meta.url));
const BEGIN = "// ISBN-RANGES-BEGIN";
const END = "// ISBN-RANGES-END";

// Each rule covers a 7-digit window. Ends are stored with their trailing 9s stripped
// (1999999 becomes "1", 9999999 becomes ""), which is lossless because the reader pads
// them back, and it roughly halves the table. Gaps the agency leaves unassigned become
// rules of length 0 so every rule list covers 0000000-9999999 without a hole.
function compactRules(xml) {
  const rules = [...xml.matchAll(/<Range>(\d{7})-(\d{7})<\/Range>\s*<Length>(\d+)<\/Length>/g)]
    .map(([, a, b, l]) => [Number(a), Number(b), Number(l)]);
  const out = [];
  let next = 0;
  for (const [a, b, l] of rules) {
    if (a > next) out.push([a - 1, 0]);
    out.push([b, l]);
    next = b + 1;
  }
  if (next < 1e7) out.push([9999999, 0]);
  return out.map(([end, len]) => `${String(end).padStart(7, "0").replace(/9+$/, "")}:${len}`).join(",");
}

export function buildTable(xml) {
  const date = /<MessageDate>([^<]+)<\/MessageDate>/.exec(xml)?.[1]?.trim();
  if (!date) throw new Error("not a RangeMessage.xml: no MessageDate");
  const section = (tag) => [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g"))].map((m) => m[1]);
  const field = (body, tag) => new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(body)[1].trim();
  const prefixes = {};
  for (const body of section("EAN.UCC")) prefixes[field(body, "Prefix")] = compactRules(body);
  const groups = {};
  for (const body of section("Group")) groups[field(body, "Prefix")] = [field(body, "Agency"), compactRules(body)];
  if (!prefixes["978"] || Object.keys(groups).length < 200) throw new Error("range table looks truncated");
  return { date, prefixes, groups };
}

export function withTable(html, table) {
  const start = html.indexOf(BEGIN);
  const stop = html.indexOf(END);
  if (start < 0 || stop < start) throw new Error("bookscan.html has no ISBN-RANGES markers");
  const line = `const ISBN_RANGES = ${JSON.stringify(table)};`;
  return `${html.slice(0, start)}${BEGIN}\n${line}\n${html.slice(stop)}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = process.argv[2];
  const xml = path ? readFileSync(path, "utf8") : await (await fetch(SOURCE)).text();
  const table = buildTable(xml);
  writeFileSync(page, withTable(readFileSync(page, "utf8"), table));
  console.log(`bookscan.html range table updated to ${table.date} (${Object.keys(table.groups).length} groups)`);
}
