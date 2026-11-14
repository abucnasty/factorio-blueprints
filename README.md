# factorio-vault

Version-controlled Factorio blueprints by abucnasty and the community.

Each blueprint lives in its own folder under `blueprints/` as decoded JSON
next to its design notes, so changes show up as readable diffs. The repo doubles as an Obsidian
vault: blueprints are pasted in and copied out as normal blueprint strings.

## Status

The catalog is imported: 28 blueprints, each with its recorded versions
(`versions.json`, named by the note's `version`). Every blueprint has a
live link that returns its string, for the latest version or any earlier
one by its label. Each entry of a book has its own link, by its slot in the
book:

```
https://vault.abucnasty.dev/blueprints/<path>.txt
https://vault.abucnasty.dev/blueprints/<path>@<version>.txt
https://vault.abucnasty.dev/blueprints/<path>/<slot>/<slot>.txt
https://vault.abucnasty.dev/index.json
```

`<path>` is the folder path inside `blueprints/`. The old
`https://blueprints.abucnasty.dev/<path>.txt` links redirect there for a
few weeks.

The Obsidian plugin imports a string from the clipboard and copies one back.
The render tool makes preview images from the real game; no previews are
committed yet.

## Layout

```
.obsidian/                  vault settings, Git plugin settings, our built plugin
_tools/docs/                setup and conventions
_tools/setup/               per-machine setup script
_tools/templates/           note templates
_tools/plugin/              blueprint plugin source and the shared core library
_tools/render/              in-game preview renderer
_tools/ci/                  catalog validation and index builder
_tools/link-worker/         serves the live links
_tools/lfs-worker/          Git LFS server for render images
blueprints/<category>/.../<slug>/
                            one folder per blueprint
  README.md                 notes, with metadata in the frontmatter
  blueprint.json            the decoded blueprint
  renders/<slot path>.jpg   preview images (Git LFS): 0.jpg, or 3/1.jpg in a book
blog/<slug>/                one folder per post on abucnasty.dev/blog/<slug>
  README.md                 the post, with its metadata in the frontmatter
```

Only `blueprints/` and `blog/` are published.

## Writing a blog post

1. Make a folder `blog/<slug>/`: the slug is the address,
   `abucnasty.dev/blog/<slug>`, in lowercase words joined by `-`.
2. In it, make a note named `README.md` and run **Templates: Insert
   template** with `blog-post`. Fill in `title`, `date`, `description` and
   `tags`, and write the post below the frontmatter.
3. Put images in the folder (or a subfolder such as `screenshots/`) and link
   them relatively: `![Nauvis hub at 60 FPS](./screenshots/hub-60.jpg)`.
4. Set `status: public` when it is ready (`unlisted` to share it by link
   only). While it is `draft` it is never published.
5. Right-click the folder (or run it from the command palette in the
   post's note) and choose **Commit blog post**: it checks the frontmatter,
   then commits and pushes the folder. CI publishes it to
   `https://vault.abucnasty.dev/blog/` a few minutes later, and the site
   shows it from there; no site change or deploy is needed.

Setting `status: draft` again (and committing) takes a post offline. The
details are in [Conventions](_tools/docs/conventions.md#blog-posts).

- [Setup](_tools/docs/setup.md): set up a computer to edit and sync the vault.
- [Conventions](_tools/docs/conventions.md): layout, frontmatter and file formats.
