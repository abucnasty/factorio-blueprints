# Render storage (Git LFS on R2)

Preview images (`<blueprint folder>/renders/<n>.jpg`) are stored with Git LFS.
GitHub holds only small pointer files; the image bytes live in the R2 bucket
`factorio-blueprints-lfs`, behind our own LFS server. This is the same setup
as the save files in `factorio-benchmarks`, deployed a second time with its
own bucket and its own upload token.

## How the pieces fit

| Piece | What it does |
|---|---|
| `.gitattributes` | Marks `*.jpg`, `*.jpeg`, `*.png`, `*.webp` inside any `renders/` directory as LFS files. Nothing else is LFS: `blueprint.json` and notes stay plain git |
| `.lfsconfig` | Tells git-lfs the LFS server is `https://factorio-blueprints-lfs.abucnasty.workers.dev` instead of GitHub's |
| `_tools/lfs-worker/` | The LFS server: a Cloudflare Worker named `factorio-blueprints-lfs` that implements the Git LFS batch API on top of the R2 bucket (binding `R2_BUCKET`) |
| `LFS_UPLOAD_TOKEN` | A secret stored on the Worker. Uploads must present it; downloads need nothing |
| `.github/workflows/deploy-lfs-worker.yml` | Redeploys the Worker when `_tools/lfs-worker/` changes on `main`, or when run by hand. It cannot create the Worker and never touches the secret |

On `git push`, git-lfs uploads each new image to the Worker, which writes it
to R2 under `<oid[0:2]>/<oid[2:4]>/<oid>`. Then git pushes the commits
(with pointers) to GitHub. On clone or pull, git-lfs downloads the images
from the Worker.

### What the Worker expects

- **Downloads**: no credentials. Anyone can fetch an object if they know its
  SHA-256 (the repo is public anyway).
- **Uploads** (batch `upload`, `PUT /objects/<oid>`, `POST .../verify`): the
  `Authorization` header must carry the upload token, as either
  - `Basic` auth with the token as the **password** (the username is
    ignored; we use `lfs`), which is what git-lfs sends from git's
    credential helper, or
  - `Bearer <token>`.

  Anything else gets `401`. If the secret has not been set on the Worker,
  every upload is refused.

In practice: git-lfs first asks without credentials, gets `401`, asks git's
credential helper for `factorio-blueprints-lfs.abucnasty.workers.dev`, and
retries with Basic auth. The Worker's reply then tells git-lfs to send the
token as `Bearer` on the actual upload. After the first success git-lfs
records `lfs.<url>.access = basic` in the clone's `.git/config`; that is
expected.

## First deploy (once, by hand)

The CI token can update the Worker but cannot create it, so the first deploy
is done from a machine where you can log in to Cloudflare. Nothing else in
the account changes: the bucket already exists.

1. `cd _tools/lfs-worker`
2. `npm ci`
3. `npx wrangler login` (or export a `CLOUDFLARE_API_TOKEN` that can create
   Workers, plus `CLOUDFLARE_ACCOUNT_ID`)
4. `npx wrangler deploy --dry-run` and check the output lists
   `R2_BUCKET: factorio-blueprints-lfs`
5. `npx wrangler deploy` and check it reports
   `https://factorio-blueprints-lfs.abucnasty.workers.dev`
6. Set the upload token, next section.

After this, the GitHub workflow handles redeploys.

## Set the upload token on the Worker

Use a new token, not the benchmarks one, so vault machines cannot write
benchmark data. A hex token is easiest because it needs no escaping anywhere.

1. Generate one: `openssl rand -hex 32`. Save it in your password manager;
   this is the only copy you will see.
2. Put it on the Worker, either way:
   - Command line, from `_tools/lfs-worker`:
     `npx wrangler secret put LFS_UPLOAD_TOKEN`, then paste the token at the
     prompt.
   - Dashboard: Workers & Pages → `factorio-blueprints-lfs` → Settings →
     Variables and Secrets → Add → type **Secret**, name `LFS_UPLOAD_TOKEN`,
     paste the value → Deploy.
3. To rotate later, repeat both steps and update every vault machine (below).

The secret stays on the Worker across later deploys.

## Set up a vault machine

Do this on each machine (Linux, Windows with Git Bash, macOS).

