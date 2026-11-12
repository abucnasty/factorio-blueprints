// Validate the catalog and publish it to R2 for the link Worker.
//
//   node _tools/ci/catalog.ts validate [--repo DIR] [--commit REF]
//   node _tools/ci/catalog.ts publish  [--repo DIR] [--commit REF] [--out DIR]
//   node _tools/ci/catalog.ts backfill [--repo DIR] [--commit REF] [--out DIR]
//
// validate  checks every blueprint folder; exits 1 listing the problems.
// publish   uploads the strings the live index.json lacks, then index.json.
//           If the live index cannot be read, every string is uploaded.
// backfill  uploads every string of every version, then index.json.
//
// Publishing never waits for the whole catalog to be valid: invalid
// blueprints are listed and left out, except that one already in the live
// index keeps its last published entry, marked stale. The run then exits 1
// so the problems are seen, but only after the valid ones are live.
// --out DIR writes the R2 objects under DIR instead of uploading (a dry
//           run; publish then diffs against DIR/index.json).
//
// Uploads use wrangler (CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID from
// the environment): $WRANGLER, or the one installed in _tools/link-worker.
// Strings go first and index.json last, so the live index never names a
// string that is not there. Every put is an idempotent overwrite, so a
// failed run can simply be run again.

import { execFile } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";

import { buildCatalog, carryOverStale, produceStrings, selectStrings, type Problem } from "./build-catalog.ts";
import type { CatalogIndex } from "./catalog-index.ts";

const BUCKET = "factorio-blueprints-catalog";
const INDEX_KEY = "index.json";
const STRING_TYPE = "text/plain; charset=utf-8";
const INDEX_TYPE = "application/json; charset=utf-8";
const CONCURRENCY = 4;
const ATTEMPTS = 3;

const run = promisify(execFile);
const wrangler =
  process.env["WRANGLER"] ?? fileURLToPath(new URL("../link-worker/node_modules/.bin/wrangler", import.meta.url));
const wranglerEnv = { ...process.env, WRANGLER_SEND_METRICS: "false" };

async function main(): Promise<number> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { repo: { type: "string" }, commit: { type: "string" }, out: { type: "string" } },
  });
  const mode = positionals[0];
  if (mode !== "validate" && mode !== "publish" && mode !== "backfill") {
    console.error("usage: catalog.ts validate|publish|backfill [--repo DIR] [--commit REF] [--out DIR]");
    return 2;
  }
  const repo = values.repo ?? process.cwd();
  const out = values.out;
  const started = performance.now();

  const catalog = buildCatalog(repo, values.commit ? { commit: values.commit } : {});
  const { index, problems } = catalog;
  reportProblems(catalog.problems, mode);
  const versions = index.blueprints.reduce((n, e) => n + e.history.length, 0);
  console.log(`${index.blueprints.length} valid blueprints, ${versions} versions (commit ${index.commit})`);
  if (mode === "validate") return problems.length > 0 ? 1 : 0;

  // Publishing goes ahead without the invalid blueprints, and fails the run
  // only once the valid ones are live.
  const live = await readPublished(out);
  const jobs = selectStrings(index, mode === "publish" ? live : undefined);
  console.log(`${jobs.length} string(s) to produce${mode === "publish" && live ? " (diffed against the live index)" : ""}`);
  const stale = carryOverStale(catalog, live);
  if (stale.length > 0) console.log(`kept the last published entry of ${stale.length} invalid blueprint(s): ${stale.join(", ")}`);
  const failed = problems.length > 0 ? 1 : 0;
  if (failed) console.error(`${catalog.invalid.length} invalid blueprint(s) were not updated; see the problems above.`);

  const staging = out ?? mkdtempSync(join(tmpdir(), "catalog-"));
  const files: { key: string; file: string }[] = [];
  let bytes = 0;
  const { warnings } = produceStrings(repo, catalog, jobs, (key, text) => {
    const file = join(staging, key);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
    files.push({ key, file });
    bytes += Buffer.byteLength(text);
  });
  for (const w of warnings) {
    console.warn(`warning: ${w}`);
    if (process.env["GITHUB_ACTIONS"]) console.log(`::warning::${w}`);
  }
  const indexText = JSON.stringify(index);
  const indexFile = join(staging, INDEX_KEY);
  console.log(
    `${files.length} string(s), ${bytes} bytes; index.json ${Buffer.byteLength(indexText)} bytes; ` +
      `built in ${((performance.now() - started) / 1000).toFixed(1)} s`,
  );

  try {
    if (out) {
      writeFileSync(indexFile, indexText);
      console.log(`wrote to ${out}`);
      return failed;
    }
    await pool(files, (f) => put(f.key, f.file, STRING_TYPE));
    writeFileSync(indexFile, indexText);
    await put(INDEX_KEY, indexFile, INDEX_TYPE);
    console.log(`uploaded ${files.length} string(s) and index.json in ${((performance.now() - started) / 1000).toFixed(1)} s`);
    return failed;
  } finally {
    if (!out) rmSync(staging, { recursive: true, force: true });
  }
}

