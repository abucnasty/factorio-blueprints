# factorio-blueprints

Version-controlled Factorio blueprints by abucnasty and the community.

Each blueprint lives in its own folder as decoded JSON next to its design
notes, so changes show up as readable diffs. The repo doubles as an Obsidian
vault: blueprints are pasted in and copied out as normal blueprint strings.

## Status

The vault, its sync and the blueprint plugin (import from the clipboard,
copy back as a string) work. Preview renders and live links are not built
yet, and there are no blueprints yet; the catalog still lives in
[factorio-benchmarks](https://github.com/abucnasty/factorio-benchmarks/blob/master/docs/blueprints/README.md).

## Layout

```
.obsidian/                  vault settings, Git plugin settings, our built plugin
_tools/docs/                setup and conventions
_tools/setup/               per-machine setup script
_tools/templates/           note templates
_tools/plugin/              blueprint plugin source and the shared core library
_tools/lfs-worker/          Git LFS server for render images
<category>/.../<slug>/      one folder per blueprint (none yet)
  README.md                 notes, with metadata in the frontmatter
  blueprint.json            the decoded blueprint
  renders/<n>.jpg           preview images (Git LFS)
```

- [Setup](_tools/docs/setup.md): set up a computer to edit and sync the vault.
- [Conventions](_tools/docs/conventions.md): layout, frontmatter and file formats.
