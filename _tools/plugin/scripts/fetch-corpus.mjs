// Build the round-trip test corpus in .corpus/ (git-ignored; never commit it).
//
//   node scripts/fetch-corpus.mjs --benchmarks /path/to/factorio-benchmarks
//
// Collects every blueprint string from the .txt files under benchmarks/,
// competitions/ and docs/blueprints/ of a factorio-benchmarks checkout (only
// reads text files), and downloads every factoriobin post linked from its
// docs/blueprints/README.md. Downloads are sequential, cached and never
// refetched. Then run `npm run test:corpus`.

import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cache = join(root, ".corpus");
const USER_AGENT = "blueprint-corpus-test/1.0";
const DELAY_MS = 1000;

const args = process.argv.slice(2);
const benchIdx = args.indexOf("--benchmarks");
if (benchIdx === -1 || !args[benchIdx + 1]) {
  console.error("usage: node scripts/fetch-corpus.mjs --benchmarks <factorio-benchmarks checkout>");
  process.exit(2);
}
const bench = args[benchIdx + 1];

mkdirSync(join(cache, "local"), { recursive: true });
mkdirSync(join(cache, "factoriobin"), { recursive: true });

const entries = [];
const report = { filesScanned: 0, filesWithStrings: 0, multiStringFiles: [], skipped: [] };

// 1. Local text files.
for (const top of ["benchmarks", "competitions", "docs/blueprints"]) {
  for (const file of walk(join(bench, top))) {
    if (!file.endsWith(".txt")) continue;
    report.filesScanned++;
    const rel = relative(bench, file);
    const buf = readFileSync(file);
    if ((buf[0] === 0xff && buf[1] === 0xfe) || (buf[0] === 0xfe && buf[1] === 0xff)) {
      report.skipped.push(`${rel}: UTF-16 text, not a blueprint string`);
      continue;
    }
    // Strings are separated by any whitespace: one per line, blank lines between, or wrapped.
    const strings = buf
      .toString("utf8")
      .split(/\s+/)
      .filter((t) => /^0[A-Za-z0-9+/]{20,}={0,2}$/.test(t));
    if (strings.length === 0) {
      report.skipped.push(`${rel}: no blueprint string`);
      continue;
    }
    report.filesWithStrings++;
    if (strings.length > 1) report.multiStringFiles.push(`${rel}: ${strings.length} strings`);
    strings.forEach((s, i) => {
      const id = `local/${rel.replace(/\.txt$/, "").replaceAll("/", "__")}${strings.length > 1 ? `#${i}` : ""}`;
      writeFileSync(join(cache, `${id}.txt`), s + "\n");
      entries.push({ id, source: rel + (strings.length > 1 ? ` (string ${i + 1})` : "") });
    });
  }
}

// 2. factoriobin posts linked from the catalog.
const readme = readFileSync(join(bench, "docs/blueprints/README.md"), "utf8");
const links = [...new Set([...readme.matchAll(/https:\/\/factoriobin\.com\/post\/([a-z0-9]+)(?:\/(\d+))?/g)].map((m) => m[0]))];
let downloads = 0;
for (const link of links) {
  const m = /post\/([a-z0-9]+)(?:\/(\d+))?/.exec(link);
  const key = m[2] ? `${m[1]}-${m[2]}` : m[1];
  const infoPath = join(cache, "factoriobin", `${key}.info.json`);
  const strPath = join(cache, "factoriobin", `${key}.txt`);
  if (!existsSync(infoPath)) {
    await fetchTo(`${link}/info.json`, infoPath);
    downloads++;
  }
  const info = JSON.parse(readFileSync(infoPath, "utf8"));
  const url = info?.node?.blueprintStringUrl;
  if (typeof url !== "string" || !url.startsWith("https://cdn.factoriobin.com/")) {
    report.skipped.push(`${link}: info.json has no cdn.factoriobin.com blueprintStringUrl`);
    continue;
  }
  if (!existsSync(strPath)) {
    await fetchTo(url, strPath);
    downloads++;
  }
  entries.push({ id: `factoriobin/${key}`, source: `${link} (${info.node.name ?? info.post?.title ?? ""})` });
}

writeFileSync(join(cache, "manifest.json"), JSON.stringify({ entries, report }, null, 2) + "\n");
console.log(
  `${entries.length} strings: ${report.filesWithStrings} of ${report.filesScanned} local files, ` +
    `${links.length} factoriobin links (${downloads} downloads this run).`,
);
for (const line of report.multiStringFiles) console.log(`  several strings: ${line}`);
for (const line of report.skipped) console.log(`  skipped: ${line}`);

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile()) yield p;
  }
}

async function fetchTo(url, path) {
  await new Promise((r) => setTimeout(r, DELAY_MS));
  // curl rather than fetch() so a configured HTTPS proxy is honoured.
  const { stdout } = await run("curl", ["-sSfL", "--max-time", "60", "-A", USER_AGENT, url], {
    maxBuffer: 64 * 1024 * 1024,
    encoding: "buffer",
  });
  writeFileSync(path, stdout);
  console.log(`fetched ${url} (${stdout.length} bytes)`);
}
