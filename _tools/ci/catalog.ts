// Validate the catalog and the blog and publish them to R2 for the link Worker.
//
//   node _tools/ci/catalog.ts validate [--repo DIR] [--commit REF]
//   node _tools/ci/catalog.ts publish  [--repo DIR] [--commit REF] [--out DIR]
//   node _tools/ci/catalog.ts backfill [--repo DIR] [--commit REF] [--out DIR]
//
// validate  checks every blueprint folder and blog post; exits 1 listing the problems.
// publish   uploads the strings the live index.json lacks, then index.json.
//           If the live index cannot be read, every string is uploaded.
//           Then the blog: the post files blog/index.json does not list
//           yet (or with other content), every post's index.md, then
//           blog/index.json (see build-blog.ts).
// backfill  uploads every string of every current version, then index.json;
//           and every published post's files, then blog/index.json.
//
// The index is built from the commit's files and each blueprint's
// versions.json, never from the git history, so only current versions'
// strings can be made: an older version's were uploaded while it was
// current. Drafts (the note's status) are validated but not published; one
// that was published before keeps its live entry.
// A published blueprint whose content is not a recorded version (changed
// without a new `version`, or not recorded yet) is held: it keeps its live
// entry, marked stale, and is listed in the log and step summary, but does
// not fail the run.
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

import type { BlogIndex } from "./blog-index.ts";
import { BLOG_INDEX_KEY, type BlogObject, blogObjects, buildBlog, carryOverPosts } from "./build-blog.ts";
import { buildCatalog, carryOver, type LiveIndex, produceStrings, selectStrings, type Problem } from "./build-catalog.ts";

const BUCKET = "factorio-blueprints-catalog";
const INDEX_KEY = "index.json";
const STRING_TYPE = "text/plain; charset=utf-8";
const INDEX_TYPE = "application/json; charset=utf-8";
const CONCURRENCY = 8;
const ATTEMPTS = 3;

const run = promisify(execFile);
const wrangler =
  process.env["WRANGLER"] ?? fileURLToPath(new URL("../link-worker/node_modules/.bin/wrangler", import.meta.url));
const wranglerEnv = { ...process.env, WRANGLER_SEND_METRICS: "false" };

type Mode = "validate" | "publish" | "backfill";

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
  const opts = values.commit ? { commit: values.commit } : {};
  // The blog is published after the blueprints, whatever their outcome; the
  // run fails if either had problems.
  const blueprints = await publishBlueprints(mode, repo, opts, values.out);
  const blog = await publishBlog(mode, repo, opts, values.out);
  return Math.max(blueprints, blog);
}

