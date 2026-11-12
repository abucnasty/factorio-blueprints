// Folder slugs and display titles from blueprint labels, per
// _tools/docs/conventions.md ("Slugs").

/** Rich text tags that only style text or point at game objects by id. */
const DROPPED_TAGS = new Set([
  "color",
  "font",
  "tooltip",
  "gps",
  "train",
  "train-stop",
  "armor",
  "special-item",
  "space-platform",
]);

const TAG = /\[([a-z-]+)=([^\]]*)\]|\[[/.][a-z-]+\]/g;

/**
 * A label as plain text: rich text icons such as `[item=iron-plate]` become
 * their words ("Iron Plate"), styling tags are dropped, and whitespace is
 * collapsed. `[item=military-science-pack,quality=uncommon] (240/s)` gives
 * `Military Science Pack (240/s)`.
 */
export function plainLabel(label: string): string {
  const text = label.replace(TAG, (whole, type: string | undefined, value: string | undefined) => {
    if (type === undefined || value === undefined || DROPPED_TAGS.has(type)) return " ";
    // [img=item/iron-plate] and [img=item.iron-plate] name the object last.
    const name = (value.split(",")[0] ?? "").split(/[/.]/).pop() ?? "";
    return name === "" ? " " : ` ${humanize(name)} `;
  });
  return text
    .replace(/\s+/g, " ")
    .replace(/ ([)\],.:;!?])/g, "$1")
    .replace(/([(\[]) /g, "$1")
    .trim();
}

/** "military-science-pack" -> "Military Science Pack". */
function humanize(name: string): string {
  return name
    .split(/[-_]+/)
    .filter((w) => w !== "")
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Slug for a title: lowercase ASCII words joined by "-", nothing else.
 * Accents are dropped ("Fußgänger" -> "fussganger"), rates keep only the
 * number ("240/s" -> "240"), and anything else that is not a letter or digit
 * separates words. May return "" (for example for a label in Chinese).
 */
export function slugify(title: string): string {
  return plainLabel(title)
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/(\d)\s*\/\s*(?:s|sec|m|min|h)\b/g, "$1")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** True for a string slugify could have produced (and is not empty). */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}
