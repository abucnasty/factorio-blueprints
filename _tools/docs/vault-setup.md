# Vault setup

How to set up a computer so this repo opens as an Obsidian vault and syncs
itself to GitHub. Do this once per machine. Desktop only (Linux, Windows,
Mac).

After setup, Obsidian pulls when it starts and every 10 minutes, and
commits, pulls and pushes about 2 minutes after you stop editing. You do not
need to run git yourself.

## 1. Install git and git-lfs

git-lfs is not used yet; it will be needed once preview images are added.
Installing it now saves a second round later.

- **Linux:** install both from your package manager, for example
  `sudo apt install git git-lfs` or `sudo dnf install git git-lfs`.
- **Windows:** install [Git for Windows](https://git-scm.com/download/win).
  It includes git-lfs and Git Credential Manager. Keep the defaults, except
  on the line endings page choose **Checkout as-is, commit Unix-style**.
- **Mac:** install [Homebrew](https://brew.sh), then run
  `brew install git git-lfs`.

Then, in a terminal (on Windows, "Git Bash"):

1. Run `git lfs install`.
2. Set the name and email your commits will show:
   `git config --global user.name "Your Name"` and
   `git config --global user.email "you@example.com"`. Your GitHub noreply
   address (GitHub, Settings, Emails) keeps your real email out of this
   public repo.

## 2. Let git push to GitHub

Obsidian cannot show a login prompt, so git must already be able to push
without asking.

- **Windows:** nothing to do now. Git Credential Manager opens a browser
  login the first time you push in step 3.
- **Linux and Mac:** install the [GitHub CLI](https://cli.github.com)
  (`brew install gh` on Mac; see its site for Linux), then run
  `gh auth login`, choose GitHub.com, HTTPS, and "Login with a web browser".
  Answer yes when it asks to authenticate git with your GitHub credentials.

## 3. Clone the repo

Pick a folder that is **not** inside OneDrive, iCloud Drive or Dropbox;
those fight with git over the same files.

1. In a terminal, go to that folder and run
   `git clone https://github.com/abucnasty/factorio-blueprints.git`
2. Run `cd factorio-blueprints` then `git push --dry-run`. It should end with
   "Everything up-to-date" and not ask for a password (Windows may open the
   browser login once). If it fails, fix step 2 before going on.

## 4. Open it in Obsidian

1. Install [Obsidian](https://obsidian.md/download).
2. In the vault picker, choose **Open folder as vault** and select the
   `factorio-blueprints` folder (the repo root, not a subfolder).
3. If Obsidian asks whether you trust the author of this vault, choose
   **Trust author and enable plugins**. If it does not ask, open Settings,
   Community plugins, and choose **Turn on community plugins**.

## 5. Install the Git plugin

The plugin's settings are already in the repo; only the plugin itself is
installed per machine.

1. Settings, Community plugins, **Browse**.
2. Search for **Git** (author Vinzent), choose **Install**, then **Enable**.
3. Check the settings came through: Settings, Git should show "Auto
   commit-and-sync interval" set to 2 with "after stopping file edits" on,
   and "Pull on startup" on. If they are back at 0 and off, set them by hand
   to match `.obsidian/plugins/obsidian-git/data.json`.
4. Restart Obsidian. The status bar at the bottom should show git status,
   not an error.

**Mac only:** if the plugin says it cannot find git, set Settings, Git,
"Custom Git binary path" to `/opt/homebrew/bin/git` (Apple Silicon) or
`/usr/local/bin/git` (Intel), then restart Obsidian.

## 6. Check that sync works

1. Create a note called `sync-test` at the top of the vault and type a line.
2. Wait about 2 minutes without editing, or run the command palette command
   **Git: Commit-and-sync** to go now.
3. Open <https://github.com/abucnasty/factorio-blueprints/commits/main>. A
   commit named "sync edits from obsidian" should be at the top, listing
   `sync-test.md` under "Affected files".
4. Delete `sync-test`, wait again, and check that a second commit removes it.

If nothing appears, open the command palette and run **Git: Open source
control view** to see the error.

## Things to know

- Notes and settings are committed. Open tabs, layout and caches are not
  (see `.gitignore`), so each machine keeps its own window layout.
- If two machines edit the same lines before syncing, the plugin stops with
  a merge conflict and lists the files. Edit the files to keep the right
  text, remove the `<<<<<<<`, `=======` and `>>>>>>>` lines, then run
  **Git: Commit-and-sync**.
- Close Obsidian with **Git: Commit-and-sync and then close Obsidian** when
  you want to be sure the last edits are pushed.
