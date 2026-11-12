// The two import dialogs. Each resolves once: with the answer, or with
// undefined when closed or cancelled.

import { App, Modal, Setting } from "obsidian";

import type { CreateAnswer, CreatePrompt, UpdateAnswer, UpdatePrompt } from "../commands/host.ts";
import { slugify } from "../core/index.ts";

abstract class AnswerModal<T> extends Modal {
  private resolve: ((answer: T | undefined) => void) | undefined;
  private answered = false;

  ask(): Promise<T | undefined> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.open();
    });
  }

  protected finish(answer: T | undefined): void {
    if (this.answered) return;
    this.answered = true;
    this.resolve?.(answer);
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.answered) {
      this.answered = true;
      this.resolve?.(undefined);
    }
  }

  protected buttons(okText: string, onOk: () => void): void {
    new Setting(this.contentEl)
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.finish(undefined)))
      .addButton((b) => b.setButtonText(okText).setCta().onClick(onOk));
    this.scope.register([], "Enter", (evt) => {
      evt.preventDefault();
      onOk();
      return false;
    });
  }
}

export class CreateBlueprintModal extends AnswerModal<CreateAnswer> {
  private readonly prompt: CreatePrompt;

  constructor(app: App, prompt: CreatePrompt) {
    super(app);
    this.prompt = prompt;
  }

  onOpen(): void {
    const p = this.prompt;
    let title = p.title;
    let slug = p.slug;
    let slugEdited = false;
    let note = "";
    let busy = false;
    let slugInput: { setValue(v: string): unknown } | undefined;

    this.titleEl.setText("Import new blueprint");
    this.contentEl.createEl("p", { text: `Importing ${p.summary}.` });

    new Setting(this.contentEl)
      .setName("Title")
      .setDesc("Shown in the notes and the catalog.")
      .addText((t) =>
        t.setValue(title).onChange((v) => {
          title = v;
          if (!slugEdited) {
            slug = slugify(v);
            slugInput?.setValue(slug);
            void showProblem();
          }
        }),
      );

    new Setting(this.contentEl)
      .setName("Folder name")
      .setDesc(`Created in ${p.parent === "" ? "the vault root" : p.parent}/.`)
      .addText((t) => {
        slugInput = t;
        t.setValue(slug).onChange((v) => {
          slug = v.trim();
          slugEdited = true;
          void showProblem();
        });
      });
    const problemEl = this.contentEl.createEl("p", { cls: "mod-warning" });
    const showProblem = async () => {
      const problem = await p.checkSlug(slug);
      problemEl.setText(problem ?? "");
      return problem;
    };
    void showProblem();

    if (p.askChangeNote) {
      new Setting(this.contentEl)
        .setName("Change note")
        .setDesc("Optional, one line. Used as the commit message.")
        .addText((t) => t.setPlaceholder(`add ${title}`).onChange((v) => (note = v)));
    }

    this.buttons("Import", () => {
      if (busy) return;
      busy = true;
      void showProblem().then((problem) => {
        busy = false;
        if (problem === undefined) this.finish({ title: title.trim(), slug, changeNote: note });
      });
    });
  }
}

export class UpdateBlueprintModal extends AnswerModal<UpdateAnswer> {
  private readonly prompt: UpdatePrompt;

  constructor(app: App, prompt: UpdatePrompt) {
    super(app);
    this.prompt = prompt;
  }

  onOpen(): void {
    const p = this.prompt;
    let bump = p.canBumpVersion && p.suggestedVersion !== undefined;
    let version = p.suggestedVersion ?? p.currentVersion ?? "";
    let note = "";

    this.titleEl.setText(`Update ${p.title}`);
    this.contentEl.createEl("p", { text: `Replace the blueprint in ${p.folder}/.` });
    const list = this.contentEl.createEl("ul");
    list.createEl("li", { text: `Now: ${p.previousSummary ?? "unreadable blueprint.json"}` });
    list.createEl("li", { text: `New: ${p.summary}` });
    this.contentEl.createEl("p", { text: "The notes are not changed, apart from the version if you bump it." });

    if (p.canBumpVersion) {
      new Setting(this.contentEl)
        .setName("Bump version")
        .setDesc(`Current version: ${p.currentVersion ?? "none"}. New version:`)
        .addToggle((t) => t.setValue(bump).onChange((v) => (bump = v)))
        .addText((t) => t.setValue(version).onChange((v) => (version = v.trim())));
    }

    if (p.askChangeNote) {
      new Setting(this.contentEl)
        .setName("Change note")
        .setDesc("Optional, one line. Used as the commit message.")
        .addText((t) => t.setPlaceholder(`update ${p.title}`).onChange((v) => (note = v)));
    }

    this.buttons("Update", () =>
      this.finish({ newVersion: bump && version !== "" ? version : undefined, changeNote: note }),
    );
  }
}