/** List problems in the log, as annotations and in the step summary. */
function reportProblems(problems: Problem[], mode: string): void {
  if (problems.length === 0) return;
  const folders = new Set(problems.map((p) => p.folder)).size;
  console.error(`${problems.length} problem(s) in ${folders} blueprint(s):`);
  for (const p of problems) {
    console.error(`  ${p.path}: ${p.message}`);
    if (process.env["GITHUB_ACTIONS"]) console.log(`::error file=${p.path}::${p.message}`);
  }
  const summary = process.env["GITHUB_STEP_SUMMARY"];
  if (summary) {
    const cell = (t: string) => t.replace(/\|/g, "\\|").replace(/\n/g, " ");
    const note =
      mode === "validate"
        ? ""
        : "\nThe other blueprints were published. These keep serving their last published version, if they had one.\n";
    appendFileSync(
      summary,
      `### ${folders} invalid blueprint(s)\n${note}\n| File | Problem |\n| --- | --- |\n` +
        problems.map((p) => `| \`${cell(p.path)}\` | ${cell(p.message)} |`).join("\n") +
        "\n",
    );
  }
}

/** The live index, or undefined (with a warning) if it cannot be read. */
async function readPublished(out: string | undefined): Promise<CatalogIndex | undefined> {
  let text: string;
  try {
    if (out) {
      text = readFileSync(join(out, INDEX_KEY), "utf8");
    } else {
      const dir = mkdtempSync(join(tmpdir(), "catalog-live-"));
      try {
        const file = join(dir, INDEX_KEY);
        await run(wrangler, ["r2", "object", "get", `${BUCKET}/${INDEX_KEY}`, "--file", file], { cwd: dir, env: wranglerEnv });
        text = readFileSync(file, "utf8");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
    const parsed = JSON.parse(text) as CatalogIndex;
    if (parsed.schema === 1 && Array.isArray(parsed.blueprints)) return parsed;
    console.warn("warning: the live index has another schema; nothing to diff against or carry over");
  } catch (e) {
    console.warn(`warning: no live index readable (${firstLine(e)}); nothing to diff against or carry over`);
  }
  return undefined;
}

/** wrangler r2 object put (remote is the default in wrangler 3), retried. */
async function put(key: string, file: string, contentType: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      // Run outside the repo so no wrangler.toml is picked up.
      await run(wrangler, ["r2", "object", "put", `${BUCKET}/${key}`, "--file", file, "--content-type", contentType], {
        cwd: tmpdir(),
        env: wranglerEnv,
      });
      console.log(`  put ${key}`);
      return;
    } catch (e) {
      if (attempt >= ATTEMPTS) throw new Error(`put ${key} failed ${ATTEMPTS} times: ${firstLine(e)}`);
      console.warn(`  put ${key} failed (attempt ${attempt}), retrying: ${firstLine(e)}`);
      await new Promise((r) => setTimeout(r, attempt * 3000));
    }
  }
}

/** Run `fn` over the items, CONCURRENCY at a time; rejects after all settle if any failed. */
async function pool<T>(items: T[], fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const errors: unknown[] = [];
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++]!;
      await fn(item).catch((e) => errors.push(e));
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  if (errors.length > 0) {
    throw new Error(`${errors.length} upload(s) failed; index.json was not updated:\n${errors.map(firstLine).join("\n")}`);
  }
}

function firstLine(e: unknown): string {
  const err = e as { stderr?: string; message?: string };
  const text = (err.stderr && String(err.stderr).trim()) || err.message || String(e);
  const lines = text.split("\n").filter((l) => l.trim() !== "");
  return (lines.find((l) => l.includes("ERROR")) ?? lines.at(-1) ?? text).trim();
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
