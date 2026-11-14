import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  applyGeneratedBlock,
  bookTree,
  coverUrl,
  decodeBlueprintString,
  displayLabel,
  encodePath,
  escapeInline,
  findGeneratedBlock,
  findNode,
  flattenTree,
  generatedBlockLines,
  renderUrl,
  stringUrl,
} from "../../src/core/index.ts";
import { fixture } from "./fixtures.ts";

const BASE = "https://blueprints.abucnasty.dev";
const F = "megabasing/science/mall";
const u = (slots: string) => `${BASE}/${F}/${slots}.txt`;

const bp = (label?: string) => ({ blueprint: { item: "blueprint", ...(label === undefined ? {} : { label }), entities: [] } });
const book = (label: string | undefined, entries: unknown[]) => ({
  blueprint_book: { item: "blueprint-book", ...(label === undefined ? {} : { label }), blueprints: entries },
});

function block(value: unknown, hasRenders = false, title = "Mall"): string[] | undefined {
  return generatedBlockLines({ base: BASE, folder: F, title, tree: bookTree(value)!, hasRenders });
}

describe("book tree", () => {
  test("slots from index, falling back to array position, in slot order", () => {
    const tree = bookTree(book("Root", [
      { index: 5, ...bp("five") },
      bp("no index, position 1"),
      { index: 0, ...book("inner", [{ index: 3, ...bp("deep") }, bp()]) },
    ]))!;
    assert.equal(tree.path, "");
    assert.deepStrictEqual(tree.children.map((c) => c.slot), [0, 1, 5]);
    assert.deepStrictEqual(flattenTree(tree).map((n) => n.path), ["", "0", "0/1", "0/3", "1", "5"]);
    assert.equal(findNode(tree, [0, 3])!.label, "deep");
    assert.equal(displayLabel(findNode(tree, [0, 1])!), "Blueprint (slot 1)");
    assert.equal(findNode(tree, [9]), undefined);
  });

  test("kinds, plain labels and the nested fixture", () => {
    const tree = bookTree(decodeBlueprintString(fixture("book-nested.txt")).value)!;
    assert.equal(tree.label, "Military Science Pack (240/s) V3");
    assert.deepStrictEqual(
      flattenTree(tree).map((n) => [n.path, n.kind, displayLabel(n)]),
      [
        ["", "blueprint-book", "Military Science Pack (240/s) V3"],
        ["0", "blueprint", "Concrete pad"],
        ["1", "blueprint-book", "Inner book"],
        ["1/0", "blueprint", "Wired lamps"],
        ["1/1", "deconstruction-planner", "Trees only"],
        ["2", "upgrade-planner", "Belts to turbo"],
      ],
    );
    assert.equal(bookTree({ nope: 1 }), undefined);
    assert.equal(bookTree(bp("x"))!.children.length, 0);
  });

  test("unlabeled entries name their kind and slot", () => {
    const tree = bookTree(book(undefined, [
      { index: 0, ...bp() },
      { index: 1, ...book(undefined, []) },
      { index: 2, upgrade_planner: { item: "upgrade-planner" } },
      { index: 3, deconstruction_planner: { item: "deconstruction-planner", label: "  " } },
    ]))!;
    assert.deepStrictEqual(tree.children.map(displayLabel), [
      "Blueprint (slot 0)",
      "Book (slot 1)",
      "Upgrade planner (slot 2)",
      "Deconstruction planner (slot 3)",
    ]);
    assert.equal(displayLabel(tree), "Book");
  });
});

