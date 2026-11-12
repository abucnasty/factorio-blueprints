// Render preview from a Flatpak Obsidian: the tool runs on the host through
// flatpak-spawn. A stand-in flatpak-spawn checks its arguments, then runs
// the command like the real one, or fails the way the real one does.

import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";

import { renderPreview } from "../../src/commands/render-preview.ts";
import { writeCanonicalJson } from "../../src/core/index.ts";
import { flatpakAppId, hostProcessRunner, launchCommand, sandboxFailure } from "../../src/process/flatpak.ts";
import { fakeHost } from "./helpers.ts";

const root = mkdtempSync(join(tmpdir(), "fbp-flatpak-test-"));
after(() => rmSync(root, { recursive: true, force: true }));

const LAUNCHER = join(root, "flatpak-spawn");
writeFileSync(
  LAUNCHER,
  `#!${process.execPath}
const { spawn } = require("child_process");
const fs = require("fs");
const argv = process.argv.slice(2);
fs.writeFileSync(${JSON.stringify(join(root, "launcher-args.json"))}, JSON.stringify(argv));
if (process.env.FAKE_FLATPAK === "deny") {
  process.stderr.write("Portal call failed: org.freedesktop.DBus.Error.ServiceUnknown: The name org.freedesktop.Flatpak was not provided by any .service files\\n");
  process.exit(1);
}
if (argv[0] !== "--host" || argv[1] !== "--watch-bus" || !argv[2].startsWith("--directory=")) process.exit(99);
const child = spawn(argv[3], argv.slice(4), { cwd: argv[2].slice("--directory=".length), stdio: "inherit" });
child.on("error", (e) => {
  process.stderr.write("Failed to start command: Failed to execute child process \\u201c" + argv[3] + "\\u201d (No such file or directory)\\n");
  process.exit(255);
});
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => child.kill(s));
child.on("exit", (code, signal) => process.exit(code ?? 128));
`,
);
chmodSync(LAUNCHER, 0o755);

const TOOL = join(root, "tool.js");
writeFileSync(
  TOOL,
  `// The SIGINT handler goes first, so a cancel right after the progress lines finds it.
if (process.argv[2] === "slow") process.on("SIGINT", () => { process.stderr.write("got SIGINT\\n"); process.exit(130); });
process.stderr.write("step 1\\nstep 2\\n");
if (process.argv[2] === "slow") {
  setTimeout(() => process.exit(0), 20000);
} else {
  process.stdout.write(JSON.stringify({ cwd: process.cwd(), args: process.argv.slice(2) }));
  process.exit(2);
}
`,
);

describe("sandbox detection and launch", () => {
  test("app id from FLATPAK_ID or /.flatpak-info", () => {
    assert.equal(flatpakAppId({ FLATPAK_ID: "md.obsidian.Obsidian" }, () => undefined), "md.obsidian.Obsidian");
    assert.equal(flatpakAppId({}, () => "[Application]\nname=org.example.Notes\nruntime=x\n"), "org.example.Notes");
    assert.equal(flatpakAppId({}, () => "[Instance]\n"), "md.obsidian.Obsidian");
    assert.equal(flatpakAppId({}, () => undefined), undefined);
    assert.equal(flatpakAppId({ FLATPAK_ID: " " }, () => undefined), undefined);
  });

  test("what is spawned", () => {
    assert.deepStrictEqual(launchCommand("node", ["a b", "--x"], "/home/me/vault", false), { command: "node", args: ["a b", "--x"] });
    assert.deepStrictEqual(launchCommand("/usr/bin/node", ["a b", "--x"], "/home/me/my vault", true), {
      command: "flatpak-spawn",
      args: ["--host", "--watch-bus", "--directory=/home/me/my vault", "/usr/bin/node", "a b", "--x"],
    });
  });

  test("failure classification", () => {
    const r = (code: number | null, stderr: string, stdout = "", error?: string) => ({ code, stdout, stderr, ...(error ? { error } : {}) });
    assert.equal(sandboxFailure(r(1, "Portal call failed: org.freedesktop.DBus.Error.ServiceUnknown: The name org.freedesktop.Flatpak was not provided")), "no-permission");
    assert.equal(sandboxFailure(r(255, "Failed to start command: Failed to execute child process “node” (No such file or directory)")), "command-not-found");
    assert.equal(sandboxFailure(r(127, "")), "command-not-found");
    assert.equal(sandboxFailure(r(-1, "", "", "spawn flatpak-spawn ENOENT")), "launcher-missing");
    assert.equal(sandboxFailure(r(1, "render: Factorio did not start")), undefined);
    assert.equal(sandboxFailure(r(1, "org.freedesktop.Flatpak", '{"images":[]}')), undefined, "a report means the tool ran");
    assert.equal(sandboxFailure(r(0, "")), undefined);
  });
});

