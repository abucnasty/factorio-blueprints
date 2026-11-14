// Vault paths and the blueprint folder rule from _tools/docs/conventions.md:
// a directory under blueprints/ is a blueprint folder if and only if it
// contains blueprint.json. Nothing outside blueprints/ is scanned, nor any
// directory whose name starts with "_" or ".". Paths are vault-relative
// with "/" separators; the vault root is "".
//
// Catalog paths (the index's `path`, site addresses) are relative to
// blueprints/; live links mirror the vault: <base>/blueprints/<catalog path>.

export const BLUEPRINT_FILE = "blueprint.json";
export const NOTES_FILE = "README.md";
/** The vault folder that holds every blueprint; other top-level folders are not blueprint content. */
export const BLUEPRINTS_ROOT = "blueprints";

/** Join vault path parts, skipping empty ones. */
export function joinPath(...parts: string[]): string {
  return parts
    .flatMap((p) => p.split("/"))
    .filter((p) => p !== "")
    .join("/");
}

/** Parent folder of a path ("" for top-level entries and the root). */
export function parentFolder(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

/** Last path segment. */
export function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** True if the path is inside blueprints/ (not that folder itself) and no segment starts with "_" or ".". */
export function isScannedPath(path: string): boolean {
  const segs = joinPath(path).split("/");
  return segs.length > 1 && segs[0] === BLUEPRINTS_ROOT && segs.every((seg) => !/^[_.]/.test(seg));
}

/** The catalog path of a vault path inside blueprints/ ("blueprints/a/b" -> "a/b"); undefined outside it. */
export function catalogPath(vaultPath: string): string | undefined {
  const p = joinPath(vaultPath);
  return p.startsWith(BLUEPRINTS_ROOT + "/") ? p.slice(BLUEPRINTS_ROOT.length + 1) : undefined;
}

/** The vault path of a catalog path ("a/b" -> "blueprints/a/b"). */
export function vaultPath(catalogPath: string): string {
  return joinPath(BLUEPRINTS_ROOT, catalogPath);
}

/** The folder itself, then each parent up to and including the root "". */
export function selfAndAncestors(folder: string): string[] {
  const out: string[] = [];
  let f = joinPath(folder);
  for (;;) {
    out.push(f);
    if (f === "") return out;
    f = parentFolder(f);
  }
}

/**
 * The blueprint folder that contains `folder` (or is it), found by walking
 * up and asking `hasBlueprintFile` for each candidate; undefined if none.
 * Folders that are not scanned never count.
 */
export async function findBlueprintFolder(
  folder: string,
  hasBlueprintFile: (folder: string) => Promise<boolean>,
): Promise<string | undefined> {
  for (const f of selfAndAncestors(folder)) {
    if (f !== "" && isScannedPath(f) && (await hasBlueprintFile(f))) return f;
  }
  return undefined;
}
