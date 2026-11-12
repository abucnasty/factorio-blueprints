# factorio-blueprints

Version-controlled Factorio blueprints by abucnasty and the community.

Each blueprint lives in its own folder as decoded JSON next to its design
notes, so changes show up as readable diffs. The repo doubles as an Obsidian
vault: blueprints are pasted in and copied out as normal blueprint strings.

## Status

The vault skeleton is in place: Obsidian settings, the Git plugin's sync
settings and the notes template. The blueprint plugin can import a string
from the clipboard (creating or updating a blueprint folder, then
committing and pushing it) and copy a blueprint back as a string; see
[its README](_tools/plugin/README.md). Rendering previews and live links
are not built yet. There are no blueprints yet; the catalog currently
still lives in
[factorio-benchmarks](https://github.com/abucnasty/factorio-benchmarks/blob/master/docs/blueprints/README.md).

## Layout

```
.obsidian/                  vault settings, Git plugin settings, our built plugin
_tools/docs/                design docs and setup guides
_tools/templates/           note templates
_tools/plugin/              blueprint plugin source and the shared core library
<category>/.../<slug>/      one folder per blueprint (none yet)
  README.md                 notes, with metadata in the frontmatter
  blueprint.json            the decoded blueprint
```

- [Vault setup](_tools/docs/vault-setup.md): set up a computer to edit and
  sync the vault.
- [Conventions](_tools/docs/conventions.md): layout, frontmatter and file
  formats every tool follows.
- [Proposal](_tools/docs/proposal.md): the design and the build phases.
