// Fake Hosts for the command tests: an in-memory vault, or a real folder on
// disk (for the render command, which runs a real process and git).

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type {
  ConfirmPrompt,
  CreateAnswer,
  CreatePrompt,
  GitSync,
  Host,
  PickItem,
  ProcessRunner,
  RenderSettings,
  Settings,
  UpdateAnswer,
  UpdatePrompt,
  VaultFiles,
} from "../../src/commands/host.ts";
import type { GitResult } from "../../src/git/commit-and-sync.ts";
import { nodeProcessRunner } from "../../src/process/node-process.ts";

export { fixture } from "./fixtures.ts";

export const BASE = "https://blueprints.abucnasty.dev";
/** The full SHA the fake git reports for a commit. */
export const FAKE_COMMIT = "abc1234".padEnd(40, "0");

export interface FakeHost extends Host {
  confirms: ConfirmPrompt[];
  vault: Map<string, string>;
  folders: Set<string>;
  notices: { message: string; kind: string }[];
  clipboardText: string;
  createPrompts: CreatePrompt[];
  updatePrompts: UpdatePrompt[];
  picks: PickItem[][];
  progress: string[];
  commits: { folder: string; message: string }[];
  opened: string[];
  settingsOpened: number;
}

export interface FakeOptions {
  files?: Record<string, string>;
  clipboard?: string;
  settings?: Partial<Omit<Settings, "render">> & { render?: Partial<RenderSettings> };
  create?: (p: CreatePrompt) => CreateAnswer | undefined;
  update?: (p: UpdatePrompt) => UpdateAnswer | undefined;
  pick?: (items: PickItem[]) => number | undefined;
  git?: GitResult | "none" | GitSync;
  lfs?: boolean;
  /** Use a real folder instead of the in-memory vault. */
  disk?: string;
  /** Answer to confirmations (default: OK). */
  confirm?: (p: ConfirmPrompt) => boolean;
  /** Process runner for a disk vault (default: run programs directly). */
  processes?: ProcessRunner;
}

