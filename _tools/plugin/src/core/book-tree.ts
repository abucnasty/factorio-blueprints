// The entries of a blueprint book as a tree with slot paths, per the
// nested-links contract in _tools/docs/conventions.md ("Generated block").
//
// An entry's slot is its `index` in the book, or its position in the
// `blueprints` array when it has none. Its slot path lists the slots from
// the root book down to it; the root has the empty slot path.

import type { BlueprintKind } from "./describe.ts";
import { plainLabel } from "./slug.ts";

export interface BookNode {
  /** Slot in the parent book; undefined for the root. */
  slot: number | undefined;
  /** Slots from the root down, e.g. [3, 1]; [] for the root. */
  slots: number[];
  /** The slot path as text, e.g. "3/1"; "" for the root. */
  path: string;
  kind: BlueprintKind;
  /** Plain-text label (rich text turned into words); "" if none. */
  label: string;
  /** Entries of a book, in slot order; empty for anything else. */
  children: BookNode[];
}

const KIND_KEYS: [string, BlueprintKind][] = [
  ["blueprint", "blueprint"],
  ["blueprint_book", "blueprint-book"],
  ["upgrade_planner", "upgrade-planner"],
  ["deconstruction_planner", "deconstruction-planner"],
];

/** The tree of a decoded value, or undefined if it is not a blueprint, book or planner. */
export function bookTree(value: unknown): BookNode | undefined {
  return node(value, []);
}

/** Every node, depth first in slot order, the root first. */
export function flattenTree(root: BookNode): BookNode[] {
  const out: BookNode[] = [];
  const visit = (n: BookNode) => {
    out.push(n);
    n.children.forEach(visit);
  };
  visit(root);
  return out;
}

/** The node at a slot path, or undefined. */
export function findNode(root: BookNode, slots: readonly number[]): BookNode | undefined {
  let n: BookNode | undefined = root;
  for (const s of slots) n = n?.children.find((c) => c.slot === s);
  return n;
}

const UNLABELED: Record<BlueprintKind, string> = {
  blueprint: "Blueprint",
  "blueprint-book": "Book",
  "upgrade-planner": "Upgrade planner",
  "deconstruction-planner": "Deconstruction planner",
};

/** The label to show: the entry's label, or e.g. "Blueprint (slot 3)". */
export function displayLabel(n: BookNode): string {
  if (n.label !== "") return n.label;
  return n.slot === undefined ? UNLABELED[n.kind] : `${UNLABELED[n.kind]} (slot ${n.slot})`;
}

function node(value: unknown, slots: number[]): BookNode | undefined {
  if (!isObject(value)) return undefined;
  for (const [key, kind] of KIND_KEYS) {
    const body = value[key];
    if (!isObject(body)) continue;
    const label = typeof body["label"] === "string" ? plainLabel(body["label"]) : "";
    const result: BookNode = {
      slot: slots.length === 0 ? undefined : slots[slots.length - 1],
      slots,
      path: slots.join("/"),
      kind,
      label,
      children: [],
    };
    const entries = body["blueprints"];
    if (kind === "blueprint-book" && Array.isArray(entries)) {
      const children: BookNode[] = [];
      entries.forEach((entry, position) => {
        const index = isObject(entry) ? entry["index"] : undefined;
        const slot = typeof index === "number" && Number.isInteger(index) && index >= 0 ? index : position;
        const child = node(entry, [...slots, slot]);
        if (child) children.push(child);
      });
      // Stable sort: slot order, array order for equal slots.
      result.children = children.sort((a, b) => a.slot! - b.slot!);
    }
    return result;
  }
  return undefined;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
