// The blog index builder against temporary git repositories.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import { blogObjects, buildBlog, carryOverPosts } from "../build-blog.ts";

process.env["GIT_CONFIG_GLOBAL"] = "/dev/null";
process.env["GIT_CONFIG_NOSYSTEM"] = "1";

const root = mkdtempSync(join(tmpdir(), "fbp-blog-test-"));
after(() => rmSync(root, { recursive: true, force: true }));
let n = 0;

/** A repo with the vault's layout: paths are from its root. */
function repo() {
  const dir = join(root, `repo-${++n}`);
  execFileSync("git", ["init", "-q", "-b", "main", dir]);
  const git = (...args: string[]) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  git("config", "commit.gpgsign", "false");
  const write = (path: string, data: string | Buffer) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), data);
  };
  const remove = (path: string) => rmSync(join(dir, path), { recursive: true });
  const commit = () => {
    git("add", "-A");
    git("commit", "-q", "--allow-empty", "-m", "x");
    return git("rev-parse", "HEAD");
  };
  return { dir, write, remove, commit };
}

const note = (fm: string, body = "Body text.\n") => `---\n${fm}\n---\n\n${body}`;
const published = (title: string, date: string, extra = "") =>
  note(`status: public\ntitle: ${title}\ndate: ${date}\ndescription: About ${title}.\ntags: [ups, fps]${extra}`);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3]);
const OID = "a".repeat(64);
const pointer = `version https://git-lfs.github.com/spec/v1\noid sha256:${OID}\nsize 4242\n`;

test("published posts are indexed newest first with their files; drafts and other folders are not", () => {
  const r = repo();
  r.write("blog/older-post/README.md", published("Older", "2026-05-11"));
  r.write("blog/newer-post/README.md", published("Newer", "2026-05-13", "\nextra: ignored"));
  r.write("blog/newer-post/screenshots/a.jpg", JPEG);
  r.write("blog/newer-post/big.png", pointer);
  r.write("blog/newer-post/_scratch.md", "private");
  r.write("blog/same-day-a/README.md", published("Same day", "2026-05-11"));
  r.write("blog/unlisted-post/README.md", published("Hidden", "2026-01-01").replace("status: public", "status: unlisted"));
  r.write("blog/a-draft/README.md", note("status: draft\ntitle: Work in progress"));
  r.write("blog/no-status/README.md", note("title: Also a draft"));
  r.write("blog/_templates/README.md", published("Not a post", "2026-01-01"));
  r.write("blog/README.md", "About the blog folder.\n");
  r.write("notes/x/README.md", published("Not the blog", "2026-01-01"));
  r.write("blueprints/a/README.md", published("Not the blog", "2026-01-01"));
  const commit = r.commit();

  const blog = buildBlog(r.dir, { now: new Date("2026-11-14T00:00:00Z") });
  assert.deepEqual(blog.problems, []);
  assert.deepEqual(blog.drafts, ["a-draft", "no-status"]);
  assert.equal(blog.index.schema, 1);
  assert.equal(blog.index.commit, commit);
  assert.equal(blog.index.generatedAt, "2026-11-14T00:00:00.000Z");
  assert.deepEqual(
    blog.index.posts.map((p) => [p.slug, p.date, p.status]),
    [
      ["newer-post", "2026-05-13", "public"],
      ["older-post", "2026-05-11", "public"],
      ["same-day-a", "2026-05-11", "public"],
      ["unlisted-post", "2026-01-01", "unlisted"],
    ],
  );
  const newer = blog.index.posts[0]!;
  assert.deepEqual(
    { ...newer, files: newer.files.map(({ blob, ...f }) => ({ ...f, blob: blob.length })) },
    {
      slug: "newer-post",
      title: "Newer",
      date: "2026-05-13",
      description: "About Newer.",
      tags: ["ups", "fps"],
      status: "public",
      files: [
        { path: "big.png", size: 4242, oid: OID, blob: 40 },
        { path: "screenshots/a.jpg", size: JPEG.length, blob: 40 },
      ],
    },
  );
  assert.equal(blog.bodies.get("newer-post"), "Body text.\n", "frontmatter and leading blank lines removed");

  // Objects: plain-git files, then markdown, then the index last; LFS files are not uploaded.
  const objects = blogObjects(blog, undefined);
  assert.deepEqual(
    objects.map((o) => [o.key, o.contentType]),
    [
      ["blog/newer-post/screenshots/a.jpg", "image/jpeg"],
      ["blog/newer-post/index.md", "text/markdown; charset=utf-8"],
      ["blog/older-post/index.md", "text/markdown; charset=utf-8"],
      ["blog/same-day-a/index.md", "text/markdown; charset=utf-8"],
      ["blog/unlisted-post/index.md", "text/markdown; charset=utf-8"],
      ["blog/index.json", "application/json; charset=utf-8"],
    ],
  );
  assert.deepEqual(objects[0]!.body, JPEG);
  assert.deepEqual(JSON.parse(objects.at(-1)!.body as string), blog.index);

  // Against a live index that already lists the image with the same content, it is not uploaded again.
  const again = blogObjects(blog, structuredClone(blog.index));
  assert.ok(!again.some((o) => o.key.endsWith(".jpg")));
});

