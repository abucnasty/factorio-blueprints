// The version rules (core versions.ts) and how the plugin applies them when
// it commits a published blueprint (commands/publish.ts).

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { commitAndPublish, publishVersion } from "../../src/commands/publish.ts";
import {
  contentHash,
  decideVersion,
  readCanonicalJson,
  readVersions,
  type VersionEntry,
  writeCanonicalJson,
  writeVersions,
} from "../../src/core/index.ts";
import { FAKE_COMMIT, fakeHost } from "./helpers.ts";

let commits = 0;
const v = (label: string, hash: string, commit = String(++commits).padStart(40, "0")): VersionEntry => ({ label, date: "2026-01-01T00:00:00Z", hash, commit });
const H1 = "1".repeat(64);
const H2 = "2".repeat(64);
const H3 = "3".repeat(64);

describe("decideVersion", () => {
  const ledger = [v("1.0", H1), v("1.2", H2)];
  test("identical content never makes a new version; a new label for it renames the latest", () => {
    assert.equal(decideVersion(ledger, H2, "1.2").kind, "current");
    assert.deepEqual(decideVersion(ledger, H2, "1.3"), { kind: "rename", latest: ledger[1], label: "1.3" });
    assert.equal(decideVersion(ledger, H2, "1.0").kind, "label-taken");
  });
  test("changed content under a new label is a new version; under a used label it is held", () => {
    assert.deepEqual(decideVersion(ledger, H3, "1.3"), { kind: "new", label: "1.3", hash: H3, latest: ledger[1] });
    assert.equal(decideVersion(ledger, H3, "1.2").kind, "unbumped", "the latest's label");
    assert.equal(decideVersion(ledger, H3, "1.0").kind, "unbumped", "an older version's label");
    assert.equal(decideVersion(ledger, H1, "1.0").kind, "unbumped", "back to old content under its old label");
    assert.deepEqual(decideVersion([], H1, "1.0"), { kind: "new", label: "1.0", hash: H1 });
  });
  test("a ledger must have unique labels and no repeated content", () => {
    assert.deepEqual(readVersions(writeVersions(ledger)), ledger);
    assert.throws(() => readVersions(writeVersions([v("1", H1), v("1", H2)])), /used twice/);
    assert.throws(() => readVersions(writeVersions([v("1", H1), v("2", H1)])), /same content/);
    assert.throws(() => readVersions(writeVersions([{ ...v("1", H1), commit: "abc" }])), /full commit SHA/);
    assert.throws(() => readVersions(writeVersions([v("1", H1, "a".repeat(40)), v("2", H2, "a".repeat(40))])), /commit of another version/);
  });
});

describe("publishing from the plugin", () => {
  const bp = (label: string) => writeCanonicalJson({ blueprint: { item: "blueprint", label, entities: [{ entity_number: 1, name: "iron-chest", position: { x: 0, y: 0 } }], version: 1 } });
  const note = (version: string) => `---\ntitle: Mall\nauthors: []\nversion: "${version}"\nstatus: public\n---\n`;
  const hashOf = (text: string) => contentHash(readCanonicalJson(text));
  const recorded = [v("1.0", hashOf(bp("old")))];
  const setup = (content: string, version: string) =>
    fakeHost({ files: { "cat/mall/blueprint.json": content, "cat/mall/README.md": note(version), "cat/mall/versions.json": writeVersions(recorded) } });
  const ledgerOf = (host: ReturnType<typeof fakeHost>) => readVersions(host.vault.get("cat/mall/versions.json")!);

  test("new content and a new label: recorded with the commit that brought the content in", async () => {
    const host = setup(bp("new"), "1.1");
    const r = await commitAndPublish(host, "cat/mall", "update Mall");
    assert.equal(r.warn, false);
    assert.deepEqual(ledgerOf(host), [...recorded, { label: "1.1", date: "2026-11-12T10:00:00Z", hash: hashOf(bp("new")), commit: FAKE_COMMIT }]);
    assert.deepEqual(host.commits.map((c) => c.message), ["update Mall", "record Mall version 1.1"]);
  });

  test("new content under the same label: committed, not recorded, and the author is told to bump the version", async () => {
    const host = setup(bp("new"), "1.0");
    const r = await commitAndPublish(host, "cat/mall", "update Mall");
    assert.equal(r.warn, true);
    assert.match(r.note, /content changed, bump `version` to publish/);
    assert.match(r.note, /version "1\.0" stays live/);
    assert.deepEqual(ledgerOf(host), recorded);
    assert.deepEqual(host.commits.map((c) => c.message), ["update Mall"]);
  });

  test("only the label changed: the latest version is renamed in the same commit", async () => {
    const host = setup(bp("old"), "1.0.1");
    await publishVersion(host, "cat/mall");
    assert.deepEqual(ledgerOf(host), [{ ...recorded[0]!, label: "1.0.1" }]);
    assert.deepEqual(host.commits.map((c) => c.message), ["publish Mall"]);
    assert.match(host.notices.at(-1)!.message, /Version "1\.0" is now "1\.0\.1"/);
  });
});
