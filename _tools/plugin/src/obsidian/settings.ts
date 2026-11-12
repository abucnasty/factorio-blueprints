// Plugin settings. These are saved in the plugin's data.json, which the
// vault sync commits, so they are shared by every machine. The git binary
// is per machine and lives in this vault's local storage instead.

import { App, PluginSettingTab, Setting } from "obsidian";
import type { Plugin } from "obsidian";

export interface StoredSettings {
  /** Comma-separated. */
  authors: string;
  commitAfterImport: boolean;
  templatePath: string;
}

export const DEFAULT_SETTINGS: StoredSettings = {
  authors: "",
  commitAfterImport: true,
  templatePath: "_tools/templates/blueprint-notes.md",
};

export const GIT_BINARY_KEY = "factorio-blueprints-git-binary";

export function parseAuthors(authors: string): string[] {
  return authors
    .split(",")
    .map((a) => a.trim())
    .filter((a) => a !== "");
}

export interface SettingsOwner extends Plugin {
  settings: StoredSettings;
  saveSettings(): Promise<void>;
}

export class BlueprintSettingTab extends PluginSettingTab {
  private readonly owner: SettingsOwner;

  constructor(app: App, owner: SettingsOwner) {
    super(app, owner);
    this.owner = owner;
  }

  display(): void {
    const { containerEl } = this;
    const s = this.owner.settings;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Default authors")
      .setDesc("Written to the authors field of new blueprints. Separate names with commas.")
      .addText((t) =>
        t
          .setPlaceholder("abucnasty")
          .setValue(s.authors)
          .onChange(async (v) => {
            s.authors = v;
            await this.owner.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Commit after import")
      .setDesc("After an import, commit just that blueprint folder, then pull and push.")
      .addToggle((t) =>
        t.setValue(s.commitAfterImport).onChange(async (v) => {
          s.commitAfterImport = v;
          await this.owner.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Notes template")
      .setDesc("Vault path of the README.md template for new blueprints. A built-in copy is used if it is missing.")
      .addText((t) =>
        t
          .setPlaceholder(DEFAULT_SETTINGS.templatePath)
          .setValue(s.templatePath)
          .onChange(async (v) => {
            s.templatePath = v.trim() || DEFAULT_SETTINGS.templatePath;
            await this.owner.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Git binary (this computer)")
      .setDesc("Leave empty to use git from the PATH (on a Mac, Homebrew's git if installed). Saved on this computer only.")
      .addText((t) =>
        t
          .setPlaceholder("git")
          .setValue(String(this.app.loadLocalStorage(GIT_BINARY_KEY) ?? ""))
          .onChange((v) => {
            this.app.saveLocalStorage(GIT_BINARY_KEY, v.trim() === "" ? null : v.trim());
          }),
      );
  }
}
