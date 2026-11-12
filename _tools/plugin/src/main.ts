// Obsidian entry point: registers the commands, the file explorer menu
// items and the settings tab. All behaviour lives in src/commands/, which
// runs without Obsidian; this file only finds the folder the user means.

import { Menu, Plugin, TAbstractFile, TFile, TFolder } from "obsidian";

import { copyBlueprintString } from "./commands/copy-blueprint.ts";
import type { Host } from "./commands/host.ts";
import { importFromClipboard } from "./commands/import-blueprint.ts";
import { BLUEPRINT_FILE, isScannedPath, joinPath, selfAndAncestors } from "./core/index.ts";
import { createObsidianHost } from "./obsidian/host.ts";
import { BlueprintSettingTab, DEFAULT_SETTINGS, parseAuthors } from "./obsidian/settings.ts";
import type { StoredSettings } from "./obsidian/settings.ts";

/**
 * A command that acts on a folder: the active note's folder from the
 * command palette, or the clicked folder from the file explorer.
 * The render command (a later step) is added to this list.
 */
interface FolderCommand {
  id: string;
  name: string;
  /** Text for the file explorer menu. */
  menuTitle: string;
  icon: string;
  /** Show in the file explorer menu only for blueprint folders. */
  menuOnlyInBlueprintFolder: boolean;
  run(host: Host, folder: string): Promise<unknown>;
}

const FOLDER_COMMANDS: FolderCommand[] = [
  {
    id: "import-blueprint-from-clipboard",
    name: "Import blueprint from clipboard",
    menuTitle: "Import blueprint from clipboard here",
    icon: "clipboard-paste",
    menuOnlyInBlueprintFolder: false,
    run: importFromClipboard,
  },
  {
    id: "copy-blueprint-string",
    name: "Copy blueprint string",
    menuTitle: "Copy blueprint string",
    icon: "clipboard-copy",
    menuOnlyInBlueprintFolder: true,
    run: copyBlueprintString,
  },
];

export default class FactorioBlueprintsPlugin extends Plugin {
  settings: StoredSettings = { ...DEFAULT_SETTINGS };
  private running = false;

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
    return createObsidianHost(this.app, {
      authors: parseAuthors(this.settings.authors),
      commitAfterImport: this.settings.commitAfterImport,
      templatePath: this.settings.templatePath,
    });
  }

  private async runCommand(cmd: FolderCommand, folder: string): Promise<void> {
    const host = this.host();
    if (this.running) {
      host.ui.notice("A blueprint command is still running; try again in a moment.", "error");
      return;
    }
    this.running = true;
    try {
      await cmd.run(host, folder);
    } catch (e) {
      host.ui.notice(`${cmd.name} failed: ${e instanceof Error ? e.message : String(e)}`, "error");
      console.error(e);
    } finally {
      this.running = false;
    }
  }

  /** Synchronous check for menus, from the vault index. */
  private isInBlueprintFolder(folder: string): boolean {
    return selfAndAncestors(folder).some(
      (f) => f !== "" && isScannedPath(f) && this.app.vault.getAbstractFileByPath(joinPath(f, BLUEPRINT_FILE)) instanceof TFile,
    );
  }
}

/** Vault path of the folder a file or folder stands for ("" is the root). */
function folderOf(file: TAbstractFile): string {
  const folder = file instanceof TFolder ? file : file.parent;
  return !folder || folder.isRoot() ? "" : folder.path;
}
