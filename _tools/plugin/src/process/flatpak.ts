// Running programs outside a Flatpak sandbox. Obsidian from Flathub runs in
// one, and a game started there cannot use the GPU properly, so the render
// tool must run on the host, through flatpak-spawn --host.

import { existsSync, readFileSync } from "fs";

import type { ProcessResult, ProcessRunner, SandboxFailure } from "../commands/host.ts";
import { nodeProcessRunner } from "./node-process.ts";

export const DEFAULT_FLATPAK_APP_ID = "md.obsidian.Obsidian";

/**
 * The Flatpak app id when this process runs in a Flatpak sandbox, else
 * undefined: FLATPAK_ID, or the name in /.flatpak-info.
 */
export function flatpakAppId(
  env: Record<string, string | undefined> = process.env,
  readInfo: () => string | undefined = () => (existsSync("/.flatpak-info") ? readFileSync("/.flatpak-info", "utf8") : undefined),
): string | undefined {
  const id = env["FLATPAK_ID"]?.trim();
  if (id) return id;
  let info: string | undefined;
  try {
    info = readInfo();
  } catch {
    info = "";
  }
  if (info === undefined) return undefined;
  return /^\s*name\s*=\s*(\S+)\s*$/m.exec(info)?.[1] ?? DEFAULT_FLATPAK_APP_ID;
}

/** What to spawn for a program: itself, or flatpak-spawn starting it on the host. */
export function launchCommand(
  program: string,
  args: string[],
  cwd: string,
  sandboxed: boolean,
  launcher = "flatpak-spawn",
): { command: string; args: string[] } {
  if (!sandboxed) return { command: program, args };
  // --watch-bus: the host process is killed if we go away. Signals sent to
  // flatpak-spawn (SIGINT for cancel) are forwarded to it.
  return { command: launcher, args: ["--host", "--watch-bus", `--directory=${cwd}`, program, ...args] };
}

/** Why a run through flatpak-spawn failed to start on the host, if it did. */
export function sandboxFailure(r: ProcessResult): SandboxFailure | undefined {
  if (r.code === -1) return /ENOENT|not found/i.test(r.error ?? "") ? "launcher-missing" : undefined;
  if (r.code === 0 || r.stdout.trim() !== "") return undefined;
  if (/org\.freedesktop\.Flatpak/.test(r.stderr)) return "no-permission";
  if (r.code === 127 || /Failed to (?:start|execute|spawn)[^\n]*(?:No such file|not found)/i.test(r.stderr)) {
    return "command-not-found";
  }
  return undefined;
}

/** Runs programs on the host from inside a Flatpak sandbox. */
export function hostProcessRunner(appId: string, launcher = "flatpak-spawn", inner: ProcessRunner = nodeProcessRunner): ProcessRunner {
  return {
    async run(program, args, options) {
      const launch = launchCommand(program, args, options.cwd, true, launcher);
      const result = await inner.run(launch.command, launch.args, options);
      const failure = sandboxFailure(result);
      return { ...result, sandbox: failure === undefined ? { appId } : { appId, failure } };
    },
  };
}

/** The runner for this app: on the host when sandboxed, else directly. */
export function processRunnerForThisApp(): ProcessRunner {
  const appId = flatpakAppId();
  return appId === undefined ? nodeProcessRunner : hostProcessRunner(appId);
}
