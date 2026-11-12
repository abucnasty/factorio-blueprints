// "Copy live link": the latest link of a blueprint folder, or of one entry
// of a book chosen from a picker, copied to the clipboard.

import {
  BLUEPRINT_FILE,
  bookTree,
  displayLabel,
  findBlueprintFolder,
  flattenTree,
  joinPath,
  KIND_NAMES,
  readCanonicalJson,
  stringUrl,
} from "../core/index.ts";
import type { BookNode } from "../core/index.ts";
import type { Host, PickItem } from "./host.ts";

export type CopyLinkOutcome =
  | { action: "copied"; folder: string; url: string }
  | { action: "cancelled" }
  | { action: "rejected"; reason: string };

export async function copyLiveLink(host: Host, contextFolder: string): Promise<CopyLinkOutcome> {
  const folder = await findBlueprintFolder(contextFolder, (f) => host.files.exists(joinPath(f, BLUEPRINT_FILE)));
  if (folder === undefined) return reject(host, "This is not inside a blueprint folder (a folder with a blueprint.json).");

  let tree: BookNode | undefined;
  try {
    tree = bookTree(readCanonicalJson(await host.files.read(joinPath(folder, BLUEPRINT_FILE))));
  } catch (e) {
    return reject(host, `Could not read ${folder}/${BLUEPRINT_FILE}: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!tree) return reject(host, `${folder}/${BLUEPRINT_FILE} is not a blueprint, book or planner.`);

  let node: BookNode = tree;
  if (tree.kind === "blueprint-book" && tree.children.length > 0) {
    const nodes = flattenTree(tree);
    const index = await host.ui.pick(nodes.map(pickItem), "Link to the whole book or one entry");
    if (index === undefined) return { action: "cancelled" };
    node = nodes[index]!;
  }

  const url = stringUrl(host.settings.linkBase, folder, node.slots);
  try {
    await host.clipboard.writeText(url);
  } catch (e) {
    return reject(host, `Could not write to the clipboard: ${e instanceof Error ? e.message : String(e)}`);
  }
  const what = node.slots.length === 0 ? `${KIND_NAMES[node.kind]} ${folder}` : `"${displayLabel(node)}" (slot ${node.path}) of ${folder}`;
  host.ui.notice(`Copied the live link to ${what}: ${url}`);
  return { action: "copied", folder, url };
}

function pickItem(n: BookNode): PickItem {
  if (n.slots.length === 0) return { label: `Whole book: ${displayLabel(n)}`, detail: "slot path: none (the root)" };
  const indent = " ".repeat(n.slots.length - 1);
  return { label: `${indent}${displayLabel(n)}`, detail: `slot ${n.path} · ${KIND_NAMES[n.kind]}` };
}

function reject(host: Host, reason: string): CopyLinkOutcome {
  host.ui.notice(reason, "error");
  return { action: "rejected", reason };
}
