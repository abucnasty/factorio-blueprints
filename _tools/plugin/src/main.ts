// Obsidian entry point: registers the commands, the file explorer menu
// items and the settings tab. All behaviour lives in src/commands/, which
// runs without Obsidian; this file only finds the folder the user means.

import { Menu, Plugin, TAbstractFile, TFile, TFolder } from "obsidian";

import { copyBlueprintString } from "./commands/copy-blueprint.ts";
import { copyLiveLink } from "./commands/copy-link.ts";
import { refreshAllGeneratedBlocks } from "./commands/generated-notes.ts";
import type { Host } from "./commands/host.ts";
import { importFromClipboard } from "./commands/import-blueprint.ts";
import { expandBookIntoFolders } from "./commands/expand-book.ts";
import { renderPreview } from "./commands/render-preview.ts";
import { cancelRenderAll, folderRenderState, renderAllNeeded, showFoldersNeedingRender } from "./commands/render-status.ts";
import { BLUEPRINT_FILE, BOOK_FILE, isScannedPath, joinPath, RENDER_MANIFEST, renderStateLabel, selfAndAncestors } from "./core/index.ts";
import { createObsidianHost } from "./obsidian/host.ts";
import { BlueprintSettingTab, DEFAULT_SETTINGS, loadRenderSettings, parseAuthors } from "./obsidian/settings.ts";
import type { StoredSettings } from "./obsidian/settings.ts";

/**
 * A command that acts on a folder: the active note's folder from the
 * command palette, or the clicked folder from the file explorer.
 */
interface FolderCommand {
  id: string;
  name: string;
  /** Text for the file explorer menu. */
  menuTitle: string;
  icon: string;
  /** Show in the file explorer menu only for blueprint folders. */
  menuOnlyInBlueprintFolder: boolean;
  /**
   * Runs alone: no other exclusive command meanwhile. Render is not
   * exclusive (it takes long and allows one render at a time itself).
   */
  exclusive: boolean;
  run(host: Host, folder: string): Promise<unknown>;
}

const FOLDER_COMMANDS: FolderCommand[] = [
  {
    id: "import-blueprint-from-clipboard",
    name: "Import blueprint from clipboard",
    menuTitle: "Import blueprint from clipboard here",
    icon: "clipboard-paste",
    menuOnlyInBlueprintFolder: false,
    exclusive: true,
    run: importFromClipboard,
  },
  {
    id: "expand-book-into-folders",
    name: "Expand book into folders",
    menuTitle: "Expand book into folders",
    icon: "folder-tree",
    menuOnlyInBlueprintFolder: true,
    exclusive: true,
    run: expandBookIntoFolders,
  },
  {
    id: "copy-blueprint-string",
    name: "Copy blueprint string",
    menuTitle: "Copy blueprint string",
    icon: "clipboard-copy",
    menuOnlyInBlueprintFolder: true,
    exclusive: true,
    run: copyBlueprintString,
  },
  {
    id: "copy-live-link",
    name: "Copy live link",
    menuTitle: "Copy live link",
    icon: "link",
    menuOnlyInBlueprintFolder: true,
    exclusive: false,
    run: copyLiveLink,
  },
  {
    id: "render-preview",
    name: "Render preview",
    menuTitle: "Render preview",
    icon: "image",
    menuOnlyInBlueprintFolder: true,
    exclusive: false,
    run: (host, folder) => renderPreview(host, folder),
  },
];

