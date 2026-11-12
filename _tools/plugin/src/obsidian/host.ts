// The Obsidian implementation of the command Host.

import { App, FileSystemAdapter, normalizePath, Notice, TFile } from "obsidian";

import type { Host, NoticeKind, Settings } from "../commands/host.ts";
import { commitAndSync, lfsAvailable } from "../git/commit-and-sync.ts";
import { createGitRunner, defaultGitBinary, nodePathExists } from "../git/node-runner.ts";
import { processRunnerForThisApp } from "../process/flatpak.ts";
import { BookReviewModal, CreateBlueprintModal, PickModal, TextModal, UpdateBlueprintModal } from "./modals.ts";
import { GIT_BINARY_KEY } from "./settings.ts";

export function createObsidianHost(app: App, settings: Settings, openSettings?: () => void): Host {
  const adapter = app.vault.adapter;
  const vaultDir = adapter instanceof FileSystemAdapter ? adapter.getBasePath() : undefined;
  const p = (path: string) => normalizePath(path === "" ? "/" : path);
  const gitRunner = (dir: string) => {
    const configured = app.loadLocalStorage(GIT_BINARY_KEY);
    const binary = typeof configured === "string" && configured !== "" ? configured : defaultGitBinary();
    return createGitRunner(binary, dir);
  };

  return {
    settings,
    today: () => localDate(new Date()),
    vaultPath: vaultDir,
    processes: vaultDir === undefined ? undefined : processRunnerForThisApp(),
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
      async list(path) {
        const listed = await adapter.list(p(path));
        // The adapter lists "/"-rooted paths for the root on some versions.
        const clean = (x: string) => x.replace(/^\/+/, "");
        return { files: listed.files.map(clean), folders: listed.folders.map(clean) };
      },
      async rename(from, to) {
        const file = app.vault.getAbstractFileByPath(p(from));
        if (file) await app.fileManager.renameFile(file, p(to));
        else await adapter.rename(p(from), p(to));
      },
      async remove(path) {
        const stat = await adapter.stat(p(path));
        if (!stat) return;
        if (stat.type === "folder") await adapter.rmdir(p(path), true);
        else await adapter.remove(p(path));
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
      askText: (prompt) => new TextModal(app, prompt).ask(),
      reviewBookImport: (review) => new BookReviewModal(app, review).ask(),
      pick: (items, placeholder) => new PickModal(app, items, placeholder).ask(),
      progress(message) {
        const notice = new Notice(message, 0);
        return {
          update: (m) => notice.setMessage(m),
          close: () => notice.hide(),
        };
      },
      openSettings,
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
            lfsAvailable: () => lfsAvailable(gitRunner(vaultDir)),
            commitAndSync(folder, message) {
              return commitAndSync({
                run: gitRunner(vaultDir),
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
