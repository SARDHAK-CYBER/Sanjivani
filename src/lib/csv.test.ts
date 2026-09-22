import { test } from "node:test";
import assert from "node:assert/strict";
import { csvCell, toCsv } from "./csv";

test("csvCell quotes every cell and escapes embedded quotes and commas", () => {
  assert.equal(csvCell("plain"), '"plain"');
  assert.equal(csvCell('say "hi", ok'), '"say ""hi"", ok"');
  assert.equal(csvCell(null), '""');
  assert.equal(csvCell(42), '"42"');
});

test("csvCell neutralises spreadsheet formula injection", () => {
  for (const evil of ["=HYPERLINK(\"http://evil\")", "+1+1", "-2+3", "@SUM(A1)", "\t=1", "\r=1"]) {
    const cell = csvCell(evil);
    assert.ok(cell.startsWith(`"'`), `${JSON.stringify(evil)} -> ${cell}`);
  }
  // leading characters that are harmless are left alone
  assert.equal(csvCell("Mozilla/5.0 (=x)"), '"Mozilla/5.0 (=x)"');
});

test("toCsv joins rows with CRLF", () => {
  assert.equal(toCsv([["a", "b"], ["1", "=2"]]), '"a","b"\r\n"1","\'=2"');
});
