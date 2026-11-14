// Commit one blueprint folder, then pull and push, alongside obsidian-git.
//
// Rules, so the vault's own timed sync is never disturbed:
// - stage and commit only the given folder (other edits stay as they are);
// - refuse to start while a merge, rebase, cherry-pick or another git
//   command is in progress;
// - never leave the repo mid-operation: a pull that stops in a merge
//   conflict is aborted again, keeping our commit;
// - never retry or force anything: on failure, report it and leave the rest
//   to the timed sync.

/** Runs git with an argument array (never a shell string). */
export type GitRunner = (args: string[]) => Promise<GitOutput>;

export interface GitOutput {
  /** Exit code; non-zero (or -1 if git could not run) means failure. */
  code: number;
  stdout: string;
  stderr: string;
}

export type GitStep = "check" | "stage" | "commit" | "pull" | "push";

export type GitResult =
  | { status: "pushed"; commit: string }
  | { status: "nothing-to-commit" }
  | {
      status: "failed";
      step: GitStep;
      /** True if our commit was made (it stays local until a later push). */
      committed: boolean;
      commit?: string;
      message: string;
    };

type Failed = Extract<GitResult, { status: "failed" }>;

/** States in which git must not be touched. Paths inside the git dir. */
const BUSY_MARKERS: [string, string][] = [
  ["MERGE_HEAD", "a merge is in progress"],
  ["rebase-merge", "a rebase is in progress"],
  ["rebase-apply", "a rebase or am is in progress"],
  ["CHERRY_PICK_HEAD", "a cherry-pick is in progress"],
  ["REVERT_HEAD", "a revert is in progress"],
  ["index.lock", "another git command is running"],
];

export interface CommitAndSyncOptions {
  run: GitRunner;
  /** True if a path (as printed by `git rev-parse --git-path`) exists. */
  pathExists: (path: string) => Promise<boolean>;
  /** Folder to commit, relative to the git runner's working directory. */
  folder: string;
  message: string;
  /**
   * Called once the folder's changes are committed (or, with nothing to
   * commit, with the commit that last changed the folder): full SHA and
   * author date. It may write files in the folder (the version ledger) and
   * returns a message to commit them with, or undefined. Both commits are
   * then pulled and pushed together.
   */
  record?: (last: { commit: string; date: string }) => Promise<string | undefined>;
}

export async function commitAndSync(opts: CommitAndSyncOptions): Promise<GitResult> {
  const { run, pathExists, folder, message, record } = opts;
  const pathspec = ["--", folder === "" ? "." : folder];
  const lit = "--literal-pathspecs";

  const inside = await run(["rev-parse", "--is-inside-work-tree"]);
  if (inside.code !== 0 || inside.stdout.trim() !== "true") {
    return fail("check", false, "the vault is not a git repository", inside);
  }
  const busy = await busyReason(run, pathExists);
  if (busy !== undefined) return fail("check", false, `git is busy: ${busy}`);

  const add = await run([lit, "add", "-A", ...pathspec]);
  if (add.code !== 0) return fail("stage", false, "git add failed", add);

  let committed = await commitStaged(run, pathspec, message);
  if (typeof committed === "object") return committed;

  if (record) {
    // The commit that last changed the folder: ours, if there was anything to commit.
    const last = await run([lit, "log", "-1", "--format=%H%x1f%aI", ...pathspec]);
    const [sha, date] = last.stdout.trim().split("\x1f");
    if (last.code === 0 && sha && date) {
      const recordMessage = await record({ commit: sha, date: date.replace(/\+00:00$/, "Z") });
      if (recordMessage !== undefined) {
        const addRecord = await run([lit, "add", "-A", ...pathspec]);
        if (addRecord.code !== 0) return fail("stage", committed, "git add failed", addRecord);
        const second = await commitStaged(run, pathspec, recordMessage);
        if (typeof second === "object") return committed ? { ...second, committed: true } : second;
        committed ||= second;
      }
    }
  }
  if (!committed) return { status: "nothing-to-commit" };
  const head = await run(["rev-parse", "--short", "HEAD"]);
  const commit = head.stdout.trim();

  const pull = await run(["pull", "--no-rebase", "--no-edit"]);
  if (pull.code !== 0) {
    let note = "git pull failed";
    if (await gitPathExists(run, pathExists, "MERGE_HEAD")) {
      const abort = await run(["merge", "--abort"]);
      note =
        abort.code === 0
          ? "git pull hit a merge conflict, so the merge was undone"
          : "git pull hit a merge conflict and undoing it failed; resolve it in the Git plugin";
    }
    return fail("pull", true, note, pull, commit);
  }

  const push = await run(["push"]);
  if (push.code !== 0) return fail("push", true, "git push failed", push, commit);

  return { status: "pushed", commit };
}

/** Commit what is staged under the pathspec: true if committed, false if nothing was staged, or the failure. */
async function commitStaged(run: GitRunner, pathspec: string[], message: string): Promise<boolean | Failed> {
  const lit = "--literal-pathspecs";
  const staged = await run([lit, "diff", "--cached", "--quiet", ...pathspec]);
  if (staged.code === 0) return false;
  if (staged.code !== 1) return fail("stage", false, "git diff failed", staged) as Failed;
  const out = await run([lit, "commit", "--only", "-m", message, ...pathspec]);
  if (out.code !== 0) return fail("commit", false, "git commit failed", out) as Failed;
  return true;
}

async function busyReason(
  run: GitRunner,
  pathExists: (path: string) => Promise<boolean>,
): Promise<string | undefined> {
  for (const [marker, reason] of BUSY_MARKERS) {
    if (await gitPathExists(run, pathExists, marker)) return reason;
  }
  return undefined;
}

async function gitPathExists(
  run: GitRunner,
  pathExists: (path: string) => Promise<boolean>,
  name: string,
): Promise<boolean> {
  const out = await run(["rev-parse", "--git-path", name]);
  return out.code === 0 && (await pathExists(out.stdout.trim()));
}

function fail(
  step: GitStep,
  committed: boolean,
  what: string,
  out?: GitOutput,
  commit?: string,
): GitResult {
  const detail = out ? firstErrorLine(out) : "";
  const result: GitResult = {
    status: "failed",
    step,
    committed,
    message: detail ? `${what}: ${detail}` : what,
  };
  if (commit !== undefined) result.commit = commit;
  return result;
}

/** The most useful line of git's output, for a notice. */
export function firstErrorLine(out: GitOutput): string {
  const lines = (out.stderr + "\n" + out.stdout)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "" && !/^hint:/i.test(l));
  // git-lfs explains a refused upload better than git's own "failed to push".
  const line =
    lines.find((l) => /\blfs\b|batch response/i.test(l) && !/^(?:uploading lfs objects|git lfs)/i.test(l)) ??
    lines.find((l) => /^(fatal|error):/i.test(l)) ??
    lines.find((l) => /conflict/i.test(l)) ??
    lines[0] ??
    "";
  return line.length > 200 ? line.slice(0, 197) + "..." : line;
}

/** True if git-lfs is installed for this git. */
export async function lfsAvailable(run: GitRunner): Promise<boolean> {
  const out = await run(["lfs", "version"]);
  return out.code === 0 && /git-lfs/i.test(out.stdout + out.stderr);
}