test("frontmatter is validated for published posts; invalid posts are left out", () => {
  const r = repo();
  r.write("blog/ok/README.md", published("Fine", "2026-05-13"));
  r.write("blog/no-title/README.md", note("status: public\ndate: 2026-05-13\ndescription: d\ntags: []"));
  r.write("blog/bad-date/README.md", published("Bad date", "2026-02-30"));
  r.write("blog/bad-tags/README.md", note("status: public\ntitle: T\ndate: 2026-05-13\ndescription: d\ntags: one"));
  r.write("blog/no-description/README.md", note("status: deprecated\ntitle: T\ndate: 2026-05-13T10:00:00Z"));
  r.write("blog/bad-status/README.md", note("status: live\ntitle: T"));
  r.write("blog/broken-yaml/README.md", note("title: [unclosed"));
  r.write("blog/Bad_Slug/README.md", published("Bad slug", "2026-05-13"));
  r.write("blog/no-note/image.jpg", JPEG);
  r.write("blog/reserved/README.md", published("Reserved", "2026-05-13"));
  r.write("blog/reserved/index.md", "clashes with the published markdown");
  r.commit();

  const blog = buildBlog(r.dir);
  assert.deepEqual(blog.index.posts.map((p) => p.slug), ["ok"]);
  const by = (slug: string) => blog.problems.filter((p) => p.folder === slug).map((p) => p.message);
  assert.deepEqual(blog.invalid, ["Bad_Slug", "bad-date", "bad-status", "bad-tags", "broken-yaml", "no-description", "no-note", "no-title", "reserved"]);
  assert.deepEqual(by("no-title"), ["frontmatter needs a title"]);
  assert.match(by("bad-date")[0]!, /needs a date/);
  assert.match(by("bad-tags")[0]!, /tags must be a list/);
  assert.match(by("no-description")[0]!, /needs a description/);
  assert.match(by("bad-status")[0]!, /status must be draft, public, deprecated or unlisted/);
  assert.match(by("broken-yaml")[0]!, /not valid YAML/);
  assert.match(by("Bad_Slug")[0]!, /lowercase letters, digits and single hyphens/);
  assert.match(by("no-note")[0]!, /has no README.md/);
  assert.match(by("reserved")[0]!, /published as index.md/);
  assert.equal(blog.problems.find((p) => p.folder === "no-title")!.path, "blog/no-title/README.md");
});

test("an invalid post keeps its live entry; a draft again or a deleted post goes offline", () => {
  const r = repo();
  r.write("blog/kept/README.md", published("Kept", "2026-05-01"));
  r.write("blog/unpublished/README.md", published("Unpublished", "2026-05-02"));
  r.write("blog/deleted/README.md", published("Deleted", "2026-05-03"));
  r.commit();
  const live = buildBlog(r.dir).index;
  assert.equal(live.posts.length, 3);

  r.write("blog/kept/README.md", published("Kept", "not a date"));
  r.write("blog/unpublished/README.md", published("Unpublished", "2026-05-02").replace("status: public", "status: draft"));
  r.remove("blog/deleted");
  r.commit();
  const blog = buildBlog(r.dir);
  assert.equal(blog.index.posts.length, 0);
  assert.deepEqual(carryOverPosts(blog, live), ["kept"]);
  assert.deepEqual(blog.index.posts.map((p) => [p.slug, p.stale]), [["kept", true]]);
  // A carried-over post uploads nothing; only the index is written.
  assert.deepEqual(blogObjects(blog, live).map((o) => o.key), ["blog/index.json"]);
});
