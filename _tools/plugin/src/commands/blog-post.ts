// "Commit blog post": commit, pull and push one post folder (blog/<slug>/,
// see the conventions), like the blueprint commands do for a blueprint.
// Whether it goes live is the note's `status`, as for blueprints: CI
// publishes it unless it is a draft. A published post with frontmatter
// problems is not committed, since CI would refuse it. Blog folders are
// never blueprint folders, so no blueprint command acts on them.

import { BLOG_ROOT, blogNotePath, blogPostFolderName, isBlogSlug, joinPath, NOTES_FILE, readBlogPost } from "../core/index.ts";
import type { GitResult } from "../git/commit-and-sync.ts";
import { reportGit } from "./git-notice.ts";
import type { Host } from "./host.ts";

export type BlogCommitOutcome =
  | { action: "committed"; folder: string; published: boolean; git: GitResult }
  | { action: "rejected"; reason: string };

export async function commitBlogPost(host: Host, contextFolder: string): Promise<BlogCommitOutcome> {
  const slug = blogPostFolderName(contextFolder);
  if (slug === undefined) return reject(host, `This is not inside a blog post folder (${BLOG_ROOT}/<slug>/ with a ${NOTES_FILE}).`);
  const folder = joinPath(BLOG_ROOT, slug);
  const notePath = blogNotePath(slug);
  if (!(await host.files.exists(notePath))) {
    return reject(host, `${folder} has no ${NOTES_FILE}: insert the "blog-post" template into a new note named ${NOTES_FILE} there.`);
  }
  const post = readBlogPost(await host.files.read(notePath));
  const published = post.status !== "draft";
  const problems = [...post.problems];
  if (published && !isBlogSlug(slug)) problems.push(`the folder name "${slug}" is the post's address: use lowercase letters, digits and single hyphens`);
  if (published && problems.length > 0) return reject(host, `${notePath} is not ready to publish: ${problems.join("; ")}.`);
  if (host.git === undefined) return reject(host, "Committing needs git, which is not available here.");

  const title = post.meta?.title || slug;
  const git = await host.git.commitAndSync(folder, published ? `publish post ${title}` : `save draft post ${title}`);
  reportGit(
    host,
    published ? `Published post ${title}` : `Saved draft post ${title}`,
    git,
    published
      ? ` It is live at /blog/${slug} once the vault's publish run finishes (a few minutes).`
      : " It stays off the website until its status is public (or unlisted).",
    false,
  );
  return { action: "committed", folder, published, git };
}

function reject(host: Host, reason: string): BlogCommitOutcome {
  host.ui.notice(reason, "error");
  return { action: "rejected", reason };
}
