# factorio-blueprints

Version-controlled Factorio blueprints by abucnasty and the community.

Each blueprint lives in its own folder as decoded JSON next to its design
notes, so changes show up as readable diffs. The repo doubles as an Obsidian
vault: blueprints are pasted in and copied out as normal blueprint strings.

## Status

The catalog is imported: 28 blueprints, each with its recorded versions
(`versions.json`, named by the note's `version`). Every blueprint has a
live link that returns its string, for the latest version or any earlier
one by its label. Each entry of a book has its own link, by its slot in the
book:

```
https://blueprints.abucnasty.dev/<folder path>.txt
https://blueprints.abucnasty.dev/<folder path>@<version>.txt
https://blueprints.abucnasty.dev/<folder path>/<slot>/<slot>.txt
https://blueprints.abucnasty.dev/index.json
```

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
<category>/.../<slug>/      one folder per blueprint
  README.md                 notes, with metadata in the frontmatter
  blueprint.json            the decoded blueprint
  renders/<slot path>.jpg   preview images (Git LFS): 0.jpg, or 3/1.jpg in a book
```

- [Setup](_tools/docs/setup.md): set up a computer to edit and sync the vault.
- [Conventions](_tools/docs/conventions.md): layout, frontmatter and file formats.
