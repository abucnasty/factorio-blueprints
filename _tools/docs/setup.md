# Setting up a computer

Desktop only (Linux, Windows, macOS). Install git, git-lfs and
[Obsidian](https://obsidian.md), then in a terminal (Git Bash on Windows),
in a folder outside OneDrive, iCloud or Dropbox:

```sh
git clone https://github.com/abucnasty/factorio-vault.git
cd factorio-vault
_tools/setup/setup-machine.sh
```

On the owner's first machine only, create the render upload token before
that last line: run `npx wrangler login` in `_tools/lfs-worker`, then
`_tools/setup/setup-machine.sh --set-worker-secret` and save the token in
the password manager. Every other machine pastes it when the script asks.

The script checks git, your commit name and email, push access to GitHub,
the Obsidian plugins and render storage, and fixes what it can after
asking. Anything only you can do is printed as ACTION NEEDED with the exact
steps; do them and re-run until it ends with "All good". `--check` only
reports and changes nothing.

Obsidian from Flathub only: let it start renders outside its sandbox with
`flatpak override --user --talk-name=org.freedesktop.Flatpak md.obsidian.Obsidian`, then restart Obsidian.