describe("links", () => {
  test("root, entry, version and cover", () => {
    assert.equal(stringUrl(BASE, F), `${BASE}/${F}.txt`);
    assert.equal(stringUrl(BASE + "/", F, [3, 1]), `${BASE}/${F}/3/1.txt`);
    assert.equal(stringUrl(BASE, F, [], "1.2"), `${BASE}/${F}@1.2.txt`);
    assert.equal(stringUrl(BASE, F, [0], "MK 2 (beta)"), `${BASE}/${F}/0@MK%202%20%28beta%29.txt`);
    assert.equal(coverUrl(BASE, F), `${BASE}/${F}/cover.jpg`);
    assert.equal(renderUrl(BASE, F, "3/1.jpg"), `${BASE}/${F}/renders/3/1.jpg`);
  });

  test("segments are percent-encoded", () => {
    assert.equal(encodePath("odd cat/a#b?c/é@x/"), "odd%20cat/a%23b%3Fc/%C3%A9%40x");
    assert.equal(stringUrl(BASE, "odd cat/(x)"), `${BASE}/odd%20cat/%28x%29.txt`);
  });

  test("bad input is refused", () => {
    assert.throws(() => stringUrl(BASE, ""));
    assert.throws(() => stringUrl(BASE, F, [-1]));
    assert.throws(() => stringUrl(BASE, F, [1.5]));
    assert.throws(() => stringUrl(BASE, F, [], "a/b"));
    assert.throws(() => stringUrl(BASE, F, [], " 1.0"));
  });
});

