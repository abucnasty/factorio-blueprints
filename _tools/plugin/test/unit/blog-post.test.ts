import assert from "node:assert/strict";
import { test } from "node:test";

import { commitBlogPost } from "../../src/commands/blog-post.ts";
import { readBlogPost } from "../../src/core/index.ts";
import { fakeHost } from "./helpers.ts";

const POST = "---\nstatus: public\ntitle: Does FPS matter?\ndate: 2026-05-13\ndescription: FPS and UPS.\ntags: [fps]\n---\n\nBody.\n";

test("readBlogPost: a published post needs its fields; a draft only a status", () => {
  assert.deepEqual(readBlogPost(POST), {
    meta: { status: "public", title: "Does FPS matter?", date: "2026-05-13", description: "FPS and UPS.", tags: ["fps"] },
    status: "public",
    body: "Body.\n",
    problems: [],
  });
  assert.deepEqual(readBlogPost("---\ntitle:\n---\nDraft").problems, []);
  assert.equal(readBlogPost("---\ntitle:\n---\nDraft").meta?.status, "draft");
  assert.deepEqual(readBlogPost("---\nstatus: unlisted\ndate: 2026-13-01\ntags: x\n---\n").problems.length, 4);
});

test("commits and pushes the post folder from any folder inside it", async () => {
  const host = fakeHost({ files: { "blog/fps-and-ups/README.md": POST, "blog/fps-and-ups/screenshots/a.jpg": "x" } });
  const out = await commitBlogPost(host, "blog/fps-and-ups/screenshots");
  assert.equal(out.action, "committed");
  assert.deepEqual(host.commits, [{ folder: "blog/fps-and-ups", message: "publish post Does FPS matter?" }]);
  assert.equal(host.notices.at(-1)!.kind, "info");
  assert.match(host.notices.at(-1)!.message, /^Published post Does FPS matter\?, committed and pushed .* live at \/blog\/fps-and-ups/);
});

test("a draft is committed as a draft; an unready published post and other folders are refused", async () => {
  const draft = fakeHost({ files: { "blog/wip/README.md": "---\nstatus: draft\n---\n" } });
  assert.equal((await commitBlogPost(draft, "blog/wip")).action, "committed");
  assert.deepEqual(draft.commits, [{ folder: "blog/wip", message: "save draft post wip" }]);

  const unready = fakeHost({ files: { "blog/Bad/README.md": "---\nstatus: public\ntitle: T\n---\n" } });
  const out = await commitBlogPost(unready, "blog/Bad");
  assert.equal(out.action, "rejected");
  assert.match(unready.notices[0]!.message, /not ready to publish: frontmatter needs a date.*folder name "Bad"/);
  assert.deepEqual(unready.commits, []);

  for (const folder of ["blog", "blueprints/a/b", "", "blog/_drafts/x"]) {
    const host = fakeHost({ files: { "blog/_drafts/x/README.md": POST } });
    assert.equal((await commitBlogPost(host, folder)).action, "rejected", folder);
    assert.deepEqual(host.commits, []);
  }
});
