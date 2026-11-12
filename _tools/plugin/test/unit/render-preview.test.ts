// The render command against a stand-in for _tools/render/bin/render.js,
// in a real vault folder with a real git repo and a local bare remote.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, beforeEach, describe, test } from "node:test";

import type { GitSync } from "../../src/commands/host.ts";
import { cancelRender, renderPreview, resetRenderToolCache } from "../../src/commands/render-preview.ts";
import { folderRenderState, foldersNeedingRender, renderAllNeeded } from "../../src/commands/render-status.ts";
import { importFromClipboard } from "../../src/commands/import-blueprint.ts";
import { commitAndSync } from "../../src/git/commit-and-sync.ts";
import { createGitRunner, nodePathExists } from "../../src/git/node-runner.ts";
import { decodeBlueprintString, parseRenderManifest, renderTargets, writeCanonicalJson } from "../../src/core/index.ts";
import { fakeHost, fixture } from "./helpers.ts";
import type { FakeOptions } from "./helpers.ts";

process.env["GIT_CONFIG_GLOBAL"] = "/dev/null";
process.env["GIT_CONFIG_NOSYSTEM"] = "1";

const root = mkdtempSync(join(tmpdir(), "fbp-render-test-"));
after(() => rmSync(root, { recursive: true, force: true }));

const STAND_IN = String.raw`
const fs = require("fs");
const path = require("path");
const argv = process.argv.slice(2);
if (process.env.FAKE_RENDER_LOG) fs.appendFileSync(process.env.FAKE_RENDER_LOG, JSON.stringify(argv) + "\n");
if (argv.includes("--help")) {
  console.log("Usage: render --input <file> --out <dir>" + (process.env.FAKE_RENDER_ONLY ? " [--only <slot>,<slot>]" : ""));
  process.exit(0);
}
const arg = (n) => argv[argv.indexOf(n) + 1];
const out = arg("--out");
const mode = process.env.FAKE_RENDER;
const write = (rel) => { const f = path.join(out, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, "jpeg " + rel); return f; };
const report = (images, without = []) => console.log(JSON.stringify({ images, without_image: without, skipped: [], removed: [] }));
process.stderr.write("Starting Factorio\n");
const only = argv.includes("--only") ? arg("--only").split(",") : undefined;
const want = (p) => !only || only.includes(p);
switch (mode) {
  case "report-single":
    report([{ number: 0, path: "", label: "Wired lamps", output: write("0.jpg"), width: 10, height: 20, failed: [], missing: [] }]);
    break;
  case "report-book": {
    const images = [];
    if (want("0")) images.push({ number: 0, path: "0", label: "Concrete pad", output: write("0.jpg"), width: 1, height: 1 });
    if (want("1/0")) images.push({ number: 1, path: "1/0", label: "Wired lamps", output: write("1/0.jpg"), width: 1, height: 1, missing: ["foo"] });
    report(images);
    break;
  }
  case "noreport":
    write("0.jpg");
    break;
  case "old-naming":
    report([{ number: 0, path: "0", label: "Concrete pad", width: 1, height: 1 }, { number: 1, path: "1/0", label: "Wired lamps", width: 1, height: 1 }].map((i) => (write(i.number + ".jpg"), i)));
    break;
  case "partial":
    report([{ number: 0, path: "0", label: "Concrete pad", output: write("0.jpg") }], [{ number: 1, path: "1/0", label: "Wired lamps", reason: "nothing of it could be built" }]);
    process.exit(2);
  case "writes-manifest":
    write("0.jpg");
    fs.writeFileSync(path.join(out, "render.json"), JSON.stringify({ schema: 1, rendered_at: "tool", entries: { "0": { file: "0.jpg", sha256: "from-tool" } } }));
    report([{ number: 0, path: "", output: path.join(out, "0.jpg") }]);
    break;
  case "nothing":
    report([], [{ number: 0, path: "", reason: "empty" }]);
    process.exit(2);
  case "fail":
    process.stderr.write("render: Factorio did not start within 300 s\n");
    process.exit(1);
  case "slow":
    process.on("SIGINT", () => { process.stderr.write("Received SIGINT: stopping Factorio\n"); process.exit(130); });
    setTimeout(() => process.exit(0), 20000);
    break;
}
`;

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

