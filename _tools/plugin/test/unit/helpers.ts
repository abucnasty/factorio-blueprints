// A fake Host with an in-memory vault, for the command tests.

import type { CreateAnswer, CreatePrompt, Host, Settings, UpdateAnswer, UpdatePrompt } from "../../src/commands/host.ts";
import type { GitResult } from "../../src/git/commit-and-sync.ts";

export { fixture } from "./fixtures.ts";

export interface FakeHost extends Host {
  vault: Map<string, string>;
  folders: Set<string>;
  notices: { message: string; kind: string }[];
  clipboardText: string;
  createPrompts: CreatePrompt[];
  updatePrompts: UpdatePrompt[];
  commits: { folder: string; message: string }[];
  opened: string[];
}

export interface FakeOptions {
  files?: Record<string, string>;
  clipboard?: string;
  settings?: Partial<Settings>;
  create?: (p: CreatePrompt) => CreateAnswer | undefined;
  update?: (p: UpdatePrompt) => UpdateAnswer | undefined;
  git?: GitResult | "none";
}

export function fakeHost(opts: FakeOptions = {}): FakeHost {
  const vault = new Map(Object.entries(opts.files ?? {}));
  const folders = new Set<string>();
  for (const path of vault.keys()) {
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i++) folders.add(parts.slice(0, i).join("/"));
  }
  const gitResult: GitResult = opts.git === undefined || opts.git === "none" ? { status: "pushed", commit: "abc1234" } : opts.git;
  const host: FakeHost = {
    vault,
    folders,
    notices: [],
    clipboardText: opts.clipboard ?? "",
    createPrompts: [],
    updatePrompts: [],
    commits: [],
    opened: [],
    settings: {
      authors: ["abucnasty"],
      commitAfterImport: true,
      templatePath: "_tools/templates/blueprint-notes.md",
      ...opts.settings,
    },
    today: () => "2026-11-12",
    files: {
      exists: async (p) => vault.has(p) || folders.has(p),
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
    },
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
    },
    git:
      opts.git === "none"
        ? undefined
        : {
            commitAndSync: async (folder, message) => {
              host.commits.push({ folder, message });
              return gitResult;
            },
          },
  };
  return host;
}
