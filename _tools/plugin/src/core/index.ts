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
