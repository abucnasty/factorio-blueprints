// Shared core for every factorio-blueprints tool: the Obsidian plugin, the
// Node migration and CI scripts, and the Cloudflare link Worker.
//
// Pure TypeScript: no Obsidian or Node imports, only fflate, yaml and
// globals every runtime has. Import this file by path, for example
//   import { decodeBlueprintString } from "../plugin/src/core/index.ts";

export {
  BlueprintStringError,
  decodeBlueprintString,
  encodeBlueprintString,
  SUPPORTED_VERSION_BYTE,
} from "./codec.ts";
export type { BlueprintStringErrorCode, DecodedString } from "./codec.ts";

export {
  COMPACT_ROW_KEYS,
  compareCodePoints,
  isCanonicalJson,
  readCanonicalJson,
  writeCanonicalJson,
  writeCompactSortedJson,
} from "./canonical-json.ts";

export { findLossyNumbers, jsonNumberLiterals, normalizeDecimal } from "./numbers.ts";

export {
  decodeFactorioVersion,
  describeBlueprint,
  encodeFactorioVersion,
  isBlueprintValue,
  KIND_NAMES,
  summarizeBlueprint,
} from "./describe.ts";
export type { BlueprintCounts, BlueprintDescription, BlueprintKind } from "./describe.ts";

export { isValidSlug, plainLabel, slugify } from "./slug.ts";

export {
  bumpVersion,
  FrontmatterError,
  readFrontmatter,
  readNotesMeta,
  splitFrontmatter,
  updateFrontmatter,
} from "./frontmatter.ts";
export type { NotesMeta, SplitNote } from "./frontmatter.ts";

export { DEFAULT_NOTES_TEMPLATE, fillNotesTemplate } from "./notes-template.ts";
export type { NewNotesFields } from "./notes-template.ts";

export {
  baseName,
  BLUEPRINT_FILE,
  findBlueprintFolder,
  isScannedPath,
  joinPath,
  NOTES_FILE,
  parentFolder,
  selfAndAncestors,
} from "./blueprint-folder.ts";

export { bookTree, displayLabel, findNode, flattenTree } from "./book-tree.ts";
export type { BookNode } from "./book-tree.ts";

export {
  assembleBook,
  BOOK_FILE,
  expandBook,
  parseSlotFolder,
  slotFolderName,
  slotFolders,
} from "./expanded-book.ts";
export type { ExpandedEntry, FolderReader } from "./expanded-book.ts";

export { coverUrl, DEFAULT_LINK_BASE, encodePath, renderUrl, stringUrl } from "./links.ts";

export {
  applyGeneratedBlock,
  escapeInline,
  findGeneratedBlock,
  generatedBlockLines,
} from "./generated-block.ts";
export type { BlockInput, BlockUpdate } from "./generated-block.ts";

export { sha256Hex } from "./sha256.ts";
export {
  blueprintHash,
  parseRenderManifest,
  RENDER_MANIFEST,
  renderState,
  renderStateLabel,
  renderTargets,
} from "./render-state.ts";
export type {
  EntryRenderState,
  FolderRenderState,
  RenderManifest,
  RenderManifestEntry,
  RenderTarget,
} from "./render-state.ts";

export { applyStatsToNote, blueprintStats, STATS_KEYS } from "./stats.ts";
export type { BlueprintStats } from "./stats.ts";
