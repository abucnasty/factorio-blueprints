# factorio-blueprints

Version-controlled Factorio blueprints by abucnasty and the community.

Each blueprint lives in its own folder as decoded JSON next to its design
notes, so changes show up as readable diffs. The repo doubles as an Obsidian
vault: blueprints are pasted in and copied out as normal blueprint strings.

## Status

The vault skeleton is in place: Obsidian settings, the Git plugin's sync
settings and the notes template. There are no blueprints yet, and the
import, copy and render plugin is not built. The catalog currently still
lives in
[factorio-benchmarks](https://github.com/abucnasty/factorio-benchmarks/blob/master/docs/blueprints/README.md).

## Layout

```
.obsidian/                  vault settings and Git plugin settings
_tools/docs/                design docs and setup guides
_tools/templates/           note templates
<category>/.../<slug>/      one folder per blueprint (none yet)
  README.md                 notes, with metadata in the frontmatter
  blueprint.json            the decoded blueprint
```

- [Vault setup](_tools/docs/vault-setup.md): set up a computer to edit and
  sync the vault.
- [Conventions](_tools/docs/conventions.md): layout, frontmatter and file
  formats every tool follows.
- [Proposal](_tools/docs/proposal.md): the design and the build phases.
