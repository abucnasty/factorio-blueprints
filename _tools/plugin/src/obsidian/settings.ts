// Plugin settings. Shared ones are saved in the plugin's data.json, which
// the vault sync commits, so every machine has them. Per-machine ones (git,
// Factorio and Node paths, render options) live in this vault's local
// storage on each computer instead.

import { App, PluginSettingTab, Setting } from "obsidian";
import type { Plugin } from "obsidian";

import type { RenderSettings } from "../commands/host.ts";
import { DEFAULT_LINK_BASE } from "../core/index.ts";
import { defaultNodeBinary } from "../process/node-process.ts";

export interface StoredSettings {
  /** Comma-separated. */
  authors: string;
  commitAfterImport: boolean;
  templatePath: string;
  linkBase: string;
}

export const DEFAULT_SETTINGS: StoredSettings = {
  authors: "",
  commitAfterImport: true,
  templatePath: "_tools/templates/blueprint-notes.md",
  linkBase: DEFAULT_LINK_BASE,
};

/** Local storage keys (this computer only). */
export const LOCAL = {
  gitBinary: "factorio-blueprints-git-binary",
  factorioPath: "factorio-blueprints-factorio-path",
  nodePath: "factorio-blueprints-node-path",
  renderArgs: "factorio-blueprints-render-args",
  renderAfterImport: "factorio-blueprints-render-after-import",
} as const;

/** Kept for the git step: the same key as before. */
export const GIT_BINARY_KEY = LOCAL.gitBinary;

export function parseAuthors(authors: string): string[] {
  return authors
    .split(",")
    .map((a) => a.trim())
    .filter((a) => a !== "");
}

/** Split extra render arguments on spaces; "double quotes" keep spaces. */
export function parseArgs(text: string): string[] {
  return [...text.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2]!);
}

function localString(app: App, key: string): string {
  const v = app.loadLocalStorage(key);
  return typeof v === "string" ? v : "";
}

export function loadRenderSettings(app: App): RenderSettings {
  return {
    factorioPath: localString(app, LOCAL.factorioPath),
    nodePath: localString(app, LOCAL.nodePath) || defaultNodeBinary(),
    extraArgs: parseArgs(localString(app, LOCAL.renderArgs)),
    afterImport: app.loadLocalStorage(LOCAL.renderAfterImport) === true,
  };
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
      .setName("Commit after import and render")
      .setDesc("After an import or a render, commit just that blueprint folder, then pull and push.")
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
      .setName("Live link address")
      .setDesc("Base URL of the link service, used for copied links and the links in notes.")
      .addText((t) =>
        t
          .setPlaceholder(DEFAULT_LINK_BASE)
          .setValue(s.linkBase)
          .onChange(async (v) => {
            s.linkBase = v.trim().replace(/\/+$/, "") || DEFAULT_LINK_BASE;
            await this.owner.saveSettings();
          }),
      );

    new Setting(containerEl).setName("This computer").setHeading();
    containerEl.createEl("p", {
      text: "Saved on this computer only, not synced.",
      cls: "setting-item-description",
    });

    this.localText(
      "Git binary",
      "Leave empty to use git from the PATH (on a Mac, Homebrew's git if installed).",
      LOCAL.gitBinary,
      "git",
    );
    this.localText(
      "Factorio path",
      "The Factorio executable or install folder, for Render preview. The full game, not the headless build.",
      LOCAL.factorioPath,
      "/path/to/factorio",
    );
    this.localText(
      "Node path",
      "Node.js 22 or later, which runs the render tool. Leave empty to use node from the PATH (on a Mac, Homebrew's node if installed).",
      LOCAL.nodePath,
      "node",
    );
    this.localText(
      "Extra render arguments",
      "Added to every render, for example --show-window.",
      LOCAL.renderArgs,
      "--show-window",
    );
    new Setting(containerEl)
      .setName("Render after import")
      .setDesc("Run Render preview right after each import (a second commit). Needs the Factorio path.")
      .addToggle((t) =>
        t
          .setValue(this.app.loadLocalStorage(LOCAL.renderAfterImport) === true)
          .onChange((v) => this.app.saveLocalStorage(LOCAL.renderAfterImport, v ? true : null)),
      );
  }

  private localText(name: string, desc: string, key: string, placeholder: string): void {
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(desc)
      .addText((t) =>
        t
          .setPlaceholder(placeholder)
          .setValue(localString(this.app, key))
          .onChange((v) => this.app.saveLocalStorage(key, v.trim() === "" ? null : v.trim())),
      );
  }
}