let n = 0;
let vault: string;
let remote: string;
let log: string;
const BOOK_DIR = "cat/book";
const SINGLE_DIR = "cat/lamps";

beforeEach(() => {
  n++;
  vault = join(root, `vault-${n}`);
  remote = join(root, `remote-${n}.git`);
  log = join(root, `args-${n}.log`);
  git(root, "init", "-q", "--bare", "-b", "main", remote);
  git(root, "clone", "-q", remote, vault);
  for (const [k, v] of [["user.name", "T"], ["user.email", "t@example.com"], ["commit.gpgsign", "false"]]) git(vault, "config", k!, v!);
  const put = (p: string, text: string) => {
    mkdirSync(join(vault, p, ".."), { recursive: true });
    writeFileSync(join(vault, p), text);
  };
  put("_tools/render/bin/render.js", STAND_IN);
  put("_tools/render/package.json", '{"type":"commonjs"}\n');
  mkdirSync(join(vault, "_tools/render/node_modules"), { recursive: true });
  put(`${BOOK_DIR}/blueprint.json`, writeCanonicalJson(decodeBlueprintString(fixture("book-nested.txt")).value));
  put(`${BOOK_DIR}/README.md`, '---\ntitle: The Book\nversion: "3"\n---\n\nMine.\n');
  put(`${SINGLE_DIR}/blueprint.json`, writeCanonicalJson(decodeBlueprintString(fixture("wires-2.0.txt")).value));
  put(`${SINGLE_DIR}/README.md`, "---\ntitle: Lamps\n---\n");
  git(vault, "add", "-A");
  git(vault, "commit", "-qm", "initial");
  git(vault, "push", "-q", "-u", "origin", "main");
  process.env["FAKE_RENDER_LOG"] = log;
  delete process.env["FAKE_RENDER_ONLY"];
  resetRenderToolCache();
});

function realGit(dir: string, lfs = true): GitSync {
  return {
    lfsAvailable: async () => lfs,
    commitAndSync: (folder, message) =>
      commitAndSync({ run: createGitRunner("git", dir), pathExists: nodePathExists(dir), folder, message }),
  };
}

function host(mode: string, opts: FakeOptions = {}) {
  process.env["FAKE_RENDER"] = mode;
  return fakeHost({
    disk: vault,
    git: realGit(vault, opts.lfs ?? true),
    ...opts,
    settings: { ...opts.settings, render: { factorioPath: "/games/factorio", extraArgs: ["--show-window"], ...opts.settings?.render } },
  });
}

const read = (p: string) => readFileSync(join(vault, p), "utf8");
const lastArgs = () => JSON.parse(readFileSync(log, "utf8").trim().split("\n").at(-1)!) as string[];
const remoteLog = () => git(remote, "log", "--format=%s", "main").trim().split("\n");

