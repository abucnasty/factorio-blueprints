// Live links served by the link Worker, per _tools/docs/conventions.md:
//
//   <base>/<folder>.txt                 latest string of the whole folder
//   <base>/<folder>@<sha>.txt           at a commit
//   <base>/<folder>/<slot>/<slot>.txt   one book entry (also with @<sha>)
//   <base>/<folder>/cover.jpg           the cover render
//   <base>/<folder>/renders/<file>      one render file

export const DEFAULT_LINK_BASE = "https://blueprints.abucnasty.dev";

/** Link to a folder's string, or to the entry at a slot path, optionally at a commit. */
export function stringUrl(base: string, folder: string, slots: readonly number[] = [], sha?: string): string {
  const entry = slots.map((s) => `/${checkSlot(s)}`).join("");
  const at = sha === undefined || sha === "" ? "" : `@${checkSha(sha)}`;
  return `${folderUrl(base, folder)}${entry}${at}.txt`;
}

/** The stable address of a folder's cover image. */
export function coverUrl(base: string, folder: string): string {
  return `${folderUrl(base, folder)}/cover.jpg`;
}

/** A render file, given its path under renders/ (e.g. "3/1.jpg"). */
export function renderUrl(base: string, folder: string, file: string): string {
  return `${folderUrl(base, folder)}/renders/${encodePath(file)}`;
}

function folderUrl(base: string, folder: string): string {
  const path = encodePath(folder);
  if (path === "") throw new Error("A link needs a blueprint folder path.");
  return `${base.trim().replace(/\/+$/, "")}/${path}`;
}

/** Each path segment percent-encoded; "/" separates segments. */
export function encodePath(path: string): string {
  return path
    .split("/")
    .filter((s) => s !== "")
    // Parentheses too, so a link's URL never ends a Markdown link early.
    .map((s) => encodeURIComponent(s).replace(/\(/g, "%28").replace(/\)/g, "%29"))
    .join("/");
}

function checkSlot(slot: number): number {
  if (!Number.isInteger(slot) || slot < 0) throw new Error(`Not a slot number: ${slot}`);
  return slot;
}

function checkSha(sha: string): string {
  if (!/^[0-9a-f]{7,40}$/.test(sha)) throw new Error(`Not a commit SHA: ${sha}`);
  return sha;
}