describe("block text", () => {
  test("single blueprint: no block without renders, cover only with", () => {
    assert.equal(block(bp("x")), undefined);
    assert.deepStrictEqual(block(bp("x"), true), [`![Mall](${BASE}/${F}/cover.jpg)`]);
    assert.equal(block({ upgrade_planner: { label: "p" } }), undefined);
  });

  test("flat book, with and without renders", () => {
    const value = book("B", [{ index: 0, ...bp("A") }, { index: 2, ...bp("C") }]);
    assert.deepStrictEqual(block(value), [`- [A](${u("0")})`, `- [C](${u("2")})`]);
    assert.deepStrictEqual(block(value, true), [
      `![Mall](${BASE}/${F}/cover.jpg)`,
      "",
      `- [A](${u("0")})`,
      `- [C](${u("2")})`,
    ]);
    assert.equal(block(book("empty", [])), undefined);
  });

  test("nested books and planners", () => {
    const value = decodeBlueprintString(fixture("book-nested.txt")).value;
    assert.deepStrictEqual(block(value), [
      `- [Concrete pad](${u("0")})`,
      `- Inner book ([book](${u("1")}))`,
      `  - [Wired lamps](${u("1/0")})`,
      `  - [Trees only](${u("1/1")})`,
      `- [Belts to turbo](${u("2")})`,
    ]);
    const deep = book("r", [{ index: 3, ...book("a", [{ index: 1, ...book(undefined, [bp("leaf")]) }]) }]);
    assert.deepStrictEqual(block(deep), [
      `- a ([book](${u("3")}))`,
      `  - Book (slot 1) ([book](${u("3/1")}))`,
      `    - [leaf](${u("3/1/0")})`,
    ]);
  });

  test("hostile labels stay plain text on one line", () => {
    const labels = [
      "[evil](https://x.example) <img src=x onerror=alert(1)> **b** `c`",
      "- not a list\nsecond line",
      "1. not ordered",
      "# heading #tag ![[embed]] %%c%% ==hl== $x$ ~~s~~ a|b &amp; \\",
      "[item=iron-plate] [color=red]Red[/color] Mall",
      "-->",
    ];
    const value = book("B", labels.map((label, index) => ({ index, ...bp(label) })));
    const lines = block(value, true, "<b>Title</b> ]](x)")!;
    assert.equal(lines[0], `![\\<b\\>Title\\</b\\> \\]\\](x)](${BASE}/${F}/cover.jpg)`);
    const items = lines.slice(2);
    assert.equal(items.length, labels.length);
    for (const [i, line] of items.entries()) {
      assert.ok(line.startsWith("- ["), line);
      assert.ok(line.endsWith(`](${u(String(i))})`), line);
      const text = line.slice(3, line.length - `](${u(String(i))})`.length);
      assert.ok(!/(^|[^\\])[[\]<>`*|$~=%#!&]/.test(text), `unescaped markup in: ${text}`);
    }
    assert.equal(items[1], `- [\\- not a list second line](${u("1")})`);
    assert.equal(items[2], `- [1\\. not ordered](${u("2")})`);
    assert.equal(items[4], `- [Iron Plate Red Mall](${u("4")})`);
    assert.equal(escapeInline("-->"), "\\--\\>");
    // The plugin recognises its own block again, however odd the labels.
    const body = `\n${lines.join("\n")}\n\nOwner.\n`;
    assert.deepStrictEqual(findGeneratedBlock(body), { start: 1, end: body.length - "\nOwner.\n".length });
    const nested = block(book("r", [{ index: 0, ...book("a ] (b) [book](x)", [bp("[c]")]) }]), true, "T")!;
    const nestedBody = `${nested.join("\n")}\nOwner.\n`;
    assert.equal(findGeneratedBlock(nestedBody)!.end, nestedBody.length - "Owner.\n".length);
  });
});

describe("applying the block", () => {
  const lines = [`![Mall](${BASE}/${F}/cover.jpg)`, "", `- [A](${u("0")})`, `- Inner ([book](${u("1")}))`, `  - [B](${u("1/0")})`];
  const blockText = lines.join("\n");
  const FM = '---\ntitle: Mall\nauthors: []\nversion: "1"\nposted: 2026-11-12\n---\n';
  const OLD_START = "<!-- blueprint:generated:start -->";
  const OLD_END = "<!-- blueprint:generated:end -->";

  test("empty body: insert, idempotent, remove", () => {
    const r = applyGeneratedBlock(FM, lines);
    assert.equal(r.status, "inserted");
    assert.equal(r.text, `${FM}\n${blockText}\n`);
    assert.deepStrictEqual(applyGeneratedBlock(r.text, lines), { status: "unchanged", text: r.text });
    assert.deepStrictEqual(applyGeneratedBlock(r.text, undefined), { status: "removed", text: FM });
  });

  test("hand-written body is kept, one blank line between", () => {
    for (const body of ["\nMy notes.\n\n- a list\n", "Straight after the frontmatter.\n", "\n\n\nspaced\n"]) {
      const r = applyGeneratedBlock(FM + body, lines);
      assert.equal(r.status, "inserted");
      assert.equal(r.text, `${FM}\n${blockText}\n\n${body.replace(/^\n+/, "")}`);
      assert.equal(applyGeneratedBlock(r.text, lines).status, "unchanged");
      assert.equal(applyGeneratedBlock(r.text, undefined).text, `${FM}\n${body.replace(/^\n+/, "")}`);
    }
  });

  test("an existing block is replaced; the text below stays", () => {
    const old = [`![Old](${BASE}/${F}/cover.jpg)`, "", `- [Gone](${u("7")})`].join("\n");
    const r = applyGeneratedBlock(`${FM}\n${old}\n\nOutro.\n\nMore.\n`, lines);
    assert.equal(r.status, "replaced");
    assert.equal(r.text, `${FM}\n${blockText}\n\nOutro.\n\nMore.\n`);
    const smaller = applyGeneratedBlock(r.text, [`- [A](${u("0")})`]);
    assert.equal(smaller.text, `${FM}\n- [A](${u("0")})\n\nOutro.\n\nMore.\n`);
  });

  test("recognised: cover only, list only, both, nested books", () => {
    const body = (b: string) => `\n${b}\n\nOwner text.\n`;
    const cases = [
      `![T](${BASE}/${F}/cover.jpg)`,
      `- [A](${u("0")})\n- [B](${u("1")})`,
      blockText,
      `- Outer ([book](${u("3")}))\n  - Inner \\(x\\) ([book](${u("3/1")}))\n    - [Leaf \\[1\\]](${u("3/1/0")})`,
    ];
    for (const b of cases) {
      const found = findGeneratedBlock(body(b));
      assert.ok(found, b);
      assert.equal(body(b).slice(found.start, found.end), b + "\n");
      assert.equal(applyGeneratedBlock(FM + body(b), [`- [N](${u("0")})`]).text, `${FM}\n- [N](${u("0")})\n\nOwner text.\n`);
    }
  });

  test("a block written with another base URL and folder path is still found", () => {
    const old = `![X](http://old.example/other/place/cover.jpg)\n\n- [A](http://old.example/other/place/0.txt)`;
    const r = applyGeneratedBlock(`${FM}\n${old}\n\nMine.\n`, lines);
    assert.equal(r.text, `${FM}\n${blockText}\n\nMine.\n`);
  });

  test("the owner's own image at the top is not the cover", () => {
    for (const img of ["![me](https://example.com/photo.jpg)", "![a](cover.jpg)", "![a](https://x.example/cover.jpg) and text"]) {
      const note = `${FM}\n${img}\n\nText.\n`;
      assert.equal(findGeneratedBlock(note.slice(FM.length)), undefined, img);
      assert.equal(applyGeneratedBlock(note, lines).text, `${FM}\n${blockText}\n\n${img}\n\nText.\n`);
    }
  });

  test("the owner's list right after the generated list is kept", () => {
    const note = `${FM}\n${blockText}\n- my own item\n- [a link](https://example.com/page)\n`;
    const r = applyGeneratedBlock(note, lines);
    assert.equal(r.text, `${FM}\n${blockText}\n\n- my own item\n- [a link](https://example.com/page)\n`);
    assert.equal(applyGeneratedBlock(r.text, lines).status, "unchanged");
  });

  test("the owner's paragraph directly under the list gets a blank line", () => {
    const r = applyGeneratedBlock(`${FM}\n${blockText}\nRight under.\n`, lines);
    assert.equal(r.text, `${FM}\n${blockText}\n\nRight under.\n`);
  });

  test("nothing to add and no block: unchanged", () => {
    assert.deepStrictEqual(applyGeneratedBlock(FM + "x\n", undefined), { status: "unchanged", text: FM + "x\n" });
    assert.deepStrictEqual(applyGeneratedBlock(FM + "\n\nx\n", undefined), { status: "unchanged", text: FM + "\n\nx\n" });
  });

  test("CRLF notes get CRLF blocks", () => {
    const crlf = (FM + "\nNotes.\n").replace(/\n/g, "\r\n");
    const r = applyGeneratedBlock(crlf, lines);
    assert.equal(r.text, crlf.replace("---\r\n\r\nNotes", `---\r\n\r\n${lines.join("\r\n")}\r\n\r\nNotes`));
    assert.ok(!/[^\r]\n/.test(r.text));
    assert.equal(applyGeneratedBlock(r.text, lines).status, "unchanged");
    assert.equal(applyGeneratedBlock(r.text, undefined).text, crlf);
  });

  test("a note without frontmatter gets the block at the very top", () => {
    const r = applyGeneratedBlock("Notes.\n", lines);
    assert.equal(r.text, `${blockText}\n\nNotes.\n`);
    assert.equal(applyGeneratedBlock(r.text, lines).status, "unchanged");
    assert.equal(applyGeneratedBlock(r.text, undefined).text, "Notes.\n");
  });

  test("migration: a marked block at the top becomes the marker-free block", () => {
    const note = `${FM}\n${OLD_START}\n![Old](${BASE}/${F}/cover.jpg)\n\n- [Old](${u("0")})\n${OLD_END}\n\nMine.\n`;
    const r = applyGeneratedBlock(note, lines);
    assert.equal(r.status, "replaced");
    assert.equal(r.text, `${FM}\n${blockText}\n\nMine.\n`);
    assert.equal(applyGeneratedBlock(note, undefined).text, `${FM}\nMine.\n`);
  });

  test("migration: a marked block lower in the body moves to the top", () => {
    const note = `${FM}\nIntro I wrote.\n\n${OLD_START}\nold stuff\n${OLD_END}\n\nOutro.\n`;
    const r = applyGeneratedBlock(note, lines);
    assert.equal(r.text, `${FM}\n${blockText}\n\nIntro I wrote.\n\nOutro.\n`);
  });

  test("broken markers leave the note alone", () => {
    for (const body of [
      `${OLD_START}\nno end\n`,
      `${OLD_END}\n${OLD_START}\n`,
      `${OLD_START}\n${OLD_END}\n${OLD_START}\n${OLD_END}\n`,
      `text ${OLD_START}\n${OLD_END}\n`,
    ]) {
      const r = applyGeneratedBlock(FM + body, lines);
      assert.equal(r.status, "invalid", body);
      assert.equal(r.text, FM + body);
    }
  });
});
