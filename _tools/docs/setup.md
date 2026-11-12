# Setting up a computer

Desktop only (Linux, Windows, macOS). Install git, git-lfs and
[Obsidian](https://obsidian.md), then in a terminal (Git Bash on Windows),
in a folder outside OneDrive, iCloud or Dropbox:

```sh
git clone https://github.com/abucnasty/factorio-blueprints.git
cd factorio-blueprints
_tools/setup/setup-machine.sh
```

The script checks git and git-lfs, your commit name and email, that git can
push to GitHub without a prompt, the Obsidian plugins, and the render image
storage (it asks for the upload token from the password manager). It fixes
what it can after asking. Anything only you can do is printed as ACTION
NEEDED with the exact steps; do them and run it again until it ends with
"All good". It is safe to re-run; `--check` only reports and changes nothing.

Owner only, once (or to rotate the upload token): run
`npx wrangler login` in `_tools/lfs-worker`, then
`_tools/setup/setup-machine.sh --set-worker-secret`.
