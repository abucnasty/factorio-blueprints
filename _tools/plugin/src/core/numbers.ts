// Checks that parsing JSON into JavaScript numbers loses nothing.
//
// JSON.parse stores numbers as 64-bit floats, so a number with more
// precision than that (for example an integer above 2^53) would silently
// change when a blueprint is stored. These helpers find such numbers by
// comparing each number as written in the text with the value it parses to.

/** Every number literal in a JSON text, in order, as written. */
export function jsonNumberLiterals(json: string): string[] {
  const out: string[] = [];
  const re = /"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  for (let m = re.exec(json); m !== null; m = re.exec(json)) {
    if (m[0][0] !== '"') out.push(m[0]);
  }
  return out;
}

/**
 * Number literals in the JSON text whose value changes when parsed into a
 * JavaScript number: integers too large to hold exactly (Factorio reads
 * those as 64-bit integers), and numbers that overflow to infinity or
 * underflow to zero. Empty when every number survives.
 *
 * A fraction such as 0.1 is not reported: Factorio parses it into a
 * double too, so the double is the value. Its shortest form may be written
 * differently (0.2509804069995880126953125 becomes 0.250980406999588), but
 * both texts name the same double.
 */
export function findLossyNumbers(json: string): string[] {
  return jsonNumberLiterals(json).filter((lit) => {
    const n = Number(lit);
    if (!Number.isFinite(n)) return true;
    if (n === 0) return normalizeDecimal(lit) !== "0";
    if (/^-?\d+$/.test(lit)) return BigInt(lit) !== BigInt(n);
    return false;
  });
}

/**
 * Exact decimal value of a number literal in one normal form, so that for
 * example "1.50", "15e-1" and "1.5" all give the same string. Negative zero
 * is treated as zero.
 */
export function normalizeDecimal(literal: string): string {
  const m = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(literal);
  if (!m) throw new Error(`Not a number literal: ${literal}`);
  const sign = m[1]!;
  const intPart = m[2]!;
  const frac = m[3] ?? "";
  let exp = parseInt(m[4] ?? "0", 10) - frac.length;
  let digits = (intPart + frac).replace(/^0+/, "");
  if (digits === "") return "0";
  const trailing = digits.length - digits.replace(/0+$/, "").length;
  digits = digits.slice(0, digits.length - trailing);
  exp += trailing;
  return `${sign}${digits}e${exp}`;
}
