// The two import dialogs. Each resolves once: with the answer, or with
// undefined when closed or cancelled.

import { App, Modal, Setting, SuggestModal } from "obsidian";

import type { BookChoices, BookReview, CreateAnswer, CreatePrompt, PickItem, TextPrompt, UpdateAnswer, UpdatePrompt } from "../commands/host.ts";
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

/** Quick picker: resolves the chosen item's index, or undefined if dismissed. */
export class PickModal extends SuggestModal<number> {
  private readonly items: PickItem[];
  private resolve: ((index: number | undefined) => void) | undefined;
  private chosen: number | undefined;

  constructor(app: App, items: PickItem[], placeholder: string) {
    super(app);
    this.items = items;
    this.setPlaceholder(placeholder);
  }

  ask(): Promise<number | undefined> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.open();
    });
  }

  getSuggestions(query: string): number[] {
    const q = query.trim().toLowerCase();
    return this.items
      .map((_, i) => i)
      .filter((i) => q === "" || `${this.items[i]!.label} ${this.items[i]!.detail ?? ""}`.toLowerCase().includes(q));
  }

  renderSuggestion(index: number, el: HTMLElement): void {
    const item = this.items[index]!;
    el.createEl("div", { text: item.label });
    if (item.detail) el.createEl("small", { text: item.detail, cls: "setting-item-description" });
  }

  onChooseSuggestion(index: number): void {
    this.chosen = index;
  }

  onClose(): void {
    super.onClose();
    // onChooseSuggestion runs around close; settle after both.
    setTimeout(() => this.resolve?.(this.chosen), 0);
  }
}

/** One text field with a live check. */
export class TextModal extends AnswerModal<string> {
  private readonly prompt: TextPrompt;

  constructor(app: App, prompt: TextPrompt) {
    super(app);
    this.prompt = prompt;
  }

  onOpen(): void {
    const p = this.prompt;
    let value = p.value;
    this.titleEl.setText(p.title);
    this.contentEl.createEl("p", { text: p.description });
    new Setting(this.contentEl).setName(p.label).addText((t) => {
      t.setValue(value).onChange((v) => {
        value = v;
        void show();
      });
      t.inputEl.style.width = "100%";
    });
    const problemEl = this.contentEl.createEl("p", { cls: "mod-warning" });
    const show = async () => {
      const problem = await p.check(value);
      problemEl.setText(problem ?? "");
      return problem;
    };
    void show();
    this.buttons(p.okText, () => {
      void show().then((problem) => {
        if (problem === undefined) this.finish(value);
      });
    });
  }
}

/** The one review before a book import: counts, rows, a choice per unmatched entry. */
export class BookReviewModal extends AnswerModal<BookChoices> {
  private readonly review: BookReview;

  constructor(app: App, review: BookReview) {
    super(app);
    this.review = review;
  }

  onOpen(): void {
    const { plan } = this.review;
    const choices: BookChoices = {};
    this.titleEl.setText(this.review.title);
    const c = plan.counts;
    this.contentEl.createEl("p", {
      text:
        `${c.new} new, ${c.update} to update, ${c.unchanged} unchanged` +
        (c.choose > 0 ? `, ${c.choose} to decide` : "") +
        (plan.categories.length > 0 ? `; ${plan.categories.length} category folder${plan.categories.length === 1 ? "" : "s"} for the nested books` : "") +
        ".",
    });
    const rel = (path: string) => (path.startsWith(plan.target + "/") ? path.slice(plan.target.length + 1) : path);
    const list = this.contentEl.createDiv();
    list.style.maxHeight = "50vh";
    list.style.overflowY = "auto";
    for (const e of plan.entries) {
      if (e.status === "unchanged") continue;
      const row = new Setting(list).setName(`${e.title}`).setDesc(`slot ${e.path}`);
      if (e.status === "new") row.setDesc(`slot ${e.path} · new: ${rel(e.newPath!)}`);
      else if (e.status === "update") row.setDesc(`slot ${e.path} · update: ${rel(e.folder!)}`);
      else {
        choices[e.path] = null;
        row.setDesc(`slot ${e.path} · not found by content or name`);
        row.addDropdown((d) => {
          d.addOption("", `Create new: ${rel(e.newPath!)}`);
          for (const f of e.candidates ?? []) d.addOption(f, `Update: ${rel(f)}`);
          d.onChange((v) => (choices[e.path] = v === "" ? null : v));
        });
      }
    }
    if (plan.unmatched.length > 0) {
      this.contentEl.createEl("p", { text: "Not in this book (left alone):" });
      const ul = this.contentEl.createEl("ul");
      for (const f of plan.unmatched) ul.createEl("li", { text: rel(f) });
    }
    const problemEl = this.contentEl.createEl("p", { cls: "mod-warning" });
    this.buttons("Apply", () => {
      const picked = Object.values(choices).filter((v): v is string => v !== null);
      if (new Set(picked).size !== picked.length) {
        problemEl.setText("The same folder is chosen for more than one entry.");
        return;
      }
      this.finish({ ...choices });
    });
  }
}