describe("running through flatpak-spawn", () => {
  test("report, progress lines, exit code and directory come through", async () => {
    delete process.env["FAKE_FLATPAK"];
    const lines: string[] = [];
    const runner = hostProcessRunner("md.obsidian.Obsidian", LAUNCHER);
    const r = await runner.run(process.execPath, [TOOL, "a b"], { cwd: root, onStderrLine: (l) => lines.push(l) });
    assert.equal(r.code, 2);
    assert.deepStrictEqual(JSON.parse(r.stdout), { cwd: root, args: ["a b"] });
    assert.deepStrictEqual(lines, ["step 1", "step 2"]);
    assert.deepStrictEqual(r.sandbox, { appId: "md.obsidian.Obsidian" });
    assert.deepStrictEqual(JSON.parse(readFileSync(join(root, "launcher-args.json"), "utf8")), [
      "--host",
      "--watch-bus",
      `--directory=${root}`,
      process.execPath,
      TOOL,
      "a b",
    ]);
  });

  test("cancel reaches the host process", async () => {
    const controller = new AbortController();
    const lines: string[] = [];
    const run = hostProcessRunner("x", LAUNCHER).run(process.execPath, [TOOL, "slow"], {
      cwd: root,
      signal: controller.signal,
      onStderrLine: (l) => {
        lines.push(l);
        if (l === "step 2") controller.abort();
      },
    });
    const r = await run;
    assert.equal(r.code, 130);
    assert.ok(lines.includes("got SIGINT"));
  });
});

describe("render preview notices under Flatpak", () => {
  const vault = join(root, "vault");
  mkdirSync(join(vault, "_tools/render/bin"), { recursive: true });
  mkdirSync(join(vault, "_tools/render/node_modules"), { recursive: true });
  mkdirSync(join(vault, "cat/lamps"), { recursive: true });
  writeFileSync(join(vault, "_tools/render/bin/render.js"), "process.exit(1)\n");
  writeFileSync(join(vault, "cat/lamps/blueprint.json"), writeCanonicalJson({ blueprint: { item: "blueprint", entities: [{ entity_number: 1, name: "small-lamp" }] } }));

  const host = (opts: { appId?: string; launcher?: string; node?: string } = {}) =>
    fakeHost({
      disk: vault,
      processes: hostProcessRunner(opts.appId ?? "md.obsidian.Obsidian", opts.launcher ?? LAUNCHER),
      settings: { render: { factorioPath: "/games/factorio", nodePath: opts.node ?? process.execPath } },
    });

  test("no permission to start on the host: the override command, nothing committed", async () => {
    process.env["FAKE_FLATPAK"] = "deny";
    const h = host({ appId: "com.example.ObsidianBeta" });
    const out = await renderPreview(h, "cat/lamps");
    delete process.env["FAKE_FLATPAK"];
    assert.equal(out.action, "failed");
    assert.equal(
      h.notices.at(-1)!.message,
      "Obsidian runs as a Flatpak, so the render has to start outside its sandbox, which it is not allowed to do yet. In a terminal, run:\n" +
        "flatpak override --user --talk-name=org.freedesktop.Flatpak com.example.ObsidianBeta\n" +
        "then quit and reopen Obsidian and render again.",
    );
    assert.equal(h.commits.length, 0);
  });

  test("node not found on the host: Node path, with the full-path hint", async () => {
    const h = host({ node: "/no/such/node" });
    const out = await renderPreview(h, "cat/lamps");
    assert.equal(out.action, "failed");
    const message = h.notices.at(-1)!.message;
    assert.match(message, /^Could not start Node\.js \(\/no\/such\/node\): Failed to start command: .*No such file or directory.*\. Set "Node path" in the plugin settings\./);
    assert.match(message, /Obsidian runs as a Flatpak, so it must be the full path to node on the computer itself/);
    assert.equal(h.commits.length, 0);
  });

  test("flatpak-spawn missing in the sandbox", async () => {
    const h = host({ launcher: join(root, "missing-flatpak-spawn") });
    const out = await renderPreview(h, "cat/lamps");
    assert.equal(out.action, "failed");
    assert.match(h.notices.at(-1)!.message, /^Obsidian runs as a Flatpak, but flatpak-spawn, .* is not available in it/);
  });
});
