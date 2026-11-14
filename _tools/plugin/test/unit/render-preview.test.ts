// The render command against a stand-in for _tools/render/bin/render.js,
// in a real vault folder with a real git repo and a local bare remote.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, beforeEach, describe, test } from "node:test";

import type { GitSync } from "../../src/commands/host.ts";
import { expandBookIntoFolders } from "../../src/commands/expand-book.ts";
import { cancelRender, renderPreview } from "../../src/commands/render-preview.ts";
import { folderRenderState, foldersNeedingRender, renderAllNeeded } from "../../src/commands/render-status.ts";
import { importFromClipboard } from "../../src/commands/import-blueprint.ts";
import { commitAndSync } from "../../src/git/commit-and-sync.ts";
import { createGitRunner, nodePathExists } from "../../src/git/node-runner.ts";
import { decodeBlueprintString, parseRenderManifest, renderTargets, writeCanonicalJson } from "../../src/core/index.ts";

import { fakeHost, fixture } from "./helpers.ts";
import type { FakeOptions } from "./helpers.ts";

process.env["GIT_CONFIG_GLOBAL"] = "/dev/null";
process.env["GIT_CONFIG_NOSYSTEM"] = "1";
process.env["FAKE_RENDER_CORE"] = join(import.meta.dirname, "..", "..", "src", "core", "index.ts");

const root = mkdtempSync(join(tmpdir(), "fbp-render-test-"));
after(() => rmSync(root, { recursive: true, force: true }));