async function publishBlueprints(mode: Mode, repo: string, opts: { commit?: string }, out: string | undefined): Promise<number> {
  const started = performance.now();
  const catalog = await buildCatalog(repo, opts);
  const { index, problems } = catalog;
  reportProblems(catalog.problems, mode);
  reportHeld(catalog.held, catalog.renames);
  const versions = index.blueprints.reduce((n, e) => n + e.history.length, 0);
  console.log(`${index.blueprints.length} blueprints in the index, ${versions} versions (commit ${index.commit})`);
  if (mode === "validate") {
    if (catalog.drafts.length > 0) console.log(`${catalog.drafts.length} draft(s), not published`);
    return problems.length > 0 ? 1 : 0;
  }

  // Publishing goes ahead without the invalid blueprints, and fails the run
  // only once the valid ones are live.
  const live = await readPublished(out);
  const jobs = selectStrings(index, mode === "publish" ? live : undefined);
  console.log(`${jobs.length} version(s) need strings${mode === "publish" && live ? ` (diffed against the live schema ${live.schema} index)` : ""}`);
  const { stale, frozen } = carryOver(catalog, live);
  if (stale.length > 0) console.log(`kept the last published entry of ${stale.length} invalid or held blueprint(s): ${stale.join(", ")}`);
  if (catalog.drafts.length > 0) {
    const kept = frozen.length > 0 ? `, ${frozen.length} serving their last published version (${frozen.join(", ")})` : "";
    console.log(`${catalog.drafts.length} draft(s): ${catalog.drafts.length - frozen.length} not published${kept}`);
  }
  const failed = problems.length > 0 ? 1 : 0;
  if (failed) console.error(`${catalog.invalid.length} invalid blueprint(s) were not updated; see the problems above.`);

  const staging = out ?? mkdtempSync(join(tmpdir(), "catalog-"));
  mkdirSync(staging, { recursive: true });
  const files: { key: string; file: string }[] = [];
  let bytes = 0;
  const { warnings, roots, entries } = await produceStrings(repo, catalog, jobs, (key, text) => {
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
    `${files.length} string(s) (${roots} root, ${entries} entry), ${bytes} bytes; index.json ${Buffer.byteLength(indexText)} bytes; ` +
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
function reportProblems(problems: Problem[], mode: string, noun = "blueprint"): void {
  if (problems.length === 0) return;
  const folders = new Set(problems.map((p) => p.folder)).size;
  console.error(`${problems.length} problem(s) in ${folders} ${noun}(s):`);
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
        : `\nThe other ${noun}s were published. These keep serving their last published version, if they had one.\n`;
    appendFileSync(
      summary,
      `### ${folders} invalid ${noun}(s)\n${note}\n| File | Problem |\n| --- | --- |\n` +
        problems.map((p) => `| \`${cell(p.path)}\` | ${cell(p.message)} |`).join("\n") +
        "\n",
    );
  }
}

/**
 * List the held blueprints (content that is not a recorded version) in the
 * log, as warnings and in the step summary, and the version renames the
 * ledgers do not record yet in the log. Neither fails the run.
 */
function reportHeld(held: Problem[], renames: Problem[]): void {
  for (const [list, what] of [
    [held, "with a change that is not published (the last recorded version stays live)"],
    [renames, "with a version rename that is not recorded yet"],
  ] as const) {
    if (list.length === 0) continue;
    console.warn(`${list.length} blueprint(s) ${what}:`);
    for (const h of list) {
      console.warn(`  ${h.folder}: ${h.message}`);
      if (process.env["GITHUB_ACTIONS"]) console.log(`::warning file=${h.path}::${h.message}`);
    }
  }
  const summary = process.env["GITHUB_STEP_SUMMARY"];
  if (summary && held.length > 0) {
    const cell = (t: string) => t.replace(/\|/g, "\\|").replace(/\n/g, " ");
    appendFileSync(
      summary,
      `### ${held.length} blueprint(s) with an unpublished change\n\nThe last recorded version stays live. Bump \`version\` in the note and publish with the plugin.\n\n| Blueprint | Why |\n| --- | --- |\n` +
        held.map((h) => `| \`${cell(h.folder)}\` | ${cell(h.message)} |`).join("\n") +
        "\n",
    );
  }
}

/** The live index, or undefined (with a warning) if it cannot be read. */
async function readPublished(out: string | undefined): Promise<LiveIndex | undefined> {
  let text: string;
  try {
    text = await readObject(out, INDEX_KEY);
    // Schema 1 is read too: it has root strings only, so entry strings are all produced.
    const parsed = JSON.parse(text) as LiveIndex;
    if ([1, 2, 3].includes(parsed.schema) && Array.isArray(parsed.blueprints)) return parsed;
    console.warn("warning: the live index has another schema; nothing to diff against or carry over");
  } catch (e) {
    console.warn(`warning: no live index readable (${firstLine(e)}); nothing to diff against or carry over`);
  }
  return undefined;
}

/**
 * The blog: validate every post under blog/ and, publishing, upload the
 * published posts' new or changed files, each post's index.md, then
 * blog/index.json (see build-blog.ts). Invalid posts are listed and left
 * out (one already live keeps its last entry); the run then exits 1, after
 * the valid ones are live. A failed upload leaves blog/index.json as it was.
 */
async function publishBlog(mode: Mode, repo: string, opts: { commit?: string }, out: string | undefined): Promise<number> {
  const started = performance.now();
  const blog = buildBlog(repo, opts);
  reportProblems(blog.problems, mode, "blog post");
  const failed = blog.problems.length > 0 ? 1 : 0;
  const drafts = blog.drafts.length > 0 ? `, ${blog.drafts.length} draft(s) not published` : "";
  console.log(`${blog.index.posts.length} blog post(s) in the blog index${drafts}`);
  if (mode === "validate") return failed;

  const live = await readLiveBlog(out);
  const kept = carryOverPosts(blog, live);
  if (kept.length > 0) console.log(`kept the last published entry of ${kept.length} invalid post(s): ${kept.join(", ")}`);
  if (failed) console.error(`${blog.invalid.length} invalid blog post(s) were not updated; see the problems above.`);
  const objects = blogObjects(blog, mode === "publish" ? live : undefined);
  const bytes = objects.reduce((n, o) => n + Buffer.byteLength(o.body), 0);
  console.log(`${objects.length} blog object(s), ${bytes} bytes`);

  const staging = out ?? mkdtempSync(join(tmpdir(), "blog-"));
  try {
    const write = (o: BlogObject) => {
      const file = join(staging, o.key);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, o.body);
      return file;
    };
    if (out) {
      for (const o of objects) write(o);
      console.log(`wrote the blog to ${out}`);
      return failed;
    }
    const last = objects.pop()!; // blog/index.json, once everything it names is there
    await pool(objects, (o) => put(o.key, write(o), o.contentType));
    await put(last.key, write(last), last.contentType);
    console.log(`uploaded ${objects.length + 1} blog object(s) in ${((performance.now() - started) / 1000).toFixed(1)} s`);
    return failed;
  } finally {
    if (!out) rmSync(staging, { recursive: true, force: true });
  }
}

/** The live blog index, or undefined (with a warning) if there is none or it cannot be read. */
async function readLiveBlog(out: string | undefined): Promise<BlogIndex | undefined> {
  try {
    const parsed = JSON.parse(await readObject(out, BLOG_INDEX_KEY)) as BlogIndex;
    if (parsed.schema === 1 && Array.isArray(parsed.posts)) return parsed;
    console.warn("warning: the live blog index has another schema; every file is uploaded and nothing is carried over");
  } catch (e) {
    console.warn(`warning: no live blog index readable (${firstLine(e)}); every file is uploaded and nothing is carried over`);
  }
  return undefined;
}

/** An object's text: from the --out folder in a dry run, else from R2. */
async function readObject(out: string | undefined, key: string): Promise<string> {
  if (out) return readFileSync(join(out, key), "utf8");
  const dir = mkdtempSync(join(tmpdir(), "catalog-live-"));
  try {
    const file = join(dir, "object");
    await run(wrangler, ["r2", "object", "get", `${BUCKET}/${key}`, "--file", file], { cwd: dir, env: wranglerEnv });
    return readFileSync(file, "utf8");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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