1. Install Git LFS: https://git-lfs.com/ (Git for Windows already includes
   it). Then, once per machine:
   ```sh
   git lfs install
   ```
   Do this **before** cloning, otherwise images check out as small pointer
   text files.
2. Clone the repo as usual and `cd` into it. Run `git lfs env` and check it
   shows `Endpoint=https://factorio-blueprints-lfs.abucnasty.workers.dev`.
3. Tell git to use only the plain credential store for the LFS server. The
   empty first value clears any other helper (for example Git Credential
   Manager), which would otherwise pop up a login window:
   ```sh
   git config --local --add 'credential.https://factorio-blueprints-lfs.abucnasty.workers.dev.helper' ''
   git config --local --add 'credential.https://factorio-blueprints-lfs.abucnasty.workers.dev.helper' store
   ```
4. Store the upload token. This reads it without echoing it or putting it
   in your shell history, and saves it to `~/.git-credentials` (mode 600):
   ```sh
   printf 'Upload token: '; read -rs LFS_TOKEN; echo
   printf 'protocol=https\nhost=factorio-blueprints-lfs.abucnasty.workers.dev\nusername=lfs\npassword=%s\n\n' "$LFS_TOKEN" | git credential approve
   unset LFS_TOKEN
   ```
5. Check it:
   ```sh
   printf 'protocol=https\nhost=factorio-blueprints-lfs.abucnasty.workers.dev\n\n' | git credential fill
   ```
   It should print `username=lfs` and a `password=` line.

Machines that only read (never commit renders) need just steps 1 and 2.

Do not use `git config lfs.<url>.Authorization` instead; the benchmarks repo
found git-lfs ignores it once `access=basic` is cached.

## Check that it works

1. Server answers. A download request for an object that does not exist
   should return `200` with a per-object `"code":404`:
   ```sh
   curl -sS -X POST https://factorio-blueprints-lfs.abucnasty.workers.dev/objects/batch \
     -H 'Content-Type: application/vnd.git-lfs+json' \
     -d '{"operation":"download","objects":[{"oid":"0000000000000000000000000000000000000000000000000000000000000000","size":1}]}'
   ```
   The same with `"operation":"upload"` and no credentials should return
   `{"message":"Credentials required"}` (HTTP 401).
2. On a set-up vault machine, put any image at `<some blueprint folder>/renders/0.jpg`
   and `git add` it.
3. `git lfs ls-files` lists it. `git show :<path>/renders/0.jpg` prints a
   three-line pointer (`version`, `oid sha256:…`, `size`), not image bytes.
4. Commit and `git push`. The output includes an `Uploading LFS objects` line
   and no auth prompt.
5. Clone fresh somewhere else: `git clone <repo-url> /tmp/bp-check`, then in
   it run `git lfs ls-files` (a `*` after the oid means the file is present)
   and open the image. It should be the real picture, not a pointer.
6. If this was only a test image, `git rm` it and push. The object stays in
   R2, which is harmless.

## Clone without downloading images

```sh
GIT_LFS_SKIP_SMUDGE=1 git clone <repo-url>
cd factorio-blueprints
# later, fetch only what you need:
git lfs pull --include="megabasing/**"
# or everything:
git lfs pull
```

To keep skipping images on every later pull in that clone:
`git lfs install --local --skip-smudge`. Undo with `git lfs install --local`
followed by `git lfs pull`.

## Troubleshooting

- **A login window appears for `factorio-blueprints-lfs.abucnasty.workers.dev`.**
  Step 3 of the machine setup is missing, or git-lfs cached `access=basic`
  before the credential was stored. Run steps 3 to 5 again, then:
  `git config --local --unset 'lfs.https://factorio-blueprints-lfs.abucnasty.workers.dev.access'`.
- **Push fails with 401.** The stored token does not match the Worker secret,
  or the secret is not set. Re-run step 4 with the current token.
- **Images are small text files.** Git LFS was not installed when the clone
  was made. Run `git lfs install` then `git lfs pull` in the clone.

## Not yet verified

- The real deploy, the secret, and real uploads and downloads against the
  bucket have not been run.
- Pushing through Obsidian's git plugin. It calls system git, so the
  credential store above should be used without a prompt, but there is no
  terminal to answer one if it is missing; this needs a check on each machine.
