// The gate for the import and copy step: every catalog string decodes and
// re-encodes to identical JSON, and the canonical file is lossless and
// byte-stable. Needs the corpus: npm run corpus:fetch -- --benchmarks <dir>

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";

import {
  decodeBlueprintString,
  describeBlueprint,
  encodeBlueprintString,
  findLossyNumbers,
  isCanonicalJson,
  jsonNumberLiterals,
  normalizeDecimal,
  readCanonicalJson,
  summarizeBlueprint,
  writeCanonicalJson,
} from "../../src/core/index.ts";

const cache = join(import.meta.dirname, "..", "..", ".corpus");
const manifestPath = join(cache, "manifest.json");
if (!existsSync(manifestPath)) {
  throw new Error("No corpus. Run: npm run corpus:fetch -- --benchmarks <factorio-benchmarks checkout>");
}
const { entries } = JSON.parse(readFileSync(manifestPath, "utf8")) as {
  entries: { id: string; source: string }[];
};

interface Row {
  id: string;
  stringBytes: number;
  jsonBytes: number;
  canonicalBytes: number;
  canonicalLines: number;
  reencodedBytes: number;
  numbers: number;
  respelled: number;
  ms: { decode: number; encode: number; write: number; check: number };
  kind: string;
  summary: string;
}
const rows: Row[] = [];

for (const { id, source } of entries) {
  test(`${id} — ${source}`, () => {
    const s = readFileSync(join(cache, `${id}.txt`), "utf8").trim();

    let t = performance.now();
    const { value, json } = decodeBlueprintString(s);
    const description = describeBlueprint(value);
    const decodeMs = performance.now() - t;

    t = performance.now();
    const reencoded = encodeBlueprintString(value);
    const encodeMs = performance.now() - t;
    assert.deepStrictEqual(decodeBlueprintString(reencoded).value, value, "encode(decode(s)) decodes to the same value");

    t = performance.now();
    const canonical = writeCanonicalJson(value);
    const writeMs = performance.now() - t;

    t = performance.now();
    const reread = readCanonicalJson(canonical);
    assert.deepStrictEqual(reread, value, "canonical write then read gives the same value");
    assert.equal(writeCanonicalJson(reread), canonical, "canonical write is byte-stable");
    assert.ok(isCanonicalJson(canonical));
    assert.ok(!canonical.includes("\r") && canonical.endsWith("}\n") && !canonical.endsWith("\n\n"));

    // No number may change: every literal in the original text parses to
    // exactly its written value, and the canonical file holds the same
    // numbers (as a multiset; key sorting reorders them).
    assert.deepStrictEqual(findLossyNumbers(json), [], "numbers lost precision when parsed");
    const originalLiterals = jsonNumberLiterals(json);
    const byValue = (lits: string[]) => lits.map(Number).sort((a, b) => a - b);
    assert.deepStrictEqual(byValue(jsonNumberLiterals(canonical)), byValue(originalLiterals), "canonical file holds the same numbers");
    const respelled = originalLiterals.filter((l) => normalizeDecimal(l) !== normalizeDecimal(String(Number(l)))).length;
    const checkMs = performance.now() - t;

    rows.push({
      id,
      stringBytes: s.length,
      jsonBytes: new TextEncoder().encode(json).length,
      canonicalBytes: new TextEncoder().encode(canonical).length,
      canonicalLines: canonical.split("\n").length - 1,
      reencodedBytes: reencoded.length,
      numbers: originalLiterals.length,
      respelled,
      ms: { decode: decodeMs, encode: encodeMs, write: writeMs, check: checkMs },
      kind: description.kind,
      summary: summarizeBlueprint(description) + (description.factorioVersion ? `, Factorio ${description.factorioVersion}` : ""),
    });
  });
}

after(() => {
  if (rows.length === 0) return;
  const sum = (f: (r: Row) => number) => rows.reduce((a, r) => a + f(r), 0);
  const max = (f: (r: Row) => number) => rows.reduce((a, r) => (f(r) > f(a) ? r : a));
  const big = max((r) => r.canonicalBytes);
  const long = max((r) => r.canonicalLines);
  const slow = max((r) => r.ms.decode + r.ms.encode + r.ms.write);
  const kinds = new Map<string, number>();
  for (const r of rows) {
    kinds.set(r.kind, (kinds.get(r.kind) ?? 0) + 1);
  }
  const versions = new Map<string, number>();
  for (const r of rows) {
    const v = /Factorio (\S+)$/.exec(r.summary)?.[1] ?? "none";
    versions.set(v, (versions.get(v) ?? 0) + 1);
  }
  const kb = (n: number) => `${(n / 1024).toFixed(1)} KiB`;
  console.log(
    [
      "",
      `corpus: ${rows.length}/${entries.length} strings passed`,
      `kinds: ${[...kinds].map(([k, n]) => `${n} ${k}`).join(", ")}`,
      `factorio versions: ${[...versions].sort().map(([k, n]) => `${k} x${n}`).join(", ")}`,
      `strings: ${kb(sum((r) => r.stringBytes))} total; decoded JSON ${kb(sum((r) => r.jsonBytes))}; canonical files ${kb(sum((r) => r.canonicalBytes))}`,
      `numbers: ${sum((r) => r.numbers)} literals, none changed value; ${sum((r) => r.respelled)} in ${rows.filter((r) => r.respelled > 0).length} strings written in a shorter form for the same double`,
      `canonical / compact JSON size: ${(sum((r) => r.canonicalBytes) / sum((r) => r.jsonBytes)).toFixed(2)}x`,
      `re-encoded / original string size: ${(sum((r) => r.reencodedBytes) / sum((r) => r.stringBytes)).toFixed(3)}x`,
      `largest canonical file: ${big.id}: ${big.canonicalBytes} bytes, ${big.canonicalLines} lines (string ${big.stringBytes} bytes)`,
      `most lines: ${long.id}: ${long.canonicalLines} lines`,
      `time: decode ${sum((r) => r.ms.decode).toFixed(0)} ms, encode ${sum((r) => r.ms.encode).toFixed(0)} ms, canonical write ${sum((r) => r.ms.write).toFixed(0)} ms, checks ${sum((r) => r.ms.check).toFixed(0)} ms`,
      `slowest: ${slow.id}: decode ${slow.ms.decode.toFixed(0)} ms, encode ${slow.ms.encode.toFixed(0)} ms, write ${slow.ms.write.toFixed(0)} ms`,
    ].join("\n"),
  );
});