export function fakeHost(opts: FakeOptions = {}): FakeHost {
  const vault = new Map(Object.entries(opts.files ?? {}));
  const folders = new Set<string>();
  for (const path of vault.keys()) {
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i++) folders.add(parts.slice(0, i).join("/"));
  }
  const memoryFiles: VaultFiles = {
    exists: async (p) => p === "" || vault.has(p) || folders.has(p),
    read: async (p) => {
      const t = vault.get(p);
      if (t === undefined) throw new Error(`ENOENT: ${p}`);
      return t;
    },
    write: async (p, text) => {
      const parent = p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
      if (parent !== "" && !folders.has(parent)) throw new Error(`no folder ${parent}`);
      vault.set(p, text);
    },
    mkdir: async (p) => {
      const parts = p.split("/");
      for (let i = 1; i <= parts.length; i++) folders.add(parts.slice(0, i).join("/"));
    },
    rename: async (from, to) => {
      if (vault.has(to) || folders.has(to)) throw new Error(`EEXIST: ${to}`);
      if (vault.has(from)) {
        vault.set(to, vault.get(from)!);
        vault.delete(from);
        return;
      }
      if (!folders.has(from)) throw new Error(`ENOENT: ${from}`);
      const move = (p: string) => to + p.slice(from.length);
      for (const k of [...vault.keys()]) if (k.startsWith(from + "/")) (vault.set(move(k), vault.get(k)!), vault.delete(k));
      for (const f of [...folders]) if (f === from || f.startsWith(from + "/")) (folders.add(move(f)), folders.delete(f));
    },
    remove: async (p) => {
      vault.delete(p);
      for (const k of [...vault.keys()]) if (k.startsWith(p + "/")) vault.delete(k);
      for (const f of [...folders]) if (f === p || f.startsWith(p + "/")) folders.delete(f);
    },
    list: async (p) => {
      const prefix = p === "" ? "" : p + "/";
      const direct = (all: Iterable<string>) =>
        [...all].filter((x) => x.startsWith(prefix) && x !== p && !x.slice(prefix.length).includes("/")).sort();
      return { files: direct(vault.keys()), folders: direct(folders) };
    },
  };
  const { render, ...plain } = opts.settings ?? {};
  const gitResult: GitResult =
    opts.git === undefined || opts.git === "none" || "commitAndSync" in opts.git
      ? { status: "pushed", commit: "abc1234" }
      : opts.git;
  const host: FakeHost = {
    vault,
    folders,
    notices: [],
    clipboardText: opts.clipboard ?? "",
    createPrompts: [],
    confirms: [],
    updatePrompts: [],
    picks: [],
    progress: [],
    commits: [],
    opened: [],
    settingsOpened: 0,
    settings: {
      authors: ["abucnasty"],
      commitAfterImport: true,
      templatePath: "_tools/templates/blueprint-notes.md",
      linkBase: BASE,
      ...plain,
      render: { factorioPath: "", nodePath: process.execPath, extraArgs: [], enableMods: [], modsFolder: "", afterImport: false, ...render },
    },
    today: () => "2026-11-12",
    vaultPath: opts.disk,
    processes: opts.disk === undefined ? undefined : (opts.processes ?? nodeProcessRunner),
    files: opts.disk === undefined ? memoryFiles : diskFiles(opts.disk),
    clipboard: {
      readText: async () => host.clipboardText,
      writeText: async (t) => {
        host.clipboardText = t;
      },
    },
    ui: {
      notice: (message, kind = "info") => host.notices.push({ message, kind }),
      askCreate: async (p) => {
        host.createPrompts.push(p);
        return opts.create ? opts.create(p) : { title: p.title, slug: p.slug, changeNote: "" };
      },
      askUpdate: async (p) => {
        host.updatePrompts.push(p);
        return opts.update ? opts.update(p) : { newVersion: p.suggestedVersion, changeNote: "" };
      },
      openNote: async (p) => {
        host.opened.push(p);
      },
      pick: async (items) => {
        host.picks.push(items);
        return opts.pick ? opts.pick(items) : 0;
      },
      progress: (message) => {
        host.progress.push(message);
        return { update: (m) => host.progress.push(m), close: () => host.progress.push("(closed)") };
      },
      openSettings: () => {
        host.settingsOpened++;
      },
      confirm: async (p) => {
        host.confirms.push(p);
        return opts.confirm ? opts.confirm(p) : true;
      },
    },
    git:
      opts.git === "none"
        ? undefined
        : opts.git !== undefined && "commitAndSync" in opts.git
          ? opts.git
          : {
              commitAndSync: async (folder, message, record) => {
                host.commits.push({ folder, message });
                const second = await record?.({ commit: FAKE_COMMIT, date: "2026-11-12T10:00:00Z" });
                if (second !== undefined) host.commits.push({ folder, message: second });
                return gitResult;
              },
              lfsAvailable: async () => opts.lfs ?? true,
            },
  };
  return host;
}

/** VaultFiles over a real folder. */
export function diskFiles(root: string): VaultFiles {
  const abs = (p: string) => join(root, p);
  return {
    exists: async (p) => existsSync(abs(p)),
    read: async (p) => readFileSync(abs(p), "utf8"),
    write: async (p, text) => writeFileSync(abs(p), text),
    mkdir: async (p) => void mkdirSync(abs(p), { recursive: true }),
    rename: async (from, to) => renameSync(abs(from), abs(to)),
    remove: async (p) => rmSync(abs(p), { recursive: true, force: true }),
    list: async (p) => {
      const entries = readdirSync(abs(p), { withFileTypes: true });
      const path = (n: string) => (p === "" ? n : `${p}/${n}`);
      return {
        files: entries.filter((e) => e.isFile()).map((e) => path(e.name)).sort(),
        folders: entries.filter((e) => e.isDirectory()).map((e) => path(e.name)).sort(),
      };
    },
  };
}
