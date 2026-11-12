// Runs the system git through Node's child_process (desktop Obsidian and
// Node only). Arguments are passed as an array, never through a shell.

import { execFile } from "child_process";
import { existsSync } from "fs";
import { resolve } from "path";

import type { GitOutput, GitRunner } from "./commit-and-sync.ts";

const TIMEOUT_MS = 120_000;

export function createGitRunner(gitBinary: string, cwd: string): GitRunner {
  const env = {
    ...process.env,
    // Fail instead of waiting for a password prompt nobody can see.
    GIT_TERMINAL_PROMPT: "0",
    GCM_INTERACTIVE: "never",
    // Commits go through without an editor; merges use the default message.
    GIT_EDITOR: "true",
    GIT_MERGE_AUTOEDIT: "no",
  };
  return (args) =>
    new Promise<GitOutput>((done) => {
      execFile(
        gitBinary,
        args,
        { cwd, env, timeout: TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
        (error, stdout, stderr) => {
          let code = 0;
          if (error) {
            const c = (error as { code?: unknown }).code;
            code = typeof c === "number" ? c : -1;
            if (code === -1 && !stderr) stderr = `could not run ${gitBinary}: ${error.message}`;
          }
          done({ code, stdout: String(stdout), stderr: String(stderr) });
        },
      );
    });
}

/** pathExists for commitAndSync: resolves git's paths against the cwd. */
export function nodePathExists(cwd: string): (path: string) => Promise<boolean> {
  return async (p) => existsSync(resolve(cwd, p));
}

/**
 * Git binary to use when none is configured. Obsidian started from the
 * macOS Dock does not see the shell PATH, so look where Homebrew puts git.
 */
export function defaultGitBinary(): string {
  if (process.platform === "darwin") {
    for (const p of ["/opt/homebrew/bin/git", "/usr/local/bin/git"]) {
      if (existsSync(p)) return p;
    }
  }
  return "git";
}
