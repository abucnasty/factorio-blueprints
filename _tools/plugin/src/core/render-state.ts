// Whether a blueprint folder's renders match its blueprint.json.
//
// The render tool writes <folder>/renders/render.json after a run:
//   { "schema": 1, "rendered_at": "<ISO time>",
//     "entries": { "<slot path, or "0" for a single blueprint>":
//                  { "file": "3/1.jpg", "sha256": "<hash>", "width": 0, "height": 0 } } }
// The hash is blueprintHash() of the entry's blueprint object. An image is
// current when its entry's hash in the manifest matches the blueprint now.

import { writeCompactSortedJson } from "./canonical-json.ts";
import { sha256Hex } from "./sha256.ts";

export const RENDER_MANIFEST = "render.json";

export interface RenderManifestEntry {
  file: string;
  sha256: string;
  width?: number;
  height?: number;
}

export interface RenderManifest {
  schema: 1;
  rendered_at: string;
  entries: Record<string, RenderManifestEntry>;
}

/**
 * SHA-256 (lowercase hex) of a blueprint object (the value under an
 * entry's "blueprint" key, without the wrapper or the book's index), as
 * compact JSON with keys sorted by code point and array order kept.
 */
export function blueprintHash(blueprint: unknown): string {
  return sha256Hex(new TextEncoder().encode(writeCompactSortedJson(blueprint)));
}

export interface RenderTarget {
  /** Manifest key: the slot path, or "0" for a single blueprint. */
  key: string;
  /** Slot path ("" for a single blueprint). */
  path: string;
  /** Image file under renders/ by the naming rule: "3/1.jpg", or "0.jpg". */
  file: string;
  label: string;
  hash: string;
}

/**
 * Every blueprint that gets an image, depth first in slot order. Books and
 * planners get none, and neither does an empty blueprint (no entities and
 * no tiles), which the render tool skips.
 */
export function renderTargets(value: unknown): RenderTarget[] {
  const out: RenderTarget[] = [];
  const visit = (node: unknown, slots: number[]) => {
    if (!isObject(node)) return;
    const bp = node["blueprint"];
    if (isObject(bp)) {
      if (arrayLength(bp["entities"]) + arrayLength(bp["tiles"]) === 0) return;
      const path = slots.join("/");
      const key = path === "" ? "0" : path;
      out.push({ key, path, file: `${key}.jpg`, label: typeof bp["label"] === "string" ? bp["label"] : "", hash: blueprintHash(bp) });
      return;
    }
    const book = node["blueprint_book"];
    if (!isObject(book) || !Array.isArray(book["blueprints"])) return;
    const children = book["blueprints"].map((entry: unknown, position: number) => {
      const index = isObject(entry) ? entry["index"] : undefined;
      return { entry, slot: typeof index === "number" && Number.isInteger(index) && index >= 0 ? index : position };
    });
    children.sort((a, b) => a.slot - b.slot);
    for (const c of children) visit(c.entry, [...slots, c.slot]);
  };
  visit(value, []);
  return out;
}

/** Parse render.json; undefined if absent, unreadable or of another schema. */
export function parseRenderManifest(text: string | undefined): RenderManifest | undefined {
  if (text === undefined) return undefined;
  try {
    const v: unknown = JSON.parse(text);
    if (!isObject(v) || v["schema"] !== 1 || !isObject(v["entries"])) return undefined;
    const entries: Record<string, RenderManifestEntry> = {};
    for (const [k, e] of Object.entries(v["entries"])) {
      if (isObject(e) && typeof e["file"] === "string" && typeof e["sha256"] === "string") {
        entries[k] = e as unknown as RenderManifestEntry;
      }
    }
    return { schema: 1, rendered_at: typeof v["rendered_at"] === "string" ? v["rendered_at"] : "", entries };
  } catch {
    return undefined;
  }
}

export type EntryRenderState = "none" | "current" | "outdated";

export interface FolderRenderState {
  entries: (RenderTarget & { state: EntryRenderState; image: string | undefined })[];
  /** Images under renders/ that belong to no blueprint. */
  orphans: string[];
  /**
   * none: no blueprint has an image (or there is nothing to render);
   * current: every blueprint has an up-to-date image; outdated: anything else.
   */
  overall: "none" | "current" | "outdated";
  counts: { total: number; current: number; outdated: number; none: number; orphans: number };
}

/**
 * Render state from the blueprint, its manifest (may be absent) and the
 * images present (paths relative to renders/, e.g. "3/1.jpg").
 */
export function renderState(
  value: unknown,
  manifest: RenderManifest | undefined,
  images: readonly string[],
): FolderRenderState {
  const present = new Set(images);
  const claimed = new Set<string>();
  const entries = renderTargets(value).map((t) => {
    const recorded = manifest?.entries[t.key];
    const image = present.has(t.file) ? t.file : undefined;
    if (image !== undefined) claimed.add(image);
    const state: EntryRenderState =
      image === undefined ? "none" : recorded !== undefined && recorded.sha256 === t.hash ? "current" : "outdated";
    return { ...t, state, image };
  });
  const orphans = images.filter((f) => !claimed.has(f)).sort();
  const count = (s: EntryRenderState) => entries.filter((e) => e.state === s).length;
  const counts = { total: entries.length, current: count("current"), outdated: count("outdated"), none: count("none"), orphans: orphans.length };
  const overall =
    counts.total === 0 || counts.none === counts.total ? "none" : counts.current === counts.total ? "current" : "outdated";
  return { entries, orphans, overall, counts };
}

/** Short text for the status bar, e.g. "Render: 3 of 12 outdated". */
export function renderStateLabel(s: FolderRenderState): string {
  if (s.counts.total === 0) return "Render: nothing to render";
  if (s.overall === "none") return "Render: none";
  if (s.overall === "current") return "Render: current";
  const stale = s.counts.total - s.counts.current;
  return s.counts.total === 1 ? "Render: outdated" : `Render: ${stale} of ${s.counts.total} outdated`;
}

function arrayLength(v: unknown): number {
  return Array.isArray(v) ? v.length : 0;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
