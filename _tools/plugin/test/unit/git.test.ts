// The git step against real repositories: a vault clone with a local bare
// remote, and a second clone standing in for another machine.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, beforeEach, describe, test } from "node:test";

import { commitAndSync, firstErrorLine } from "../../src/git/commit-and-sync.ts";
import { createGitRunner, nodePathExists } from "../../src/git/node-runner.ts";

// Isolate every git call, including the runner's, from the developer's own
// git config, like a fresh machine.
process.env["GIT_CONFIG_GLOBAL"] = "/dev/null";
process.env["GIT_CONFIG_NOSYSTEM"] = "1";

const root = mkdtempSync(join(tmpdir(), "fbp-git-test-"));
after(() => rmSync(root, { recursive: true, force: true }));

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

function configure(dir: string): void {
  git(dir, "config", "user.name", "Test");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "commit.gpgsign", "false");
}

let n = 0;
let remote: string;
let vault: string;
let other: string;

beforeEach(() => {
  n++;
  remote = join(root, `remote-${n}.git`);
  vault = join(root, `vault-${n}`);
  other = join(root, `other-${n}`);
  git(root, "init", "--bare", "-b", "main", remote);
  git(root, "clone", "-q", remote, vault);
  configure(vault);
  write(vault, "README.md", "root\n");
  write(vault, "cat/mall/blueprint.json", "{}\n");
  git(vault, "add", "-A");
  git(vault, "commit", "-qm", "initial");
  git(vault, "push", "-q", "-u", "origin", "main");
  git(root, "clone", "-q", remote, other);
  configure(other);
});

function write(dir: string, path: string, text: string): void {
  const full = join(dir, path);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, text);
}

function sync(folder: string, message: string, cwd = vault) {
  return commitAndSync({ run: createGitRunner("git", cwd), pathExists: nodePathExists(cwd), folder, message });
}

const log = (dir: string, ref = "HEAD") => git(dir, "log", "--format=%s", ref).trim().split("\n");
const status = (dir: string) => git(dir, "status", "--porcelain").trimEnd();