// A stand-in for the render tool with its real contract: the --json report
// shape of _tools/render/src/render.js and a render.json it writes (and
// merges on --only) itself, hashed with the core's blueprintHash.
const STAND_IN = String.raw`
const fs = require("fs");
const path = require("path");
(async () => {
  const { renderTargets } = await import(process.env.FAKE_RENDER_CORE);
  const argv = process.argv.slice(2);
  if (process.env.FAKE_RENDER_LOG) fs.appendFileSync(process.env.FAKE_RENDER_LOG, JSON.stringify(argv) + "\n");
  const arg = (n) => argv[argv.indexOf(n) + 1];
  const out = arg("--out");
  const mode = process.env.FAKE_RENDER;
  const only = argv.includes("--only") ? arg("--only").split(",") : null;
  process.stderr.write("Starting Factorio\n");
  if (mode === "fail") {
    process.stderr.write("render: Factorio did not start within 300 s\n");
    process.exit(1);
  }
  if (mode === "slow") {
    process.on("SIGINT", () => { process.stderr.write("Received SIGINT: stopping Factorio\n"); process.exit(130); });
    setTimeout(() => process.exit(0), 20000);
    return;
  }
  const value = JSON.parse(fs.readFileSync(arg("--input"), "utf8"));
  const targets = renderTargets(value).filter((t) => !only || only.includes(t.path));
  const images = [];
  const without = [];
  targets.forEach((t, i) => {
    if (mode === "nothing" || (mode === "partial" && i === targets.length - 1)) {
      without.push({ path: t.path, file: t.file, label: t.label, reason: "nothing of it could be built", failed: {}, missing: { "assembling-machine-3": 4 } });
      return;
    }
    const f = path.join(out, t.file);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, "jpeg " + t.file);
    const build = mode === "build-problems" && i === 0 ? { failed: { "stone-furnace": 2 }, missing: { "small-lamp": 1 } } : { failed: {}, missing: {} };
    images.push({ path: t.path, file: t.file, label: t.label, sha256: t.hash, render_version: 1, width: 10, height: 20, bytes: 5, pixels_per_tile: 32, screenshots: 1, strategy: "ordinary", built: 1, tiles: 0, ...build, problems: [], import_errors: false, attempts: [] });
  });
  if (mode === "empty-too") without.push({ path: "9", file: "9.jpg", label: "", reason: "empty blueprint" });
  const manifestFile = path.join(out, "render.json");
  if (images.length > 0 || without.length > 0) {
    fs.mkdirSync(out, { recursive: true });
    const previous = only && fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, "utf8")).entries : {};
    const entries = { ...previous };
    for (const i of images) entries[i.path === "" ? "0" : i.path] = { file: i.file, sha256: i.sha256, render_version: i.render_version, width: i.width, height: i.height };
    fs.writeFileSync(manifestFile, JSON.stringify({ schema: 1, rendered_at: new Date().toISOString(), entries }, null, 2) + "\n");
  }
  if (mode !== "noreport") {
    console.log(JSON.stringify({
      schema: 1, input: path.resolve(arg("--input")), format: "json", out: path.resolve(out), only,
      images, without_image: without, skipped: [], problems: mode === "problems" ? ["slot 3 appears twice; the second is ignored"] : [],
      removed: [], manifest: manifestFile, work_dir: null,
    }, null, 2));
  }
  process.exit(without.length > 0 ? 2 : 0);
})();
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
  test("single blueprint: images, the tool's manifest, block, commit", async () => {
    const h = host("ok");
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
    const target = renderTargets(JSON.parse(read(`${SINGLE_DIR}/blueprint.json`)))[0]!;
    assert.equal(parseRenderManifest(read(`${SINGLE_DIR}/renders/render.json`))!.entries["0"]!.sha256, target.hash);
    assert.ok(read(`${SINGLE_DIR}/README.md`).includes(`![Lamps](https://blueprints.abucnasty.dev/${SINGLE_DIR}/cover.jpg)`));
    assert.deepStrictEqual(remoteLog(), ["render Lamps", "initial"]);
    const last = h.notices.at(-1)!;
    assert.match(last.message, /^Rendered 1 image for cat\/lamps, committed and pushed/);
    assert.equal(last.kind, "info");
    assert.ok(h.progress.includes(`Rendering ${SINGLE_DIR}: Starting Factorio`));
    assert.equal(h.progress.at(-1), "(closed)");
    assert.equal((await folderRenderState(h, SINGLE_DIR)).overall, "current");
  });

  test("render mods: --enable-mods, with --mods when a folder is set", async () => {
    await renderPreview(host("ok", { settings: { render: { enableMods: ["space-backgrounds", "lib"] } } }), SINGLE_DIR);
    let args = lastArgs();
    assert.deepStrictEqual(args.slice(args.indexOf("--enable-mods"), args.indexOf("--enable-mods") + 2), ["--enable-mods", "space-backgrounds,lib"]);
    assert.ok(!args.includes("--mods"));
    await renderPreview(host("ok", { settings: { render: { enableMods: ["a"], modsFolder: " /my/mods " } } }), SINGLE_DIR);
    args = lastArgs();
    assert.deepStrictEqual(args.slice(args.indexOf("--enable-mods"), args.indexOf("--enable-mods") + 4), ["--enable-mods", "a", "--mods", "/my/mods"]);
    // A folder alone changes nothing.
    await renderPreview(host("ok", { settings: { render: { modsFolder: "/my/mods" } } }), SINGLE_DIR);
    assert.ok(!lastArgs().includes("--mods") && !lastArgs().includes("--enable-mods"));
  });

  test("book: nested files, version in the commit message", async () => {
    const h = host("ok");
    const out = await renderPreview(h, `${BOOK_DIR}/renders`);
    assert.deepStrictEqual(out.action === "rendered" && out.images, ["0.jpg", "1/0.jpg"]);
    assert.deepStrictEqual(Object.keys(parseRenderManifest(read(`${BOOK_DIR}/renders/render.json`))!.entries).sort(), ["0", "1/0"]);
    assert.deepStrictEqual(remoteLog(), ["render The Book 3", "initial"]);
    assert.ok(read(`${BOOK_DIR}/README.md`).includes("cover.jpg)\n\n- [Concrete pad]"));
    assert.equal((await folderRenderState(h, BOOK_DIR)).overall, "current");
  });

  test("entities not built are summed from the failed and missing objects", async () => {
    const h = host("build-problems");
    await renderPreview(h, BOOK_DIR);
    const last = h.notices.at(-1)!;
    assert.match(last.message, /\(1 problem: slot 0 "Concrete pad": 3 entities not built\)/);
    assert.equal(last.kind, "error");
  });

  test("the report's problems with the input are listed", async () => {
    const h = host("problems");
    await renderPreview(h, BOOK_DIR);
    assert.match(h.notices.at(-1)!.message, /1 problem: slot 3 appears twice; the second is ignored/);
  });

  test("an empty blueprint without an image is not a problem", async () => {
    const h = host("empty-too");
    const out = await renderPreview(h, BOOK_DIR);
    assert.ok(out.action === "rendered" && out.problems.length === 0);
    const last = h.notices.at(-1)!;
    assert.match(last.message, /^Rendered 2 images for cat\/book, committed and pushed/);
    assert.equal(last.kind, "info");
  });

  test("no parsable report: files found by scanning renders/", async () => {
    const h = host("noreport");
    const out = await renderPreview(h, BOOK_DIR);
    assert.deepStrictEqual(out.action === "rendered" && out.images, ["0.jpg", "1/0.jpg"]);
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
    const h = host("ok", { settings: { render: { factorioPath: " " } } });
    assert.deepStrictEqual(await renderPreview(h, SINGLE_DIR), { action: "needs-settings" });
    assert.equal(h.settingsOpened, 1);
    assert.match(h.notices[0]!.message, /Set the Factorio path/);
    assert.ok(!existsSync(log));
  });

  test("missing node_modules: the exact command to run", async () => {
    rmSync(join(vault, "_tools/render/node_modules"), { recursive: true });
    const h = host("ok");
    const out = await renderPreview(h, SINGLE_DIR);
    assert.equal(out.action, "rejected");
    assert.equal(
      h.notices[0]!.message,
      `The render tool's dependencies are not installed. In a terminal, run:\ncd "${vault}/_tools/render" && npm ci\nthen render again.`,
    );
  });

  test("Node that cannot start", async () => {
    const h = host("ok", { settings: { render: { nodePath: join(root, "no-node") } } });
    const out = await renderPreview(h, SINGLE_DIR);
    assert.equal(out.action, "failed");
    assert.match(h.notices[0]!.message, /^Could not start Node\.js .*Set "Node path"/);
  });

  test("outside a blueprint folder", async () => {
    assert.equal((await renderPreview(host("ok"), "cat")).action, "rejected");
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
    const h = host("ok");
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
    const h = host("ok", { lfs: false });
    const out = await renderPreview(h, SINGLE_DIR);
    assert.ok(out.action === "rendered" && !out.committed);
    assert.match(h.notices.at(-1)!.message, /git-lfs is not installed/);
    assert.deepStrictEqual(remoteLog(), ["initial"]);
  });
});

