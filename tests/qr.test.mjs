// Tests for qr.html, the in-browser QR generator. Zero dependencies: the page's inline
// script is loaded into a Node VM, which only works because the pure part (QRCORE) never
// touches the DOM.
//
// Run: node --test tests/

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import vm from "node:vm";
import { inlineBlocks, withHashes } from "../tools/csp.mjs";

const html = readFileSync(new URL("../qr.html", import.meta.url), "utf8");
const { script } = inlineBlocks(html);
const Q = vm.runInNewContext(`${script}\n;QRCORE`, { TextEncoder, URL });

test("CSP hashes match the inline script and style", () => {
  assert.equal(withHashes(html), html, "run node tools/csp.mjs");
});

test("CSP forbids every outbound request", () => {
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
  for (const d of ["default-src 'none'", "connect-src 'none'", "form-action 'none'", "base-uri 'none'", "font-src 'none'"]) {
    assert.ok(csp.includes(d), d);
  }
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|https?:/);
});

test("the page loads nothing from elsewhere and stores nothing", () => {
  assert.doesNotMatch(html, /\b(src|href)="(https?:)?\/\//i);
  // The promise on the page is no storage, no cookies and no network: hold the code to it.
  for (const api of ["localStorage", "sessionStorage", "indexedDB", "document.cookie", "fetch(", "XMLHttpRequest",
    "WebSocket", "sendBeacon", "EventSource", "eval(", "new Function", "import(", "caches."]) {
    assert.ok(!script.includes(api), `script uses ${api}`);
  }
});

test("house style: no em dashes", () => {
  assert.ok(!html.includes("—"));
});

test("version tables match the spec's total codewords", () => {
  // ISO/IEC 18004 table 1. A mistyped block count would make plausible codes that never scan.
  const TOTAL = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346, 404, 466, 532, 581, 655, 733, 815, 901, 991, 1085];
  for (let v = 1; v <= 20; v++) {
    for (const lv of ["L", "M", "Q", "H"]) {
      const s = Q.SPECS[v].levels[lv];
      const sum = s.groups.reduce((t, [blocks, data]) => t + blocks * (data + s.ecPerBlock), 0);
      assert.equal(sum, TOTAL[v], `version ${v} level ${lv}`);
    }
  }
});

test("matrices match fingerprints verified with a real decoder", () => {
  // Each was decoded back to its input with jsQR on 2026-10-16 before being pinned here.
  const fp = (m) => createHash("sha256").update(m.map((r) => r.map(Number).join("")).join("\n")).digest("hex").slice(0, 16);
  assert.equal(fp(Q.qrMatrix("https://graycor.github.io", "M")), "40713e5cc7825daa");
  assert.equal(fp(Q.qrMatrix("Hello, wörld", "H")), "11351c1e94ab9b5e");
  assert.equal(fp(Q.qrMatrix("x".repeat(400), "L")), "c689e5090c3a99c0");
  assert.equal(fp(Q.qrMatrix("WIFI:T:WPA;S:Home;P:secret;;", "Q")), "b48bb63586c279bf");
});

test("an icon forces high error correction; too much data is refused", () => {
  assert.equal(Q.encode("https://example.com", Q.levelsFor("auto", true)).level, "H");
  assert.equal(Q.encode("https://example.com", Q.levelsFor("auto", false)).level, "M");
  assert.equal(Q.encode("x".repeat(2000), Q.levelsFor("auto", false)), null);
});

test("payload builders", () => {
  assert.equal(Q.buildPayload("url", { url: " example.com.au/menu " }), "https://example.com.au/menu");
  assert.equal(Q.buildPayload("url", { url: "localhost:3000" }), "https://localhost:3000");
  assert.equal(Q.buildPayload("email", { emailTo: "a@b.com", emailSubject: "Hi there", emailBody: "" }), "mailto:a@b.com?subject=Hi%20there");
  assert.equal(Q.buildPayload("phone", { phone: "+61 2 6123 4567" }), "tel:+61261234567");
  assert.equal(Q.buildPayload("sms", { smsNum: "0412 345 678", smsMsg: " Hello " }), "SMSTO:0412345678:Hello");
  assert.equal(Q.buildPayload("wifi", { wifiSsid: "Home;Net", wifiEnc: "WPA", wifiPass: 'p:"s', wifiHidden: true }),
    'WIFI:T:WPA;S:Home\\;Net;P:p\\:\\"s;H:true;;');
  assert.equal(Q.buildPayload("wifi", { wifiSsid: "Cafe", wifiEnc: "nopass", wifiPass: "ignored" }), "WIFI:T:nopass;S:Cafe;;");
  assert.equal(Q.buildPayload("vcard", { vcFirst: "Jo", vcLast: "Citizen", vcUrl: "example.com" }),
    "BEGIN:VCARD\nVERSION:3.0\nN:Citizen;Jo;;;\nFN:Jo Citizen\nURL:https://example.com\nEND:VCARD");
  assert.equal(Q.buildPayload("geo", { geoLat: "-35.2809", geoLon: "149.13" }), "geo:-35.2809,149.13");
  assert.equal(Q.buildPayload("event", { evTitle: "Bee, 1", evStart: "2026-11-01T09:00", evEnd: "" }),
    "BEGIN:VEVENT\nSUMMARY:Bee\\, 1\nDTSTART:20261101T090000\nEND:VEVENT");
  assert.equal(Q.buildPayload("text", { text: "   " }), "");
});

const verdict = (kind, f) => Q.assess(kind, f);
const blocked = (kind, f) => verdict(kind, f).blocks.length > 0;
const warned = (kind, f, re) => verdict(kind, f).warns.some((w) => re.test(w));