describe("render preview", () => {
  test("single blueprint with a report: images, manifest, block, commit", async () => {
    const h = host("report-single");
    const out = await renderPreview(h, SINGLE_DIR);
    assert.equal(out.action, "rendered");
    assert.deepStrictEqual(out.action === "rendered" && out.images, ["0.jpg"]);
    assert.deepStrictEqual(lastArgs(), [
      "--factorio",
      "/games/factorio",
      "--input",
      `${vault}/${SINGLE_DIR}/blueprint.json`,
      "--out",
      `${vault}/${SINGLE_DIR}/renders`,
      "--json",
      "--show-window",
    ]);
    const manifest = parseRenderManifest(read(`${SINGLE_DIR}/renders/render.json`))!;
    const target = renderTargets(JSON.parse(read(`${SINGLE_DIR}/blueprint.json`)))[0]!;
    assert.deepStrictEqual(manifest.entries, { "0": { file: "0.jpg", sha256: target.hash, width: 10, height: 20 } });
    assert.ok(read(`${SINGLE_DIR}/README.md`).includes(`![Lamps](https://blueprints.abucnasty.dev/${SINGLE_DIR}/cover.jpg)`));
    assert.deepStrictEqual(remoteLog(), ["render Lamps", "initial"]);
    assert.match(h.notices.at(-1)!.message, /^Rendered 1 image for cat\/lamps, committed and pushed/);
    assert.ok(h.progress.includes(`Rendering ${SINGLE_DIR}: Starting Factorio`));
    assert.equal(h.progress.at(-1), "(closed)");
    assert.equal((await folderRenderState(h, SINGLE_DIR)).overall, "current");
  });

  test("book with a report: nested files, version in the message, problems listed", async () => {
    const h = host("report-book");
    const out = await renderPreview(h, `${BOOK_DIR}/renders`);
    assert.deepStrictEqual(out.action === "rendered" && out.images, ["0.jpg", "1/0.jpg"]);
    assert.deepStrictEqual(Object.keys(parseRenderManifest(read(`${BOOK_DIR}/renders/render.json`))!.entries).sort(), ["0", "1/0"]);
    assert.deepStrictEqual(remoteLog(), ["render The Book 3", "initial"]);
    assert.match(h.notices.at(-1)!.message, /1 problem: slot 1\/0 "Wired lamps": 1 entity not built/);
    assert.ok(read(`${BOOK_DIR}/README.md`).includes("cover.jpg)\n\n- [Concrete pad]"));
  });

  test("success without a report: files found by scanning renders/", async () => {
    const h = host("noreport");
    const out = await renderPreview(h, SINGLE_DIR);
    assert.deepStrictEqual(out.action === "rendered" && out.images, ["0.jpg"]);
    assert.deepStrictEqual(Object.keys(parseRenderManifest(read(`${SINGLE_DIR}/renders/render.json`))!.entries), ["0"]);
  });

  test("an older tool's numbered images: the plugin writes the manifest from the report", async () => {
    const h = host("old-naming");
    await renderPreview(h, BOOK_DIR);
    const m = parseRenderManifest(read(`${BOOK_DIR}/renders/render.json`))!;
    assert.deepStrictEqual(Object.fromEntries(Object.entries(m.entries).map(([k, e]) => [k, e.file])), { "0": "0.jpg", "1/0": "1.jpg" });
    const state = await folderRenderState(h, BOOK_DIR);
    assert.equal(state.overall, "current");
  });

  test("a manifest the tool wrote is left alone", async () => {
    const h = host("writes-manifest");
    await renderPreview(h, SINGLE_DIR);
    assert.equal(parseRenderManifest(read(`${SINGLE_DIR}/renders/render.json`))!.entries["0"]!.sha256, "from-tool");
  });

  test("partial failure (exit 2): commits what was made and lists what is missing", async () => {
    const h = host("partial");
    const out = await renderPreview(h, BOOK_DIR);
    assert.equal(out.action, "rendered");
    assert.match(h.notices.at(-1)!.message, /slot 1\/0 "Wired lamps": no image \(nothing of it could be built\)/);
    assert.equal(h.notices.at(-1)!.kind, "error");
    assert.deepStrictEqual(remoteLog(), ["render The Book 3", "initial"]);
    const state = await folderRenderState(h, BOOK_DIR);
    assert.deepStrictEqual(state.entries.map((e) => e.state), ["current", "none"]);
  });

  test("no image at all: nothing committed", async () => {
    const h = host("nothing");
    await renderPreview(h, SINGLE_DIR);
    assert.match(h.notices.at(-1)!.message, /Rendered 0 images .*Nothing to commit/);
    assert.deepStrictEqual(remoteLog(), ["initial"]);
  });

  test("non-zero exit: the tool's error, nothing committed", async () => {
    const h = host("fail");
    const out = await renderPreview(h, SINGLE_DIR);
    assert.equal(out.action, "failed");
    assert.equal(h.notices.at(-1)!.message, "Render of cat/lamps failed: render: Factorio did not start within 300 s. Nothing was committed.");
    assert.ok(!existsSync(join(vault, SINGLE_DIR, "renders")));
    assert.deepStrictEqual(remoteLog(), ["initial"]);
  });

  test("missing Factorio path: says so and opens the settings", async () => {
    const h = host("report-single", { settings: { render: { factorioPath: " " } } });
    assert.deepStrictEqual(await renderPreview(h, SINGLE_DIR), { action: "needs-settings" });
    assert.equal(h.settingsOpened, 1);
    assert.match(h.notices[0]!.message, /Set the Factorio path/);
    assert.ok(!existsSync(log));
  });

  test("missing node_modules: the exact command to run", async () => {
    rmSync(join(vault, "_tools/render/node_modules"), { recursive: true });
    const h = host("report-single");
    const out = await renderPreview(h, SINGLE_DIR);
    assert.equal(out.action, "rejected");
    assert.equal(
      h.notices[0]!.message,
      `The render tool's dependencies are not installed. In a terminal, run:\ncd "${vault}/_tools/render" && npm ci\nthen render again.`,
    );
  });

  test("Node that cannot start", async () => {
    const h = host("report-single", { settings: { render: { nodePath: join(root, "no-node") } } });
    const out = await renderPreview(h, SINGLE_DIR);
    assert.equal(out.action, "failed");
    assert.match(h.notices[0]!.message, /^Could not start Node\.js .*Set "Node path"/);
  });

  test("outside a blueprint folder", async () => {
    const h = host("report-single");
    assert.equal((await renderPreview(h, "cat")).action, "rejected");
  });

  test("one render at a time, and cancel stops it", async () => {
    const h = host("slow");
    const first = renderPreview(h, SINGLE_DIR);
    await new Promise((r) => setTimeout(r, 300));
    assert.deepStrictEqual(await renderPreview(h, BOOK_DIR), { action: "busy" });
    assert.ok(cancelRender());
    assert.deepStrictEqual(await first, { action: "cancelled" });
    assert.match(h.notices.at(-1)!.message, /cancelled\. Nothing was committed/);
    assert.ok(!cancelRender());
  });

  test("an LFS upload refused at push: reason shown, setup script named, commit kept", async () => {
    const hook = join(vault, ".git", "hooks", "pre-push");
    writeFileSync(hook, "#!/bin/sh\necho 'batch response: Authentication required: LFS upload token missing' >&2\necho 'error: failed to push some refs' >&2\nexit 1\n");
    chmodSync(hook, 0o755);
    const h = host("report-single");
    const out = await renderPreview(h, SINGLE_DIR);
    assert.ok(out.action === "rendered" && out.committed);
    const notice = h.notices.at(-1)!;
    assert.equal(notice.kind, "error");
    assert.match(notice.message, /git push failed: batch response: Authentication required: LFS upload token missing\./);
    assert.match(notice.message, /run _tools\/setup\/setup-machine\.sh on this computer/);
    assert.deepStrictEqual(remoteLog(), ["initial"]);
    assert.equal(git(vault, "log", "-1", "--format=%s"), "render Lamps\n");
  });

  test("without git-lfs the images are not committed", async () => {
    const h = host("report-single", { lfs: false });
    const out = await renderPreview(h, SINGLE_DIR);
    assert.ok(out.action === "rendered" && !out.committed);
    assert.match(h.notices.at(-1)!.message, /git-lfs is not installed/);
    assert.deepStrictEqual(remoteLog(), ["initial"]);
  });
});

