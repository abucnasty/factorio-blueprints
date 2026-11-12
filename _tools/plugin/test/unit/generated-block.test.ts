import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  applyGeneratedBlock,
  BLOCK_END,
  BLOCK_START,
  bookTree,
  coverUrl,
  decodeBlueprintString,
  displayLabel,
  encodePath,
  escapeInline,
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
  test("root, entry, commit and cover", () => {
    assert.equal(stringUrl(BASE, F), `${BASE}/${F}.txt`);
    assert.equal(stringUrl(BASE + "/", F, [3, 1]), `${BASE}/${F}/3/1.txt`);
    assert.equal(stringUrl(BASE, F, [], "3f9c2ab"), `${BASE}/${F}@3f9c2ab.txt`);
    assert.equal(stringUrl(BASE, F, [0], "3f9c2ab"), `${BASE}/${F}/0@3f9c2ab.txt`);
    assert.equal(coverUrl(BASE, F), `${BASE}/${F}/cover.jpg`);
    assert.equal(renderUrl(BASE, F, "3/1.jpg"), `${BASE}/${F}/renders/3/1.jpg`);
  });

  test("segments are percent-encoded", () => {
    assert.equal(encodePath("odd cat/a#b?c/é@x/"), "odd%20cat/a%23b%3Fc/%C3%A9%40x");
    assert.equal(stringUrl(BASE, "odd cat/(x)"), `${BASE}/odd%20cat/(x).txt`);
  });

  test("bad input is refused", () => {
    assert.throws(() => stringUrl(BASE, ""));
    assert.throws(() => stringUrl(BASE, F, [-1]));
    assert.throws(() => stringUrl(BASE, F, [1.5]));
    assert.throws(() => stringUrl(BASE, F, [], "HEAD"));
    assert.throws(() => stringUrl(BASE, F, [], "abc"));
  });
});

describe("block text", () => {
  test("single blueprint: no block without renders, cover only with", () => {
    assert.equal(block(bp("x")), undefined);
    assert.deepStrictEqual(block(bp("x"), true), [BLOCK_START, `![Mall](${BASE}/${F}/cover.jpg)`, BLOCK_END]);
    assert.equal(block({ upgrade_planner: { label: "p" } }), undefined);
  });

  test("flat book, with and without renders", () => {
    const value = book("B", [{ index: 0, ...bp("A") }, { index: 2, ...bp("C") }]);
    assert.deepStrictEqual(block(value), [BLOCK_START, `- [A](${u("0")})`, `- [C](${u("2")})`, BLOCK_END]);
    assert.deepStrictEqual(block(value, true), [
      BLOCK_START,
      `![Mall](${BASE}/${F}/cover.jpg)`,
      "",
      `- [A](${u("0")})`,
      `- [C](${u("2")})`,
      BLOCK_END,
    ]);
    assert.equal(block(book("empty", [])), undefined);
  });

  test("nested books and planners", () => {
    const value = decodeBlueprintString(fixture("book-nested.txt")).value;
    assert.deepStrictEqual(block(value), [
      BLOCK_START,
      `- [Concrete pad](${u("0")})`,
      `- Inner book ([book](${u("1")}))`,
      `  - [Wired lamps](${u("1/0")})`,
      `  - [Trees only](${u("1/1")})`,
      `- [Belts to turbo](${u("2")})`,
      BLOCK_END,
    ]);
    const deep = book("r", [{ index: 3, ...book("a", [{ index: 1, ...book(undefined, [bp("leaf")]) }]) }]);
    assert.deepStrictEqual(block(deep), [
      BLOCK_START,
      `- a ([book](${u("3")}))`,
      `  - Book (slot 1) ([book](${u("3/1")}))`,
      `    - [leaf](${u("3/1/0")})`,
      BLOCK_END,
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
    assert.equal(lines[1], `![\\<b\\>Title\\</b\\> \\]\\](x)](${BASE}/${F}/cover.jpg)`);
    const items = lines.slice(3, -1);
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
  });
});

describe("applying the block", () => {
  const lines = [BLOCK_START, `- [A](${u("0")})`, BLOCK_END];
  const blockText = lines.join("\n");
  const FM = '---\ntitle: Mall\nauthors: []\nversion: "1"\nposted: 2026-11-12\n---\n';

  test("empty body", () => {
    const r = applyGeneratedBlock(FM, lines);
    assert.equal(r.status, "inserted");
    assert.equal(r.text, `${FM}\n${blockText}\n`);
    assert.deepStrictEqual(applyGeneratedBlock(r.text, lines), { status: "unchanged", text: r.text });
    assert.deepStrictEqual(applyGeneratedBlock(r.text, undefined), { status: "removed", text: FM });
  });

  test("hand-written body is kept byte for byte, with or without a leading blank line", () => {
    for (const body of ["\nMy notes.\n\n- a list\n", "Straight after the frontmatter.\n", "\n\n\nspaced\n"]) {
      const r = applyGeneratedBlock(FM + body, lines);
      assert.equal(r.status, "inserted");
      assert.ok(r.text.startsWith(`${FM}\n${blockText}\n`));
      assert.ok(r.text.endsWith(body));
      assert.equal(applyGeneratedBlock(r.text, lines).status, "unchanged");
      const removed = applyGeneratedBlock(r.text, undefined).text;
      assert.ok(removed === FM + body || removed === FM + "\n" + body, JSON.stringify(removed));
    }
  });

  test("an existing block is replaced in place, wherever the owner moved it", () => {
    const note = `${FM}\nIntro I wrote.\n\n${BLOCK_START}\nold stuff\n${BLOCK_END}\n\nOutro.\n`;
    const r = applyGeneratedBlock(note, lines);
    assert.equal(r.status, "replaced");
    assert.equal(r.text, `${FM}\nIntro I wrote.\n\n${blockText}\n\nOutro.\n`);
    assert.equal(applyGeneratedBlock(r.text, lines).status, "unchanged");
    const removed = applyGeneratedBlock(note, undefined);
    assert.equal(removed.status, "removed");
    assert.equal(removed.text, `${FM}\nIntro I wrote.\n\n\nOutro.\n`);
  });

  test("nothing to add and no block: unchanged", () => {
    assert.deepStrictEqual(applyGeneratedBlock(FM + "x\n", undefined), { status: "unchanged", text: FM + "x\n" });
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
    assert.equal(applyGeneratedBlock(r.text, undefined).text, "\nNotes.\n");
  });

  test("broken markers leave the note alone", () => {
    for (const body of [
      `${BLOCK_START}\nno end\n`,
      `${BLOCK_END}\n${BLOCK_START}\n`,
      `${BLOCK_START}\n${BLOCK_END}\n${BLOCK_START}\n${BLOCK_END}\n`,
      `text ${BLOCK_START}\n${BLOCK_END}\n`,
    ]) {
      const r = applyGeneratedBlock(FM + body, lines);
      assert.equal(r.status, "invalid", body);
      assert.equal(r.text, FM + body);
    }
  });
});
