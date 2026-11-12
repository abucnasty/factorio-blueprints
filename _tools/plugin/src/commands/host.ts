// What the commands need from the outside world. The Obsidian adapter
// (src/obsidian/) implements this for the real app; tests use fakes. Keep
// command logic behind this interface so it runs without Obsidian.

import type { GitResult } from "../git/commit-and-sync.ts";

/** Vault-relative file access ("/" separators, root is ""). */
export interface VaultFiles {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  /** Write a file, replacing it if it exists. The parent folder must exist. */
  write(path: string, text: string): Promise<void>;
  /** Create a folder and any missing parents. */
  mkdir(path: string): Promise<void>;
  /** Direct children of a folder, as vault paths. */
  list(path: string): Promise<{ files: string[]; folders: string[] }>;
}

export interface Clipboard {
  readText(): Promise<string>;
  writeText(text: string): Promise<void>;
}

export interface Settings {
  /** Authors written to new notes; empty keeps the template's value. */
  authors: string[];
  /** Commit, pull and push the blueprint folder after an import. */
  commitAfterImport: boolean;
  /** Vault path of the notes template for new blueprints. */
  templatePath: string;
  /** Link Worker base URL, e.g. https://blueprints.abucnasty.dev */
  linkBase: string;
  /** Render settings for this computer. */
  render: RenderSettings;
}

export interface RenderSettings {
  /** Factorio executable or install folder; empty if not set. */
  factorioPath: string;
  /** Node.js binary that runs the render tool. */
  nodePath: string;
  /** Extra arguments for the render tool, e.g. ["--show-window"]. */
  extraArgs: string[];
  /** Render previews right after each import. */
  afterImport: boolean;
}

export interface CreatePrompt {
  /** Folder the new blueprint folder goes in ("" for the vault root). */
  parent: string;
  /** e.g. `blueprint book "Mall" (12 blueprints, 3,401 entities)` */
  summary: string;
  title: string;
  slug: string;
  askChangeNote: boolean;
  /** Returns an error message for an unusable slug, or undefined if fine. */
  checkSlug(slug: string): Promise<string | undefined>;
}

export interface CreateAnswer {
  title: string;
  slug: string;
  changeNote: string;
}

export interface UpdatePrompt {
  folder: string;
  title: string;
  /** What is being imported. */
  summary: string;
  /** What blueprint.json held before, if it could be read. */
  previousSummary: string | undefined;
  /** Frontmatter version now, if any. */
  currentVersion: string | undefined;
  /** Proposed next version, if one can be worked out. */
  suggestedVersion: string | undefined;
  /** False if there is no README.md to hold a version. */
  canBumpVersion: boolean;
  askChangeNote: boolean;
}

export interface UpdateAnswer {
  /** New frontmatter version, or undefined to leave it. */
  newVersion: string | undefined;
  changeNote: string;
}

export type NoticeKind = "info" | "error";

export interface PickItem {
  label: string;
  detail?: string;
}

/** A message that stays up while something long runs. */
export interface Progress {
  update(message: string): void;
  close(): void;
}

export interface UI {
  notice(message: string, kind?: NoticeKind): void;
  /** Resolves undefined if the user cancels. */
  askCreate(prompt: CreatePrompt): Promise<CreateAnswer | undefined>;
  askUpdate(prompt: UpdatePrompt): Promise<UpdateAnswer | undefined>;
  /** Open a note after creating it. Optional. */
  openNote?(path: string): Promise<void>;
  /** Let the user choose one item; resolves its index, or undefined if dismissed. */
  pick(items: PickItem[], placeholder: string): Promise<number | undefined>;
  progress(message: string): Progress;
  /** Open the plugin's settings. Optional. */
  openSettings?(): void;
}

export interface GitSync {
  /** Stage, commit, pull and push one vault folder. Never throws. */
  commitAndSync(folder: string, message: string): Promise<GitResult>;
  /** True if git-lfs is installed, so images are stored through LFS. */
  lfsAvailable(): Promise<boolean>;
}

export interface ProcessResult {
  /** Exit code; null when ended by a signal. -1 if the program could not start. */
  code: number | null;
  stdout: string;
  stderr: string;
  /** Why it could not start, when code is -1. */
  error?: string;
  /**
   * Set when the program was started outside a Flatpak sandbox (through
   * flatpak-spawn --host): the app id, and why the host start failed, if it
   * did.
   */
  sandbox?: { appId: string; failure?: SandboxFailure };
}

/**
 * no-permission: the app may not start programs outside its sandbox;
 * command-not-found: the host has no such program (not on its PATH);
 * launcher-missing: flatpak-spawn is not in the sandbox.
 */
export type SandboxFailure = "no-permission" | "command-not-found" | "launcher-missing";

export interface ProcessRunner {
  /** Run a program with an argument array (no shell). */
  run(
    program: string,
    args: string[],
    options: { cwd: string; signal?: AbortSignal; onStderrLine?: (line: string) => void },
  ): Promise<ProcessResult>;
}

export interface Host {
  files: VaultFiles;
  clipboard: Clipboard;
  ui: UI;
  settings: Settings;
  /** Absent where git is not available; the commit step is then skipped. */
  git: GitSync | undefined;
  /** Today's local date as YYYY-MM-DD. */
  today(): string;
  /** Absolute path of the vault folder; undefined where there is none. */
  vaultPath: string | undefined;
  /** Absent where programs cannot be run. */
  processes: ProcessRunner | undefined;
}