test("blocks deceptive or dangerous content", () => {
  assert.ok(blocked("url", { url: "javascript:alert(1)" }));
  assert.ok(blocked("url", { url: "data:text/html,hi" }));
  assert.ok(blocked("url", { url: "https://mybank.com@evil.example" }));
  assert.ok(blocked("url", { url: "https://pаypal.com" }), "Cyrillic a among Latin letters");
  assert.ok(blocked("url", { url: "https://example.com/‮fdp.exe" }), "right-to-left override");
  assert.ok(blocked("text", { text: "bitcoin:1BoatSLRHtKNngkdXEeobR76b53LETtpyT?amount=1" }));
  assert.ok(blocked("text", { text: "javascript:alert(1)" }));
  assert.ok(blocked("sms", { smsNum: "0412345678", smsMsg: "Pay now https://x.com@evil.example" }));
  assert.ok(blocked("email", { emailTo: "not an address" }));
  assert.ok(blocked("geo", { geoLat: "95", geoLon: "10" }));
});

test("warns about risky but legitimate links", () => {
  assert.ok(warned("url", { url: "https://bit.ly/abc" }, /shortener/));
  assert.ok(warned("url", { url: "https://paypa1-secure.com/login" }, /PayPal/));
  assert.ok(warned("url", { url: "https://ato-refund.com.au" }, /ATO/));
  assert.ok(warned("url", { url: "http://example.com" }, /not encrypted/));
  assert.ok(warned("url", { url: "https://203.0.113.9/" }, /IP address/));
  assert.ok(warned("url", { url: "https://example.com/app.apk" }, /app or program/));
  assert.ok(warned("url", { url: "https://example.com/?next=https://evil.example" }, /another address/));
  assert.ok(warned("url", { url: "https://xn--80ak6aa92e.com" }, /international/));
  assert.ok(warned("phone", { phone: "1900 123 456" }, /premium/));
});

test("does not flag ordinary links", () => {
  for (const url of ["https://www.ato.gov.au/individuals", "https://tomato.com.au", "https://paypal.com/au",
    "https://graycor.github.io/qr.html", "anzac.org.au", "https://shop.example.com.au/menu?table=4"]) {
    const v = verdict("url", { url });
    // JSON round trip: arrays made inside the VM have another realm's prototype.
    assert.equal(JSON.stringify([v.blocks, v.warns]), "[[],[]]", url);
  }
});

const baseDesign = {
  qz: 4, module: "square", eyeOuter: "square", eyeInner: "square", fill: "solid", fg: "#111827", fg2: "#3b5bdb",
  angle: 45, bg: "#ffffff", transparent: false, eyeCustom: false, icon: "none", iconSize: 0.22, plate: "rounded",
  clear: true, iconCol: "#111827", frame: "none", caption: "", frameCol: "#111827", captionCol: "#ffffff", address: "",
};

test("design notes catch the choices that stop a code scanning", () => {
  assert.equal(Q.designNotes({ ...baseDesign, ec: "auto" }).length, 0);
  assert.ok(Q.designNotes({ ...baseDesign, ec: "auto", fg: "#dddddd" }).some((w) => /too close/.test(w)));
  assert.ok(Q.designNotes({ ...baseDesign, ec: "auto", fg: "#ffffff", bg: "#000000" }).some((w) => /lighter/.test(w)));
  assert.ok(Q.designNotes({ ...baseDesign, ec: "auto", qz: 2 }).some((w) => /quiet border/.test(w)));
  assert.ok(Q.designNotes({ ...baseDesign, ec: "M", icon: "star" }).some((w) => /High error correction/.test(w)));
});

test("every style combination draws a well-formed SVG", () => {
  const matrix = Q.qrMatrix("https://example.com/a-somewhat-longer-path-for-version-7-or-so", "H");
  for (const module of ["square", "rounded", "fluid", "dots", "diamond"]) {
    for (const frame of ["none", "bottom", "top", "pill", "outline"]) {
      for (const icon of ["none", "text", ...Object.keys(Q.ICONS)]) {
        const scene = Q.buildScene({ ...baseDesign, matrix, module, frame, icon, iconText: "AB", caption: "SCAN ME",
          address: "example.com", eyeOuter: "pointed", eyeInner: "circle", fill: "linear", transparent: frame === "top" });
        const svg = Q.toSvg(scene, 1024);
        assert.match(svg, /^<\?xml[^>]+>\n<svg [^>]+>[\s\S]*<\/svg>\n$/);
        assert.doesNotMatch(svg, /NaN|undefined|Infinity/, `${module}/${frame}/${icon}`);
        assert.ok((svg.match(/<linearGradient/g) || []).length === 1, "one shared gradient");
      }
    }
  }
});

test("SVG output escapes text and refuses non-PNG image sources", () => {
  const matrix = Q.qrMatrix("hi", "H");
  const svg = Q.toSvg(Q.buildScene({ ...baseDesign, matrix, frame: "bottom", caption: '<script>"&' }), 512);
  assert.ok(!svg.includes("<script>"));
  assert.ok(svg.includes("&lt;script&gt;&quot;&amp;"));
  const evil = Q.toSvg(Q.buildScene({ ...baseDesign, matrix, icon: "image",
    iconImage: { src: "data:image/svg+xml,<svg onload=alert(1)>", w: 10, h: 10 } }), 512);
  assert.ok(!evil.includes("<image"));
});

test("file names are sanitised", () => {
  assert.equal(Q.fileName("../My Café menu!", "qr-url"), "my-caf-menu");
  assert.equal(Q.fileName("", "qr-wifi"), "qr-wifi");
});
