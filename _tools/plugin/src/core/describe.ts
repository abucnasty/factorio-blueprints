// Describe a decoded blueprint string value: what it is, its label and
// counts. Used for notices, titles and (later) the catalog index.

import { BlueprintStringError } from "./codec.ts";

export type BlueprintKind =
  | "blueprint"
  | "blueprint-book"
  | "upgrade-planner"
  | "deconstruction-planner";

/** Top-level JSON key for each kind. */
const KIND_KEYS: Record<string, BlueprintKind> = {
  blueprint: "blueprint",
  blueprint_book: "blueprint-book",
  upgrade_planner: "upgrade-planner",
  deconstruction_planner: "deconstruction-planner",
};

export const KIND_NAMES: Record<BlueprintKind, string> = {
  blueprint: "blueprint",
  "blueprint-book": "blueprint book",
  "upgrade-planner": "upgrade planner",
  "deconstruction-planner": "deconstruction planner",
};

export interface BlueprintCounts {
  /** Blueprints, at any depth inside a book; 1 for a single blueprint. */
  blueprints: number;
  /** Books nested inside this one (not counting itself). */
  books: number;
  upgradePlanners: number;
  deconstructionPlanners: number;
  /** Entities and tiles summed over every blueprint. */
  entities: number;
  tiles: number;
}

export interface BlueprintDescription {
  kind: BlueprintKind;
  label?: string;
  description?: string;
  /** Factorio version that saved it, e.g. "2.0.76", from the version number. */
  factorioVersion?: string;
  counts: BlueprintCounts;
}

/**
 * Describe a decoded value. Throws BlueprintStringError("not-a-blueprint")
 * if it is not a blueprint, book, upgrade planner or deconstruction planner.
 */
export function describeBlueprint(value: unknown): BlueprintDescription {
  const found = unwrap(value);
  if (!found) {
    throw new BlueprintStringError(
      "not-a-blueprint",
      "The data is not a blueprint, blueprint book, upgrade planner or deconstruction planner.",
    );
  }
  const { kind, body } = found;
  const counts: BlueprintCounts = {
    blueprints: 0,
    books: 0,
    upgradePlanners: 0,
    deconstructionPlanners: 0,
    entities: 0,
    tiles: 0,
  };
  count(kind, body, counts, true);
  const result: BlueprintDescription = { kind, counts };
  const label = nonEmptyString(body["label"]);
  if (label !== undefined) result.label = label;
  const description = nonEmptyString(body["description"]);
  if (description !== undefined) result.description = description;
  const version = body["version"];
  if (typeof version === "number") result.factorioVersion = decodeFactorioVersion(version);
  return result;
}

/** True if the value is a blueprint, book or planner. */
export function isBlueprintValue(value: unknown): boolean {
  return unwrap(value) !== undefined;
}

/**
 * Factorio packs its version into one 64-bit number, 16 bits each for
 * major, minor, patch and build: 2.0.76 is 562949958664192.
 * The build part is left out, as the game does when it shows its version
 * (a blueprint saved by 2.1.24 carries build 1).
 */
export function decodeFactorioVersion(packed: number): string {
  if (!Number.isSafeInteger(packed) || packed < 0) {
    throw new RangeError(`Not a Factorio version number: ${packed}`);
  }
  const parts = [2 ** 48, 2 ** 32, 2 ** 16, 1].map((unit) => Math.floor(packed / unit) % 65536);
  const [major, minor, patch] = parts as [number, number, number, number];
  return `${major}.${minor}.${patch}`;
}

/** Inverse of decodeFactorioVersion, for tests and fixtures. */
export function encodeFactorioVersion(version: string): number {
  const parts = version.split(".").map((p) => parseInt(p, 10));
  const [major = 0, minor = 0, patch = 0, build = 0] = parts;
  return major * 2 ** 48 + minor * 2 ** 32 + patch * 2 ** 16 + build;
}

/** One-line human summary, e.g. `blueprint book "Mall" (12 blueprints, 3,401 entities)`. */
export function summarizeBlueprint(d: BlueprintDescription): string {
  const name = KIND_NAMES[d.kind];
  const label = d.label !== undefined ? ` "${d.label}"` : "";
  const bits: string[] = [];
  const c = d.counts;
  if (d.kind === "blueprint-book") {
    bits.push(plural(c.blueprints, "blueprint"));
    if (c.books > 0) bits.push(plural(c.books, "book"));
    if (c.upgradePlanners + c.deconstructionPlanners > 0) {
      bits.push(plural(c.upgradePlanners + c.deconstructionPlanners, "planner"));
    }
  }
  if (d.kind === "blueprint" || d.kind === "blueprint-book") {
    bits.push(plural(c.entities, "entity", "entities"));
    if (c.tiles > 0) bits.push(plural(c.tiles, "tile"));
  }
  return `${name}${label}` + (bits.length > 0 ? ` (${bits.join(", ")})` : "");
}

function plural(n: number, one: string, many = one + "s"): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

type Body = Record<string, unknown>;

function unwrap(value: unknown): { kind: BlueprintKind; body: Body } | undefined {
  if (!isObject(value)) return undefined;
  for (const [key, kind] of Object.entries(KIND_KEYS)) {
    const body = value[key];
    if (isObject(body)) return { kind, body };
  }
  return undefined;
}

function count(kind: BlueprintKind, body: Body, c: BlueprintCounts, top: boolean): void {
  switch (kind) {
    case "blueprint":
      c.blueprints++;
      c.entities += arrayLength(body["entities"]);
      c.tiles += arrayLength(body["tiles"]);
      return;
    case "blueprint-book": {
      if (!top) c.books++;
      const children = body["blueprints"];
      if (!Array.isArray(children)) return;
      for (const child of children) {
        const inner = unwrap(child);
        if (inner) count(inner.kind, inner.body, c, false);
      }
      return;
    }
    case "upgrade-planner":
      c.upgradePlanners++;
      return;
    case "deconstruction-planner":
      c.deconstructionPlanners++;
      return;
  }
}

function arrayLength(v: unknown): number {
  return Array.isArray(v) ? v.length : 0;
}

function nonEmptyString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
}

function isObject(v: unknown): v is Body {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
