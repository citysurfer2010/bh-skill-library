import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const html = readFileSync("public/index.html", "utf8");

test("HTML: oeffnende und schliessende Tags passen", () => {
  for (const tag of ["div", "main", "section", "form", "header", "ul", "body", "html"]) {
    const open = (html.match(new RegExp(`<${tag}[\\s>]`, "g")) || []).length;
    const close = (html.match(new RegExp(`</${tag}>`, "g")) || []).length;
    assert.equal(open, close, tag);
  }
});

test("Design: Farben nur in tokens.css", () => {
  for (const f of readdirSync("public/css").filter((n) => n !== "tokens.css")) {
    assert.doesNotMatch(readFileSync(`public/css/${f}`, "utf8"), /#[0-9a-fA-F]{3,8}\b/, f);
  }
});

test("Pflicht-Dokus vorhanden", () => {
  for (const f of ["PRODUCT_CONTEXT.md", "DEVELOPMENT.md", "LIMITATIONS.md"]) assert.ok(readFileSync(f, "utf8").length > 20, f);
});
