// Read the small committed fixtures in test/fixtures/.

import { readFileSync } from "node:fs";
import { join } from "node:path";

export const FIXTURES = join(import.meta.dirname, "..", "fixtures");

export function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), "utf8");
}
