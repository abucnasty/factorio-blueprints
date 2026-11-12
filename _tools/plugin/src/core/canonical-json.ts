// The canonical blueprint.json format, as defined in _tools/docs/conventions.md.
// This is the only implementation of the writer; every tool imports it.

/** Arrays under these keys are written one element per line, compactly. */
export const COMPACT_ROW_KEYS: ReadonlySet<string> = new Set([
  "entities",
  "tiles",
  "wires",
  "stock_connections",
  "schedules",
]);

const INDENT = "  ";

/** Write a JSON value in the canonical format (LF, trailing newline). */
export function writeCanonicalJson(value: unknown): string {
  return writeValue(value, "", false) + "\n";
}

/**
 * Read a blueprint.json file. Accepts any valid JSON (CRLF line endings and
 * a byte order mark included), so a file mangled by an editor still loads;
 * use isCanonicalJson to check the exact format.
 */
export function readCanonicalJson(text: string): unknown {
  return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
}

/** True if the text is exactly what writeCanonicalJson produces for it. */
export function isCanonicalJson(text: string): boolean {
  try {
    return writeCanonicalJson(JSON.parse(text)) === text;
  } catch {
    return false;
  }
}

/** Compact JSON with keys sorted at every depth, no whitespace. */
export function writeCompactSortedJson(value: unknown): string {
  if (Array.isArray(value)) {
    return "[" + value.map((v) => writeCompactSortedJson(arrayItem(v))).join(",") + "]";
  }
  if (isPlainObject(value)) {
    const parts = sortedKeys(value)
      .filter((k) => value[k] !== undefined)
      .map((k) => JSON.stringify(k) + ":" + writeCompactSortedJson(value[k]));
    return "{" + parts.join(",") + "}";
  }
  return scalar(value);
}

function writeValue(value: unknown, indent: string, compactItems: boolean): string {
  const inner = indent + INDENT;
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map((v) =>
      compactItems ? writeCompactSortedJson(arrayItem(v)) : writeValue(arrayItem(v), inner, false),
    );
    return "[\n" + items.map((s) => inner + s).join(",\n") + "\n" + indent + "]";
  }
  if (isPlainObject(value)) {
    const keys = sortedKeys(value).filter((k) => value[k] !== undefined);
    if (keys.length === 0) return "{}";
    const lines = keys.map(
      (k) => inner + JSON.stringify(k) + ": " + writeValue(value[k], inner, COMPACT_ROW_KEYS.has(k)),
    );
    return "{\n" + lines.join(",\n") + "\n" + indent + "}";
  }
  return scalar(value);
}

// JSON.stringify turns undefined (and functions) inside arrays into null.
function arrayItem(v: unknown): unknown {
  return v === undefined || typeof v === "function" ? null : v;
}

function scalar(value: unknown): string {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new TypeError(`Cannot write non-finite number ${value} as JSON.`);
  }
  const s = JSON.stringify(value);
  if (s === undefined) throw new TypeError(`Cannot write ${typeof value} as JSON.`);
  return s;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Keys sorted by Unicode code point (not UTF-16 code unit). */
function sortedKeys(obj: Record<string, unknown>): string[] {
  return Object.keys(obj).sort(compareCodePoints);
}

export function compareCodePoints(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a.charCodeAt(i);
    const y = b.charCodeAt(i);
    if (x !== y) return codePointOrder(x) - codePointOrder(y);
  }
  return a.length - b.length;
}

// Comparing UTF-16 code units gives code point order except that surrogates
// (U+D800..U+DFFF, used for code points above U+FFFF) must sort after
// U+E000..U+FFFF. Shift the two ranges so they do.
function codePointOrder(unit: number): number {
  if (unit >= 0xe000) return unit - 0x800;
  if (unit >= 0xd800) return unit + 0x2000;
  return unit;
}