describe("render only what needs it", () => {
  test("--only with the outdated entries; the tool merges render.json", async () => {
    await renderPreview(host("ok"), BOOK_DIR);
    const value = JSON.parse(read(`${BOOK_DIR}/blueprint.json`));
    value.blueprint_book.blueprints[1].blueprint_book.blueprints[0].blueprint.label = "Changed lamps";
    writeFileSync(join(vault, BOOK_DIR, "blueprint.json"), writeCanonicalJson(value));
    const h = host("ok");
    assert.deepStrictEqual((await folderRenderState(h, BOOK_DIR)).entries.map((e) => e.state), ["current", "outdated"]);
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

  test("a newer render version in _tools/render/render-version.json makes the images outdated", async () => {
    await renderPreview(host("ok"), SINGLE_DIR);
    const h = host("ok");
    assert.deepStrictEqual(await foldersNeedingRender(h).then((l) => l.map((f) => f.folder)), [BOOK_DIR]);
    writeFileSync(join(vault, "_tools/render/render-version.json"), '{ "render_version": 2 }\n');
    assert.deepStrictEqual(await foldersNeedingRender(h).then((l) => l.map((f) => [f.folder, f.state.overall])), [
      [BOOK_DIR, "none"],
      [SINGLE_DIR, "outdated"],
    ]);
  });

  test("everything needed, or a single blueprint: a whole run without --only", async () => {
    await renderPreview(host("ok"), BOOK_DIR, { onlyNeeded: true });
    assert.ok(!lastArgs().includes("--only"));
    await renderPreview(host("ok"), SINGLE_DIR, { onlyNeeded: true });
    assert.ok(!lastArgs().includes("--only"));
  });

  test("needing-render list and render all", async () => {
    const h = host("ok");
    assert.deepStrictEqual((await foldersNeedingRender(h)).map((f) => [f.folder, f.state.overall]), [
      [BOOK_DIR, "none"],
      [SINGLE_DIR, "none"],
    ]);
    await renderAllNeeded(h);
    assert.match(h.notices.at(-1)!.message, /^Render all: 2 of 2 rendered\./);
    assert.ok(h.progress.some((p) => p.startsWith("Rendering 2 of 2: cat/lamps")));
    assert.deepStrictEqual(await foldersNeedingRender(h), []);
  });

  test("render all reports failures and goes on", async () => {
    const h = host("fail");
    await renderAllNeeded(h);
    const summary = h.notices.at(-1)!.message;
    assert.match(summary, /^Render all: 0 of 2 rendered, 2 failed\./);
    assert.match(summary, /cat\/book: Render of cat\/book failed/);
  });

  test("import notice says when the render is now outdated", async () => {
    await renderPreview(host("ok"), SINGLE_DIR);
    const h = host("ok", { clipboard: fixture("non-ascii-label.txt"), settings: { commitAfterImport: false } });
    await importFromClipboard(h, SINGLE_DIR);
    assert.match(h.notices.at(-1)!.message, /its render is now outdated: outdated; run Render preview/);
  });

  test("render after import, when switched on for this computer", async () => {
    const h = host("ok", { clipboard: fixture("non-ascii-label.txt"), settings: { render: { afterImport: true } } });
    const out = await importFromClipboard(h, "cat");
    assert.equal(out.action, "created");
    assert.deepStrictEqual(remoteLog(), ["render Fußgänger-Brücke — 日本語 🚀 1", "add Fußgänger-Brücke — 日本語 🚀", "initial"]);
    assert.ok(existsSync(join(vault, "cat/fussganger-brucke/renders/0.jpg")));
  });
});

describe("render an expanded book", () => {
  const LEAF_PAD = `${BOOK_DIR}/0-concrete-pad`;
  const LEAF_LAMPS = `${BOOK_DIR}/1-inner-book/0-wired-lamps`;
  const expandedHost = async (mode: string) => {
    const h = host(mode);
    assert.equal((await expandBookIntoFolders(h, BOOK_DIR)).action, "expanded");
    return h;
  };

  test("one run on the assembled book; images and render.json move into the leaves; one commit of the book", async () => {
    const h = await expandedHost("ok");
    const out = await renderPreview(h, BOOK_DIR);
    assert.deepStrictEqual(out.action === "rendered" && out.images, ["0", "1/0"]);
    const args = lastArgs();
    assert.match(args[args.indexOf("--input") + 1]!, /\/\.factorio-render\/[^/]+\/blueprint\.json$/);
    assert.ok(!args.includes("--only"));
    assert.equal(read(`${LEAF_LAMPS}/renders/0.jpg`), "jpeg 1/0.jpg");
    const target = renderTargets(JSON.parse(read(`${LEAF_LAMPS}/blueprint.json`)))[0]!;
    assert.deepStrictEqual(parseRenderManifest(read(`${LEAF_LAMPS}/renders/render.json`))!.entries, {
      "0": { file: "0.jpg", sha256: target.hash, render_version: 1, width: 10, height: 20 },
    });
    assert.ok(!existsSync(join(vault, ".factorio-render")), "scratch removed, and its empty parent too");
    assert.deepStrictEqual((await folderRenderState(h, BOOK_DIR)).overall, "current");
    assert.ok(read(`${BOOK_DIR}/README.md`).includes(`/${BOOK_DIR}/cover.jpg)`));
    assert.ok(read(`${LEAF_PAD}/README.md`).includes(`/${BOOK_DIR}/renders/0.jpg)`));
    assert.deepStrictEqual(remoteLog().slice(0, 2), ["render The Book 3", "expand The Book into folders"]);
  });

  test("--only the leaves that need it; the scratch folder is removed", async () => {
    const h = await expandedHost("ok");
    await renderPreview(h, BOOK_DIR);
    const value = JSON.parse(read(`${LEAF_LAMPS}/blueprint.json`));
    value.blueprint.label = "Changed lamps";
    writeFileSync(join(vault, LEAF_LAMPS, "blueprint.json"), writeCanonicalJson(value));
    await renderPreview(h, BOOK_DIR);
    const args = lastArgs();
    assert.deepStrictEqual(args.slice(args.indexOf("--only"), args.indexOf("--only") + 2), ["--only", "1/0"]);
    // The label changed, so the leaf's folder follows it, image and all.
    assert.ok(existsSync(join(vault, BOOK_DIR, "1-inner-book/0-changed-lamps/renders/0.jpg")));
    assert.equal((await folderRenderState(h, BOOK_DIR)).overall, "current");
    assert.ok(!existsSync(join(vault, ".factorio-render")) || readdirSync(join(vault, ".factorio-render")).length === 0);
    // A nested book renders on its own, with slot paths relative to it; already current here.
    await renderPreview(h, `${BOOK_DIR}/1-inner-book`);
    assert.match(h.notices.at(-1)!.message, /already current/);
  });
});

