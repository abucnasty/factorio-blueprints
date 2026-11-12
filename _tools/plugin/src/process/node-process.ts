// Runs a program through Node's child_process with an argument array
// (never a shell), for the render command. Desktop Obsidian and Node only.

import { spawn } from "child_process";
import { existsSync } from "fs";

import type { ProcessResult, ProcessRunner } from "../commands/host.ts";

export const nodeProcessRunner: ProcessRunner = {
  run(program, args, { cwd, signal, onStderrLine }) {
    return new Promise<ProcessResult>((done) => {
      let stdout = "";
      let stderr = "";
      let partial = "";
      let settled = false;
      const finish = (r: ProcessResult) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener("abort", onAbort);
        done(r);
      };
      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(program, args, { cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      } catch (e) {
        finish({ code: -1, stdout, stderr, error: e instanceof Error ? e.message : String(e) });
        return;
      }
      // SIGINT lets the render tool stop Factorio and clean up.
      const onAbort = () => child.kill("SIGINT");
      if (signal?.aborted) onAbort();
      else signal?.addEventListener("abort", onAbort);
      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", (d: string) => (stdout += d));
      child.stderr?.on("data", (d: string) => {
        stderr += d;
        partial += d;
        const lines = partial.split(/\r?\n/);
        partial = lines.pop() ?? "";
        for (const line of lines) onStderrLine?.(line);
      });
      child.on("error", (e) => finish({ code: -1, stdout, stderr, error: e.message }));
      child.on("close", (code) => {
        if (partial !== "") onStderrLine?.(partial);
        finish({ code, stdout, stderr });
      });
    });
  },
};

/**
 * Node binary to use when none is configured. Obsidian started from the
 * macOS Dock does not see the shell PATH, so look where Homebrew puts it.
 */
export function defaultNodeBinary(): string {
  if (process.platform === "darwin") {
    for (const p of ["/opt/homebrew/bin/node", "/usr/local/bin/node"]) if (existsSync(p)) return p;
  }
  return "node";
}
