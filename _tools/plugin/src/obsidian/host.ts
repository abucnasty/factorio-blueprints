// The Obsidian implementation of the command Host.

import { App, FileSystemAdapter, normalizePath, Notice, TFile } from "obsidian";

import type { Host, NoticeKind, Settings } from "../commands/host.ts";
import { commitAndSync } from "../git/commit-and-sync.ts";
import { createGitRunner, defaultGitBinary, nodePathExists } from "../git/node-runner.ts";
import { CreateBlueprintModal, UpdateBlueprintModal } from "./modals.ts";
import { GIT_BINARY_KEY } from "./settings.ts";

export function createObsidianHost(app: App, settings: Settings): Host {
  const adapter = app.vault.adapter;
  const vaultDir = adapter instanceof FileSystemAdapter ? adapter.getBasePath() : undefined;
  const p = (path: string) => normalizePath(path === "" ? "/" : path);

  return {
    settings,
    today: () => localDate(new Date()),
    files: {
      exists: (path) => adapter.exists(p(path)),
      read: (path) => adapter.read(p(path)),
      async write(path, text) {
        const file = app.vault.getFileByPath(p(path));
        if (file) await app.vault.modify(file, text);
        else if (await adapter.exists(p(path))) await adapter.write(p(path), text);
        else await app.vault.create(p(path), text);
      },
      async mkdir(path) {
        if (await adapter.exists(p(path))) return;
        await app.vault.createFolder(p(path));
      },
    },
    clipboard: {
      readText: () => navigator.clipboard.readText(),
      writeText: (text) => navigator.clipboard.writeText(text),
    },
    ui: {
      notice(message: string, kind: NoticeKind = "info") {
        new Notice(message, kind === "error" ? 15_000 : 8_000);
      },
      askCreate: (prompt) => new CreateBlueprintModal(app, prompt).ask(),
      askUpdate: (prompt) => new UpdateBlueprintModal(app, prompt).ask(),
      async openNote(path) {
        // A file created a moment ago may not be indexed yet.
        for (let i = 0; i < 20; i++) {
          const file = app.vault.getAbstractFileByPath(p(path));
          if (file instanceof TFile) {
            await app.workspace.getLeaf(false).openFile(file);
            return;
          }
          await new Promise((r) => setTimeout(r, 100));
        }
      },
    },
    git:
      vaultDir === undefined
        ? undefined
        : {
            commitAndSync(folder, message) {
              const configured = app.loadLocalStorage(GIT_BINARY_KEY);
              const binary = typeof configured === "string" && configured !== "" ? configured : defaultGitBinary();
              return commitAndSync({
                run: createGitRunner(binary, vaultDir),
                pathExists: nodePathExists(vaultDir),
                folder,
                message,
              });
            },
          },
  };
}

function localDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