export default class FactorioBlueprintsPlugin extends Plugin {
  settings: StoredSettings = { ...DEFAULT_SETTINGS };
  private running = false;
  private statusEl: HTMLElement | undefined;
  private statusFolder: string | undefined;
  private statusCache = new Map<string, { key: string; label: string }>();
  private statusTimer: number | undefined;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new BlueprintSettingTab(this.app, this));

    for (const cmd of FOLDER_COMMANDS) {
      this.addCommand({
        id: cmd.id,
        name: cmd.name,
        icon: cmd.icon,
        callback: () => {
          const file = this.app.workspace.getActiveFile();
          if (!file) {
            this.host().ui.notice(
              "Open a note in the folder first, or right-click the folder in the file explorer.",
              "error",
            );
            return;
          }
          void this.runCommand(cmd, folderOf(file));
        },
      });
    }

    this.addCommand({
      id: "cancel-render-preview",
      name: "Cancel render preview",
      icon: "square",
      callback: () => {
        if (!cancelRenderAll()) this.host().ui.notice("No render is running.");
      },
    });

    this.addCommand({
      id: "show-blueprints-needing-render",
      name: "Show blueprints needing a render",
      icon: "list-checks",
      callback: () => void this.runExclusive((host) => showFoldersNeedingRender(host)),
    });

    this.addCommand({
      id: "render-all-needing-render",
      name: "Render all that need it",
      icon: "images",
      callback: () => void this.runExclusive((host) => renderAllNeeded(host)),
    });

    // Status bar: the render state of the active note's blueprint folder.
    this.statusEl = this.addStatusBarItem();
    this.statusEl.addClass("mod-clickable");
    this.statusEl.setAttribute("aria-label", "Render preview (only what is missing or outdated)");
    this.statusEl.hide();
    this.registerDomEvent(this.statusEl, "click", () => {
      if (this.statusFolder === undefined) return;
      void renderPreview(this.host(), this.statusFolder, { onlyNeeded: true }).finally(() => this.scheduleStatus());
    });
    this.registerEvent(this.app.workspace.on("file-open", () => this.scheduleStatus()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.scheduleStatus()));
    for (const event of ["create", "delete", "modify", "rename"] as const) {
      this.registerEvent(
        this.app.vault.on(event as "create", (file: TAbstractFile) => {
          if (this.statusFolder !== undefined && file.path.startsWith(this.statusFolder + "/")) this.scheduleStatus();
        }),
      );
    }
    this.app.workspace.onLayoutReady(() => this.scheduleStatus());

    this.addCommand({
      id: "refresh-generated-blocks",
      name: "Refresh generated content in all notes",
      icon: "refresh-cw",
      callback: () => {
        const host = this.host();
        if (this.running) {
          host.ui.notice("A blueprint command is still running; try again in a moment.", "error");
          return;
        }
        this.running = true;
        void refreshAllGeneratedBlocks(host)
          .catch((e) => host.ui.notice(`Refreshing generated content failed: ${e instanceof Error ? e.message : String(e)}`, "error"))
          .finally(() => (this.running = false));
      },
    });

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu: Menu, file: TAbstractFile) => {
        const folder = folderOf(file);
        const inBlueprint = this.isInBlueprintFolder(folder);
        for (const cmd of FOLDER_COMMANDS) {
          if (cmd.menuOnlyInBlueprintFolder && !inBlueprint) continue;
          menu.addItem((item) =>
            item
              .setTitle(cmd.menuTitle)
              .setIcon(cmd.icon)
              .onClick(() => void this.runCommand(cmd, folder)),
          );
        }
      }),
    );
  }

  async loadSettings(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) as Partial<StoredSettings> | null) };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private host(): Host {
    return createObsidianHost(
      this.app,
      {
        authors: parseAuthors(this.settings.authors),
        commitAfterImport: this.settings.commitAfterImport,
        templatePath: this.settings.templatePath,
        linkBase: this.settings.linkBase || DEFAULT_SETTINGS.linkBase,
        render: loadRenderSettings(this.app),
      },
      () => this.openSettings(),
    );
  }

  /** Obsidian has no public API to open a plugin's settings tab. */
  private openSettings(): void {
    const setting = (this.app as unknown as { setting?: { open(): void; openTabById(id: string): void } }).setting;
    try {
      setting?.open();
      setting?.openTabById(this.manifest.id);
    } catch {
      // the notice already says where to go
    }
  }

  private async runExclusive(fn: (host: Host) => Promise<unknown>): Promise<void> {
    const host = this.host();
    if (this.running) {
      host.ui.notice("A blueprint command is still running; try again in a moment.", "error");
      return;
    }
    this.running = true;
    try {
      await fn(host);
    } catch (e) {
      host.ui.notice(`Failed: ${e instanceof Error ? e.message : String(e)}`, "error");
      console.error(e);
    } finally {
      this.running = false;
      this.scheduleStatus();
    }
  }

  /** Update the status bar soon (debounced: saves come in bursts). */
  private scheduleStatus(): void {
    if (this.statusTimer !== undefined) window.clearTimeout(this.statusTimer);
    this.statusTimer = window.setTimeout(() => {
      this.statusTimer = undefined;
      void this.updateStatus();
    }, 300);
  }

  private async updateStatus(): Promise<void> {
    const el = this.statusEl;
    if (!el) return;
    const file = this.app.workspace.getActiveFile();
    const folder = file ? this.blueprintFolderOf(folderOf(file)) : undefined;
    this.statusFolder = folder;
    if (folder === undefined) {
      el.hide();
      return;
    }
    try {
      // Hashing a big book takes a moment: reuse the answer until something changes.
      const adapter = this.app.vault.adapter;
      const stat = async (p: string) => {
        const s = await adapter.stat(p);
        return s ? `${s.mtime}:${s.size}` : "-";
      };
      const host = this.host();
      const rendersDir = joinPath(folder, "renders");
      const key = [
        await stat(joinPath(folder, BLUEPRINT_FILE)),
        await stat(joinPath(rendersDir, RENDER_MANIFEST)),
        (await host.files.exists(rendersDir)) ? JSON.stringify(await adapter.list(rendersDir)) : "",
      ].join("|");
      // An expanded book sums its leaves: not cached (its files are spread over the tree).
      const isBook = await host.files.exists(joinPath(folder, BOOK_FILE));
      let cached = isBook ? undefined : this.statusCache.get(folder);
      if (cached?.key !== key) {
        cached = { key, label: renderStateLabel(await folderRenderState(host, folder)) };
        this.statusCache.set(folder, cached);
      }
      if (this.statusFolder !== folder) return; // the user moved on meanwhile
      el.setText(cached.label);
      el.show();
    } catch {
      el.hide();
    }
  }

  private blueprintFolderOf(folder: string): string | undefined {
    return selfAndAncestors(folder).find(
      (f) =>
        f !== "" &&
        isScannedPath(f) &&
        [BLUEPRINT_FILE, BOOK_FILE].some((name) => this.app.vault.getAbstractFileByPath(joinPath(f, name)) instanceof TFile),
    );
  }

  private async runCommand(cmd: FolderCommand, folder: string): Promise<void> {
    const host = this.host();
    if (cmd.exclusive && this.running) {
      host.ui.notice("A blueprint command is still running; try again in a moment.", "error");
      return;
    }
    if (cmd.exclusive) this.running = true;
    try {
      await cmd.run(host, folder);
    } catch (e) {
      host.ui.notice(`${cmd.name} failed: ${e instanceof Error ? e.message : String(e)}`, "error");
      console.error(e);
    } finally {
      if (cmd.exclusive) this.running = false;
      this.scheduleStatus();
    }
  }

  /** Synchronous check for menus, from the vault index. */
  private isInBlueprintFolder(folder: string): boolean {
    return this.blueprintFolderOf(folder) !== undefined;
  }
}

/** Vault path of the folder a file or folder stands for ("" is the root). */
function folderOf(file: TAbstractFile): string {
  const folder = file instanceof TFolder ? file : file.parent;
  return !folder || folder.isRoot() ? "" : folder.path;
}
