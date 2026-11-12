// Vault paths and the blueprint folder rule from _tools/docs/conventions.md:
// a directory is a blueprint folder if and only if it contains
// blueprint.json, and directories whose name starts with "_" or "." are
// never scanned. Paths are vault-relative with "/" separators; the vault
// root is "".

export const BLUEPRINT_FILE = "blueprint.json";
export const NOTES_FILE = "README.md";

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

/** True if no segment of the path starts with "_" or ".". */
export function isScannedPath(path: string): boolean {
  return path.split("/").every((seg) => seg === "" || !/^[_.]/.test(seg));
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