describe("commitAndSync", () => {
  test("record: files written after the commit go in a second commit, told the first one's full SHA", async () => {
    write(vault, "cat/mall/blueprint.json", '{"a":2}\n');
    const seen: { commit: string; date: string }[] = [];
    const record = async (last: { commit: string; date: string }) => {
      seen.push(last);
      write(vault, "cat/mall/versions.json", `[${JSON.stringify(last.commit)}]\n`);
      return "record Mall version 2";
    };
    const run = createGitRunner("git", vault);
    const result = await commitAndSync({ run, pathExists: nodePathExists(vault), folder: "cat/mall", message: "update Mall", record });
    assert.equal(result.status, "pushed");
    assert.deepEqual(log(remote, "main").slice(0, 2), ["record Mall version 2", "update Mall"]);
    assert.equal(seen[0]!.commit, git(vault, "rev-parse", "HEAD~1").trim());
    assert.match(seen[0]!.date, /^\d{4}-\d\d-\d\dT/);
    // Nothing new to commit: told the commit that last changed the folder.
    const again = await commitAndSync({ run, pathExists: nodePathExists(vault), folder: "cat/mall", message: "x", record: async (last) => (seen.push(last), undefined) });
    assert.equal(again.status, "nothing-to-commit");
    assert.equal(seen[1]!.commit, git(vault, "rev-parse", "HEAD").trim());
  });

  test("commits only the blueprint folder, then pulls and pushes", async () => {
    write(vault, "cat/new-thing/blueprint.json", '{"a":1}\n');
    write(vault, "cat/new-thing/README.md", "---\ntitle: New\n---\n");
    write(vault, "cat/mall/blueprint.json", '{"changed":true}\n'); // other edits stay
    write(vault, "scratch.md", "unrelated\n");
    git(vault, "add", "scratch.md"); // even when already staged

    const result = await sync("cat/new-thing", "add New");
    assert.equal(result.status, "pushed");
    assert.deepStrictEqual(log(remote, "main"), ["add New", "initial"]);
    const files = git(vault, "show", "--name-only", "--format=", "HEAD").trim().split("\n");
    assert.deepStrictEqual(files, ["cat/new-thing/README.md", "cat/new-thing/blueprint.json"]);
    assert.equal(status(vault), " M cat/mall/blueprint.json\nA  scratch.md");
  });

  test("merges new commits from the remote before pushing", async () => {
    write(other, "elsewhere/notes.md", "from another machine\n");
    git(other, "add", "-A");
    git(other, "commit", "-qm", "other machine");
    git(other, "push", "-q");

    write(vault, "cat/mall/blueprint.json", '{"v":2}\n');
    const result = await sync("cat/mall", "update Mall");
    assert.equal(result.status, "pushed");
    assert.ok(existsSync(join(vault, "elsewhere/notes.md")));
    const remoteLog = log(remote, "main");
    assert.ok(remoteLog.includes("update Mall") && remoteLog.includes("other machine"));
  });

  test("nothing to commit", async () => {
    assert.deepStrictEqual(await sync("cat/mall", "update Mall"), { status: "nothing-to-commit" });
  });

  test("a rejected push keeps the commit and leaves a clean repo", async () => {
    const hook = join(remote, "hooks", "pre-receive");
    writeFileSync(hook, "#!/bin/sh\necho 'pushes are closed today' >&2\nexit 1\n");
    chmodSync(hook, 0o755);
    write(vault, "cat/mall/blueprint.json", '{"v":3}\n');

    const result = await sync("cat/mall", "update Mall");
    assert.equal(result.status, "failed");
    assert.ok(result.status === "failed" && result.step === "push" && result.committed);
    assert.match(result.status === "failed" ? result.message : "", /^git push failed: /);
    assert.deepStrictEqual(log(vault).slice(0, 1), ["update Mall"]);
    assert.deepStrictEqual(log(remote, "main"), ["initial"]);
    assert.equal(status(vault), "");
  });

  test("an unreachable remote fails at pull, commit kept", async () => {
    git(vault, "remote", "set-url", "origin", join(root, "missing.git"));
    write(vault, "cat/mall/blueprint.json", '{"v":4}\n');
    const result = await sync("cat/mall", "update Mall");
    assert.ok(result.status === "failed" && result.step === "pull" && result.committed && result.commit);
    assert.equal(status(vault), "");
  });

  test("a merge conflict on pull is undone, commit kept, no merge left open", async () => {
    write(other, "cat/mall/blueprint.json", '{"theirs":true}\n');
    git(other, "commit", "-qam", "their mall");
    git(other, "push", "-q");
    write(vault, "cat/mall/blueprint.json", '{"ours":true}\n');

    const result = await sync("cat/mall", "update Mall");
    assert.ok(result.status === "failed" && result.step === "pull" && result.committed);
    assert.match(result.status === "failed" ? result.message : "", /merge conflict, so the merge was undone/);
    assert.ok(!existsSync(join(vault, ".git", "MERGE_HEAD")));
    assert.equal(status(vault), "");
    assert.deepStrictEqual(log(vault).slice(0, 1), ["update Mall"]);
  });

  test("refuses to start while a merge is in progress or git is running", async () => {
    write(vault, "cat/mall/blueprint.json", '{"v":5}\n');
    for (const marker of ["MERGE_HEAD", "index.lock"]) {
      writeFileSync(join(vault, ".git", marker), "");
      const result = await sync("cat/mall", "update Mall");
      assert.ok(result.status === "failed" && result.step === "check" && !result.committed, marker);
      rmSync(join(vault, ".git", marker));
    }
    assert.deepStrictEqual(log(vault), ["initial"]);
  });

  test("outside a repository", async () => {
    const plain = join(root, `plain-${n}`);
    mkdirSync(plain);
    const result = await sync("x", "add x", plain);
    assert.ok(result.status === "failed" && result.step === "check");
  });

  test("paths with spaces and pathspec characters are taken literally", async () => {
    write(vault, "odd [cat]/*star*/blueprint.json", "{}\n");
    write(vault, "odd [cat]/other/blueprint.json", "{}\n");
    const result = await sync("odd [cat]/*star*", "add star");
    assert.equal(result.status, "pushed");
    assert.deepStrictEqual(git(vault, "show", "--name-only", "--format=", "HEAD").trim(), "odd [cat]/*star*/blueprint.json");
  });

  test("a missing git binary is a clean failure", async () => {
    const result = await commitAndSync({
      run: createGitRunner(join(root, "no-such-git"), vault),
      pathExists: nodePathExists(vault),
      folder: "cat/mall",
      message: "x",
    });
    assert.ok(result.status === "failed" && result.step === "check");
    assert.match(result.status === "failed" ? result.message : "", /could not run/);
  });
});

test("firstErrorLine picks the error, skips hints", () => {
  assert.equal(
    firstErrorLine({ code: 1, stdout: "", stderr: "hint: try this\nTo x\n ! [rejected]\nerror: failed to push some refs to 'x'\n" }),
    "error: failed to push some refs to 'x'",
  );
});
