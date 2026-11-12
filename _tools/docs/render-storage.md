# Render storage

Preview images (`<blueprint folder>/renders/<n>.jpg`, also `.jpeg`, `.png`,
`.webp`) are stored with Git LFS. GitHub keeps only small pointer files; the
images live in the R2 bucket `factorio-blueprints-lfs`, served by our own
LFS server, the Worker in `_tools/lfs-worker/` at
`https://factorio-blueprints-lfs.abucnasty.workers.dev`. Everything else
(`blueprint.json`, notes) is plain git.

- Downloading images needs nothing.
- Uploading needs the upload token: the Worker secret `LFS_UPLOAD_TOKEN`,
  which each machine keeps in git's credential store. The Worker accepts it
  as the Basic auth password (any username) or as a Bearer token.
- `.gitattributes` decides which files are LFS, `.lfsconfig` points git-lfs
  at the Worker, and `.github/workflows/deploy-lfs-worker.yml` redeploys the
  Worker when `_tools/lfs-worker/` changes on `main`.

## On each vault machine

Install git and git-lfs (Git for Windows includes both), clone the repo, then
from the clone run:

```sh
_tools/setup/setup-render-storage.sh
```

It checks each part of the setup, fixes what it can after asking, and asks
for the upload token (input hidden) when this machine has none. Get the token
from your password manager. Re-run it any time; `--check` only reports and
exits non-zero if something needs action. `--help` lists the options.

## Once, by the owner

1. Deploy the Worker the first time by hand (the CI token cannot create
   Workers): `cd _tools/lfs-worker && npm ci && npx wrangler login && npx wrangler deploy`.
2. Create the upload token: from the clone,
   ```sh
   _tools/setup/setup-render-storage.sh --set-worker-secret
   ```
   It makes a random token, sets it on the Worker with wrangler, stores it on
   this machine, and shows it once if you ask, so you can save it in your
   password manager. Running it again rotates the token; every machine then
   needs the new one.

## Clone without images

`GIT_LFS_SKIP_SMUDGE=1 git clone <repo-url>`, then `git lfs pull` (or
`git lfs pull --include="megabasing/**"`) when you want them. To keep
skipping in that clone: `git lfs install --local --skip-smudge`.

## Troubleshooting: ACTION NEEDED messages

| Message | Fix |
|---|---|
| git / curl / git-lfs is not installed | Install it with the command shown, then re-run |
| this script is not inside a git clone / not a factorio-blueprints clone | Run the copy of the script inside your vault clone |
| git lfs install has not been run | Re-run without `--check` and accept, or run `git lfs install` in the clone |
| git-lfs endpoint is '…', expected … | Something sets `lfs.url`; the message says where. Remove it, or accept the fix |
| lock verification is '…' | Accept the fix (`lfs.<url>.locksverify false`) |
| cannot reach … / answered … with HTTP … | Check the network; if it persists, the Worker is not deployed (owner: step 1 above) |
| upload without credentials got HTTP … instead of 401 | Not our Worker, or it is broken. Do not push renders; owner investigates |
| the LFS host may use another credential helper | Accept the fix, so no login window can appear (Obsidian cannot answer one) |
| no upload token is stored | Re-run without `--check` and paste the token |
| the Worker refused the stored upload token | Paste the current token from the password manager. If it is right, the owner has not set the secret yet: run `--set-worker-secret` |
| N of M render images are pointer files | Accept the fix, or run `git lfs pull` |
| wrangler is not logged in to Cloudflare | `cd _tools/lfs-worker && npx wrangler login`, then re-run `--set-worker-secret` |
| wrangler could not set the secret | Read wrangler's output; usually the Worker is not deployed yet (step 1) |

The script's tests (local stand-in Worker, no Cloudflare):
`_tools/setup/test/test-setup-render-storage.sh`.
