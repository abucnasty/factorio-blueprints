// "Copy blueprint string": encode the blueprint folder's blueprint.json and
// put the string on the clipboard.

import {
  BLUEPRINT_FILE,
  describeBlueprint,
  encodeBlueprintString,
  findBlueprintFolder,
  joinPath,
  readCanonicalJson,
  summarizeBlueprint,
} from "../core/index.ts";
import type { Host } from "./host.ts";

export type CopyOutcome =
  | { action: "copied"; folder: string; string: string }
  | { action: "rejected"; reason: string };

export async function copyBlueprintString(host: Host, contextFolder: string): Promise<CopyOutcome> {
  const folder = await findBlueprintFolder(contextFolder, (f) =>
    host.files.exists(joinPath(f, BLUEPRINT_FILE)),
  );
  if (folder === undefined) {
    return reject(host, "This is not inside a blueprint folder (a folder with a blueprint.json).");
  }
  const path = joinPath(folder, BLUEPRINT_FILE);
  let summary: string;
  let encoded: string;
  try {
    const value = readCanonicalJson(await host.files.read(path));
    summary = summarizeBlueprint(describeBlueprint(value));
    encoded = encodeBlueprintString(value);
  } catch (e) {
    return reject(host, `Could not read ${path}: ${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    await host.clipboard.writeText(encoded);
  } catch (e) {
    return reject(host, `Could not write to the clipboard: ${e instanceof Error ? e.message : String(e)}`);
  }
  host.ui.notice(`Copied ${summary} from ${folder}. Paste it in Factorio with Import string.`);
  return { action: "copied", folder, string: encoded };
}

function reject(host: Host, reason: string): CopyOutcome {
  host.ui.notice(reason, "error");
  return { action: "rejected", reason };
}