describe("render only what needs it", () => {
  test("--only with the outdated entries when the tool supports it", async () => {
    process.env["FAKE_RENDER_ONLY"] = "1";
    await renderPreview(host("report-book"), BOOK_DIR);
    // Change one entry of the book: only that slot is outdated.
    const value = JSON.parse(read(`${BOOK_DIR}/blueprint.json`));
    value.blueprint_book.blueprints[1].blueprint_book.blueprints[0].blueprint.label = "Changed lamps";
    writeFileSync(join(vault, BOOK_DIR, "blueprint.json"), writeCanonicalJson(value));
    const h = host("report-book");
    const before = await folderRenderState(h, BOOK_DIR);
    assert.deepStrictEqual(before.entries.map((e) => e.state), ["current", "outdated"]);
    await renderPreview(h, BOOK_DIR, { onlyNeeded: true });
    const args = lastArgs();
    assert.deepStrictEqual(args.slice(args.indexOf("--only"), args.indexOf("--only") + 2), ["--only", "1/0"]);
    assert.equal((await folderRenderState(h, BOOK_DIR)).overall, "current");
    // Current already: nothing runs.
    const runs = readFileSync(log, "utf8").trim().split("\n").length;
    await renderPreview(h, BOOK_DIR, { onlyNeeded: true });
    assert.equal(readFileSync(log, "utf8").trim().split("\n").length, runs);
    assert.match(h.notices.at(-1)!.message, /already current/);
  });

  test("the whole folder when the tool has no --only", async () => {
    await renderPreview(host("report-book"), BOOK_DIR);
    const value = JSON.parse(read(`${BOOK_DIR}/blueprint.json`));
    value.blueprint_book.blueprints[0].blueprint.label = "Changed pad";
    writeFileSync(join(vault, BOOK_DIR, "blueprint.json"), writeCanonicalJson(value));
    await renderPreview(host("report-book"), BOOK_DIR, { onlyNeeded: true });
    assert.ok(!lastArgs().includes("--only"));
  });

  test("needing-render list and render all", async () => {
    const h = host("report-single");
    assert.deepStrictEqual((await foldersNeedingRender(h)).map((f) => [f.folder, f.state.overall]), [
      [BOOK_DIR, "none"],
      [SINGLE_DIR, "none"],
    ]);
    process.env["FAKE_RENDER"] = "report-book"; // works for both: single reads path "" only from report-single
    await renderAllNeeded(h);
    const summary = h.notices.at(-1)!.message;
    assert.match(summary, /^Render all: 2 of 2 rendered\./);
    assert.ok(h.progress.some((p) => p.startsWith("Rendering 2 of 2: cat/lamps")));
  });

  test("render all reports failures and goes on", async () => {
    const h = host("fail");
    await renderAllNeeded(h);
    const summary = h.notices.at(-1)!.message;
    assert.match(summary, /^Render all: 0 of 2 rendered, 2 failed\./);
    assert.match(summary, /cat\/book: Render of cat\/book failed/);
  });

  test("import notice says when the render is now outdated", async () => {
    await renderPreview(host("report-single"), SINGLE_DIR);
    const h = host("report-single", { clipboard: fixture("non-ascii-label.txt"), settings: { commitAfterImport: false } });
    await importFromClipboard(h, SINGLE_DIR);
    assert.match(h.notices.at(-1)!.message, /its render is now outdated: outdated; run Render preview/);
  });

  test("render after import, when switched on for this computer", async () => {
    const h = host("report-single", { clipboard: fixture("non-ascii-label.txt"), settings: { render: { afterImport: true } } });
    const out = await importFromClipboard(h, "cat");
    assert.equal(out.action, "created");
    assert.deepStrictEqual(remoteLog(), ["render Fußgänger-Brücke — 日本語 🚀 1", "add Fußgänger-Brücke — 日本語 🚀", "initial"]);
    assert.ok(existsSync(join(vault, "cat/fussganger-brucke/renders/0.jpg")));
  });
});
