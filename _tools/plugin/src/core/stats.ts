// Blueprint stats kept in a note's frontmatter and in index.json: generated
// from blueprint.json, overwritten each time, never edited by hand.
//
//   entities: 1234            blueprints and books, even when 0
//   tiles: 560                omitted when 0
//   blueprints: 12            books only, at every depth
//   factorio_version: "2.1.24"  the game version that saved it, when known

import { describeBlueprint } from "./describe.ts";
import { readFrontmatter, updateFrontmatter } from "./frontmatter.ts";

export interface BlueprintStats {
  entities?: number;
  tiles?: number;
  blueprints?: number;
  factorio_version?: string;
}

/** The generated keys, in the order new ones are added. */
export const STATS_KEYS = ["entities", "tiles", "blueprints", "factorio_version"] as const;

/** Stats of a decoded blueprint, book or planner (throws for anything else). */
export function blueprintStats(value: unknown): BlueprintStats {
  const d = describeBlueprint(value);
  const stats: BlueprintStats = {};
  if (d.kind === "blueprint" || d.kind === "blueprint-book") {
    stats.entities = d.counts.entities;
    if (d.counts.tiles > 0) stats.tiles = d.counts.tiles;
  }
  if (d.kind === "blueprint-book") stats.blueprints = d.counts.blueprints;
  if (d.factorioVersion !== undefined) stats.factorio_version = d.factorioVersion;
  return stats;
}

/**
 * Write the stats into a note's frontmatter: changed keys in place, new ones
 * appended in STATS_KEYS order, keys that no longer apply removed. Keys that
 * already hold the right value are not touched, so the same stats twice
 * change nothing.
 */
export function applyStatsToNote(note: string, stats: BlueprintStats): string {
  const fm = readFrontmatter(note);
  const updates: Record<string, unknown> = {};
  for (const key of STATS_KEYS) {
    const want = stats[key];
    const has = Object.prototype.hasOwnProperty.call(fm, key);
    if (want === undefined ? has : !has || fm[key] !== want) updates[key] = want;
  }
  return Object.keys(updates).length === 0 ? note : updateFrontmatter(note, updates);
}
