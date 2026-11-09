import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { profileView } from "../lib/views-profile.js";

const pub = path.join(import.meta.dirname, "..", "public");

test("hub ships the full icon set", () => {
  for (const f of ["favicon.svg", "manifest.webmanifest", "branding/icon-192.png", "branding/icon-512.png", "branding/icon-maskable-512.png", "branding/apple-touch-icon.png"]) assert.ok(existsSync(path.join(pub, f)), f);
  for (const { src } of JSON.parse(readFileSync(path.join(pub, "manifest.webmanifest"), "utf8")).icons) assert.ok(existsSync(path.join(pub, src.split("?")[0])), src);
});

test("every page links favicon, touch icon, manifest and theme color", () => {
  const html = profileView({ user: { id: 1, email: "a@b.de", name: "A" }, min: 8 });
  assert.equal(html.match(/rel="icon"/g).length, 1);
  for (const needle of ["/favicon.svg?v=", "rel=\"apple-touch-icon\"", "rel=\"manifest\"", "name=\"theme-color\""]) assert.ok(html.includes(needle), needle);
});
