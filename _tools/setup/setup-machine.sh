#!/usr/bin/env bash
# Checks that this computer can edit and sync the factorio-blueprints vault,
# and fixes what it can, asking first. Safe to re-run. See --help.
#
# Runs on bash 3.2 (macOS), Linux and Git Bash. The LFS upload token is only
# held in shell variables and handed to programs on stdin; it is never an
# argument, never printed (unless the owner asks in --set-worker-secret), and
# only stored in git's credential store. GitHub credentials are left to git,
# gh or Git Credential Manager; this script never reads them.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: _tools/setup/setup-machine.sh [--check] [--yes] [--set-worker-secret]

Checks this computer's setup for the vault (git, GitHub push, Obsidian
plugins, render storage) and fixes what is missing, asking first.

  --check              Only report; change nothing. Exit 1 if anything needs action.
  --yes                Apply fixes without asking (typed values are still asked for).
  --set-worker-secret  Owner: make a new LFS upload token, set it on the Worker
                       with wrangler, and store it on this machine. Any older
                       token stops working. Needs: npx wrangler login, in
                       _tools/lfs-worker.
  -h, --help           Show this help.

SETUP_LFS_URL overrides the LFS endpoint from .lfsconfig (for testing).
EOF
}

MODE=setup; YES=0
for arg in "$@"; do
  case "$arg" in
    --check) MODE=check ;;
    --yes|-y) YES=1 ;;
    --set-worker-secret) MODE=secret ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; usage >&2; exit 2 ;;
  esac
done

NEEDS=0; TODO=""
pass()   { echo "PASS           $1"; }
fixed()  { echo "FIXED          $1"; }
info()   { echo "INFO           $1"; }
action() { NEEDS=$((NEEDS + 1)); echo "ACTION NEEDED  $1"; printf '               -> %s\n' "$2"; TODO="$TODO  - $1: $2"$'\n'; }
stop() { summary || true; exit 1; }
# ask "question": may we fix this? Never in --check.
ask() {
  [ "$MODE" = check ] && return 1
  [ "$YES" = 1 ] && { echo "$1 yes (--yes)"; return 0; }
  local reply=""; printf '%s [y/N] ' "$1"; read -r reply || true
  case "$reply" in [Yy]*) return 0 ;; *) return 1 ;; esac
}

TMPD=$(mktemp -d "${TMPDIR:-/tmp}/setup-machine.XXXXXX")
trap 'rm -rf "$TMPD"' EXIT
g() { git -C "$REPO" "$@"; }

OS=other
case "$(uname -s)" in Darwin) OS=mac ;; Linux) OS=linux ;; MINGW*|MSYS*|CYGWIN*) OS=windows ;; esac
hint() {
  case "$OS" in
    mac) echo "brew install $1 (Homebrew: https://brew.sh)" ;;
    windows) echo "install Git for Windows (https://git-scm.com/download/win); it includes git, git-lfs, curl and Git Credential Manager" ;;
    *) echo "install $1 with your package manager (e.g. sudo apt-get install $1)" ;;
  esac
}

# ── git and the clone ────────────────────────────────────────────────────

check_tools() {
  local t
  for t in git curl; do
    command -v "$t" >/dev/null 2>&1 || { action "$t is not installed" "$(hint "$t")"; stop; }
  done
  git lfs version >/dev/null 2>&1 || { action "git-lfs is not installed" "$(hint git-lfs)"; stop; }
  pass "git, curl and git-lfs are installed (Obsidian is not checked: install it from https://obsidian.md)"
}

check_clone() {
  local dir branch origin; dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
  REPO=$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null) && [ -f "$REPO/.lfsconfig" ] &&
    [ -f "$REPO/.obsidian/plugins/factorio-blueprints/manifest.json" ] ||
    { action "this script is not inside a clone of the vault" \
        "git clone https://github.com/abucnasty/factorio-vault.git, then run the script from that clone"; stop; }
  branch=$(g rev-parse --abbrev-ref HEAD 2>/dev/null || echo "?")
  origin=$(g config --get remote.origin.url || true)
  pass "clone at $REPO, branch $branch, origin ${origin:-none}"
  case "$REPO" in
    *OneDrive*|*Dropbox*|*iCloud*|*"Mobile Documents"*)
      action "the clone is inside a synced folder (OneDrive, Dropbox or iCloud), which fights git over files" \
        "clone it again somewhere outside that folder and run the script there" ;;
  esac
  [ "$branch" = main ] || info "on branch $branch; Obsidian syncs whatever branch is checked out"
  [ -n "$origin" ] || { action "the clone has no origin remote" "git remote add origin https://github.com/abucnasty/factorio-vault.git"; }
  LFS_URL=${SETUP_LFS_URL:-$(git config -f "$REPO/.lfsconfig" --get lfs.url || true)}
  LFS_URL=${LFS_URL%/}
  [ -n "$LFS_URL" ] || { action ".lfsconfig has no lfs.url" "restore .lfsconfig from origin/main"; stop; }
  local rest=${LFS_URL#*://}
  PROTO=${LFS_URL%%://*}; HOST=${rest%%/*}; HELPER_KEY="credential.$PROTO://$HOST.helper"
}

check_identity() {
  local key label val example
  for key in user.name user.email; do
    if val=$(g config --get "$key") && [ -n "$val" ]; then pass "$key is $val"; continue; fi
    label=name; example="Your Name"
    if [ "$key" = user.email ]; then
      label=email; example="your GitHub noreply address (GitHub, Settings, Emails: 12345+name@users.noreply.github.com), since the repo is public"
    fi
    val=""
    if [ "$MODE" != check ]; then
      printf 'Commit %s for this clone (%s): ' "$label" "$example"; read -r val || true
    fi
    if [ -n "$val" ]; then
      g config --local "$key" "$val"; fixed "$key set to $val for this clone"
    else
      action "git $key is not set" "run: git config --global $key \"...\" (or re-run and type it)"
    fi
  done
}

check_push() {
  [ -n "$(g config --get remote.origin.url || true)" ] || return 0
  local out ssh=""
  [ -n "${GIT_SSH_COMMAND:-}" ] || [ -n "$(g config --get core.sshCommand || true)" ] || ssh="ssh -o BatchMode=yes"
  # A dry run to a branch name that cannot exist authenticates like a real
  # push but changes nothing. Prompts are off, as they are in Obsidian.
  if out=$(env GIT_TERMINAL_PROMPT=0 GIT_ASKPASS="" SSH_ASKPASS="" GCM_INTERACTIVE=never ${ssh:+"GIT_SSH_COMMAND=$ssh"} \
      git -C "$REPO" push --dry-run --no-verify origin HEAD:refs/heads/setup-machine-push-check 2>&1); then
    pass "git can push to origin without a prompt"
    return
  fi
  case "$OS" in
    windows)
      if ask "git cannot push to origin without a prompt. Open the Git Credential Manager login now?" &&
         git -C "$REPO" push --dry-run --no-verify origin HEAD:refs/heads/setup-machine-push-check >/dev/null 2>&1; then
        fixed "signed in to GitHub with Git Credential Manager"
        return
      fi
      action "git cannot push to origin without a prompt" \
        "in Git Bash in this folder run: git push --dry-run (sign in when the browser opens), then re-run" ;;
    *)
      if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1 &&
         ask "GitHub CLI is signed in but git does not use it. Run 'gh auth setup-git'?"; then
        gh auth setup-git
        if GIT_TERMINAL_PROMPT=0 GIT_ASKPASS="" SSH_ASKPASS="" git -C "$REPO" push --dry-run --no-verify origin HEAD:refs/heads/setup-machine-push-check >/dev/null 2>&1; then
          fixed "git now pushes with the GitHub CLI login"
          return
        fi
      fi
      action "git cannot push to origin without a prompt ($(printf '%s' "$out" | grep -m1 -iE 'fatal|error|denied' || echo 'see git push --dry-run'))" \
        "install the GitHub CLI (https://cli.github.com), run: gh auth login (GitHub.com, HTTPS, web browser), then: gh auth setup-git" ;;
  esac
}

# ── Obsidian vault ───────────────────────────────────────────────────────

check_vault() {
  local p="$REPO/.obsidian/plugins" line bad=0
  if [ -f "$p/obsidian-git/main.js" ]; then
    pass "Obsidian Git plugin is installed in this vault"
  else
    action "the Obsidian Git plugin is not installed in this vault" \
      "in Obsidian: Open folder as vault ($REPO); choose Trust author and enable plugins (or Settings, Community plugins, Turn on); Settings, Community plugins, Browse, install and enable \"Git\" by Vinzent; restart Obsidian; re-run this script"
  fi
  # Obsidian may add keys to the Git plugin's data.json; the shared values
  # committed in the repo must still be there.
  if [ -f "$p/obsidian-git/data.json" ]; then
    while IFS= read -r line; do
      line=${line%,}
      case "$line" in *'": '*) grep -qF -- "$line" "$p/obsidian-git/data.json" || bad=1 ;; esac
    done <<EOF
$(g show HEAD:.obsidian/plugins/obsidian-git/data.json 2>/dev/null)
EOF
  else
    bad=1
  fi
  if [ "$bad" = 0 ]; then
    pass "Git plugin sync settings match the repo (commit 2 minutes after edits, pull on start)"
  elif ask "The Git plugin's sync settings differ from the repo. Restore .obsidian/plugins/obsidian-git/data.json?"; then
    g checkout HEAD -- .obsidian/plugins/obsidian-git/data.json; fixed "Git plugin settings restored (restart Obsidian)"
  else
    action "the Git plugin's sync settings differ from the repo" "run: git checkout HEAD -- .obsidian/plugins/obsidian-git/data.json, then restart Obsidian"
  fi
  if [ -f "$p/factorio-blueprints/main.js" ] && [ -f "$p/factorio-blueprints/manifest.json" ]; then
    pass "Factorio Blueprints plugin build is present"
  elif ask "The Factorio Blueprints plugin build is missing. Restore it from git?"; then
    g checkout HEAD -- .obsidian/plugins/factorio-blueprints; fixed "Factorio Blueprints plugin restored"
  else
    action "the Factorio Blueprints plugin build is missing" "run: git checkout HEAD -- .obsidian/plugins/factorio-blueprints"
  fi
  if [ "$OS" = mac ] && [ "$(command -v git)" != /usr/bin/git ]; then
    info "if Obsidian says it cannot find git: Settings, Git, Custom Git binary path = $(command -v git); same for Settings, Factorio Blueprints, Git binary"
  fi
}

# ── render storage (Git LFS on the Worker) ───────────────────────────────

# probe OPERATION [USER PASS]: batch request for an oid that is never stored;
# prints the HTTP status, 000 if unreachable. Any credential reaches curl on
# stdin as a header line, and an accepted upload reply (it echoes the token)
# is discarded.
probe() {
  local out="$TMPD/resp" hdr="" code
  printf '{"operation":"%s","objects":[{"oid":"%064d","size":1}]}' "$1" 0 >"$TMPD/req"
  if [ -n "${3:-}" ]; then
    out=/dev/null
    hdr="Authorization: Basic $(printf '%s:%s' "$2" "$3" | base64 | tr -d '\r\n')"
  fi
  code=$(printf '%s\n' "$hdr" | curl -sS -o "$out" -w '%{http_code}' --max-time 20 -H @- \
    -H 'Content-Type: application/vnd.git-lfs+json' -H 'Accept: application/vnd.git-lfs+json' \
    --data-binary @"$TMPD/req" "$LFS_URL/objects/batch" 2>/dev/null) || code=000
  hdr=""
  echo "${code:-000}"
}

check_worker() {
  local code; code=$(probe download)
  if [ "$code" != 200 ] || ! grep -q '"objects"' "$TMPD/resp"; then
    action "the LFS Worker at $LFS_URL did not answer a download request (HTTP $code)" \
      "check your connection; if it persists the owner checks the Worker in the Cloudflare dashboard"
    stop
  fi
  code=$(probe upload)
  [ "$code" = 401 ] || { action "an LFS upload without a token got HTTP $code, not 401" "do not push renders; the owner checks the Worker"; stop; }
  pass "LFS Worker answers: downloads open, uploads need the token"
}

check_lfs_install() {
  local hooks; hooks=$(g rev-parse --git-path hooks)
  case "$hooks" in /*|?:*) ;; *) hooks="$REPO/$hooks" ;; esac
  if [ -n "$(g config --get filter.lfs.process || true)" ] && grep -qs 'git[- ]lfs' "$hooks/pre-push"; then
    pass "git lfs install has been run"
  elif ask "Run 'git lfs install' (LFS filters for your user, hooks for this clone)?"; then
    g lfs install >/dev/null; fixed "ran git lfs install"
  else
    action "git lfs install has not been run" "run: git lfs install (in the clone)"
  fi
}

check_endpoint() {
  local ep lv
  ep=$(g lfs env 2>/dev/null | sed -n 's/^Endpoint=\([^ ]*\).*/\1/p' | sed -n 1p || true)
  if [ "${ep%/}" = "$LFS_URL" ]; then
    pass "git-lfs uses $LFS_URL"
  elif ask "git-lfs uses '${ep:-nothing}'. Set this clone's lfs.url to $LFS_URL?"; then
    g config --local lfs.url "$LFS_URL"; fixed "lfs.url set to $LFS_URL"
  else
    action "git-lfs uses '${ep:-nothing}', not $LFS_URL" "remove the overriding lfs.url (see: git config --show-origin --get-all lfs.url)"
  fi
  lv=$(g config --get-urlmatch lfs.locksverify "$LFS_URL" || git config -f "$REPO/.lfsconfig" --get lfs.locksverify || true)
  if [ "$lv" = false ]; then
    pass "LFS lock verification is off (the Worker has no lock API)"
  elif ask "Turn off LFS lock verification for $LFS_URL in this clone?"; then
    g config --local "lfs.$LFS_URL.locksverify" false; fixed "LFS lock verification off"
  else
    action "LFS lock verification is '${lv:-unset}'" "run: git config --local lfs.$LFS_URL.locksverify false"
  fi
}

helper_ok() {
  local vals; vals=$(g config --get-all "$HELPER_KEY" || true)
  [ -n "$vals" ] && [ -z "$(printf '%s\n' "$vals" | sed -n 1p)" ] && printf '%s\n' "$vals" | grep -qx store
}
set_helper() {
  # An empty value first drops other helpers (e.g. Git Credential Manager),
  # whose login window Obsidian's git plugin could not answer.
  g config --local --unset-all "$HELPER_KEY" >/dev/null 2>&1 || true
  g config --local --add "$HELPER_KEY" ""
  g config --local --add "$HELPER_KEY" store
}
check_helper() {
  if helper_ok; then pass "only git's credential store is used for $HOST"
  elif ask "Use only git's credential store for $HOST in this clone (no login windows)?"; then
    set_helper; fixed "credential store set for $HOST"
  else
    action "another credential helper may open a login window for $HOST" "re-run without --check and accept"
  fi
}

# read_cred: ask git for the stored LFS credential without any prompt; sets
# CUSER and CPASS. Parsed with expansions only (no temp files).
read_cred() {
  CUSER=""; CPASS=""
  local out nl=$'\n'
  out=$(printf 'protocol=%s\nhost=%s\n\n' "$PROTO" "$HOST" |
    GIT_TERMINAL_PROMPT=0 GIT_ASKPASS="" SSH_ASKPASS="" git -C "$REPO" credential fill 2>/dev/null) || return 1
  out="$nl$out$nl"
  case "$out" in *"${nl}username="*) CUSER=${out#*"${nl}"username=}; CUSER=${CUSER%%"${nl}"*} ;; esac
  case "$out" in *"${nl}password="*) CPASS=${out#*"${nl}"password=}; CPASS=${CPASS%%"${nl}"*} ;; esac
  [ -n "$CPASS" ]
}
# store_cred TOKEN: replace the stored credential for the host.
store_cred() {
  printf 'protocol=%s\nhost=%s\n\n' "$PROTO" "$HOST" | g credential reject >/dev/null 2>&1 || true
  printf 'protocol=%s\nhost=%s\nusername=lfs\npassword=%s\n\n' "$PROTO" "$HOST" "$1" | g credential approve
}
SECRET_CMDS="npx wrangler login in _tools/lfs-worker, then _tools/setup/setup-machine.sh --set-worker-secret"
SECRET_STEP="owner: $SECRET_CMDS"

# prompt_and_store: read a token with echo off and store it. Empty or
# whitespace-only input stores nothing.
prompt_and_store() {
  local tok=""
  printf 'Paste the LFS upload token (hidden; leave empty to skip): '
  read -rs tok || true; echo
  tok=${tok#"${tok%%[![:space:]]*}"}; tok=${tok%"${tok##*[![:space:]]}"}
  [ -n "$tok" ] || { echo "Nothing entered; no token stored."; return 1; }
  store_cred "$tok"; tok=""
  read_cred
}

# refused_causes NEW: both reasons the Worker answers 401; the never-set one
# first when this machine stored its first token in this run.
refused_causes() {
  local never="the upload token has never been set on the Worker ($SECRET_STEP)"
  local stale="this token is old or mistyped (re-run and paste the current one from the password manager)"
  if [ "$1" = 1 ]; then echo "either $never, or $stale"; else echo "either $stale, or $never"; fi
}

check_token() {
  local new=0 tries=0 code
  if read_cred; then
    pass "an LFS upload token is stored for $HOST"
  else
    if [ "$MODE" != check ]; then
      echo "The LFS upload token is in the owner's password manager. If it has never been"
      echo "created (first-time setup), leave this empty and instead run: $SECRET_CMDS"
      if prompt_and_store; then new=1; fixed "LFS upload token stored in git's credential store"; fi
    fi
    if [ "$new" = 0 ]; then
      action "no LFS upload token is stored for $HOST" \
        "paste it from the owner's password manager by re-running this script; if it was never created: $SECRET_STEP"
      return
    fi
  fi
  while :; do
    code=$(probe upload "$CUSER" "$CPASS")
    if [ "$code" = 200 ]; then
      if [ "$tries" = 0 ]; then pass "the LFS Worker accepts the stored token"
      else fixed "the LFS Worker accepts the stored token"; fi
      break
    fi
    if [ "$code" != 401 ]; then
      action "the LFS Worker answered HTTP $code when testing the token" "try again later"
      break
    fi
    # The Worker answers 401 both for a wrong token and when no secret is set.
    if [ "$MODE" != check ] && [ "$tries" -lt 2 ]; then
      echo "The LFS Worker refused the stored token: $(refused_causes "$new")."
      if ask "Enter a different token?" && prompt_and_store; then
        tries=$((tries + 1)); continue
      fi
    fi
    action "the LFS Worker refused the stored token (HTTP 401)" "$(refused_causes "$new")"
    break
  done
  CPASS=""
}

check_images() {
  local list total missing
  list=$(g lfs ls-files 2>/dev/null || true)
  total=$(printf '%s' "$list" | grep -c . || true)
  missing=$(printf '%s' "$list" | grep -c '^[0-9a-f]* - ' || true)
  if [ "$missing" = 0 ]; then pass "render images downloaded ($total)"
  elif g config --get filter.lfs.smudge | grep -q -- --skip; then info "$missing of $total images not downloaded; this clone skips them on purpose"
  elif ask "$missing of $total render images are pointer files. Run 'git lfs pull'?"; then g lfs pull; fixed "render images downloaded"
  else action "$missing of $total render images are pointer files" "run: git lfs pull"
  fi
}

set_worker_secret() {
  local dir="$REPO/_tools/lfs-worker" tok out tries=0 code reply=""
  command -v npx >/dev/null 2>&1 || { action "node/npx is not installed" "install Node.js LTS from https://nodejs.org"; stop; }
  if [ ! -e "$dir/node_modules/.bin/wrangler" ]; then
    if ask "Install wrangler with 'npm ci' in _tools/lfs-worker?"; then (cd "$dir" && npm ci); fixed "wrangler installed"
    else action "wrangler is not installed" "run: cd _tools/lfs-worker && npm ci"; stop; fi
  fi
  if ! out=$(cd "$dir" && npx --no-install wrangler whoami 2>&1) || printf '%s' "$out" | grep -qi 'not authenticated'; then
    action "wrangler is not logged in to Cloudflare" "run: cd _tools/lfs-worker && npx wrangler login"; stop
  fi
  pass "wrangler is logged in"
  ask "Replace LFS_UPLOAD_TOKEN on the Worker? Every other machine will need the new token." || { info "nothing changed"; exit 1; }
  tok=$(od -An -tx1 -N32 /dev/urandom | tr -d ' \n')
  [ "${#tok}" = 64 ] || { action "could not generate a token" "check /dev/urandom and od"; stop; }
  if ! out=$(printf '%s' "$tok" | (cd "$dir" && npx --no-install wrangler secret put LFS_UPLOAD_TOKEN) 2>&1); then
    printf '%s\n' "${out//$tok/[hidden]}"
    action "wrangler could not set the secret" "read the output above"; stop
  fi
  fixed "LFS_UPLOAD_TOKEN set on the Worker"
  helper_ok || set_helper
  store_cred "$tok"; read_cred || true
  while code=$(probe upload "$CUSER" "$CPASS") && [ "$code" != 200 ] && [ "$tries" -lt 5 ]; do
    tries=$((tries + 1)); echo "waiting for the new secret to take effect ($tries/5)"; sleep 5
  done
  CPASS=""
  if [ "$code" = 200 ]; then fixed "token stored on this machine and accepted"
  else action "the Worker does not accept the new token yet (HTTP $code)" "wait a minute, then run this script without options"; fi
  echo "Save the token in your password manager for your other machines."
  if [ "$YES" != 1 ] && { : >/dev/tty; } 2>/dev/null; then
    printf 'Show it once now on this terminal? [y/N] ' >/dev/tty; read -r reply </dev/tty || true
    case "$reply" in
      [Yy]*) printf '\n  %s\n\nPress Enter once saved (the screen will be cleared). ' "$tok" >/dev/tty
             read -r _ </dev/tty || true; printf '\033[2J\033[3J\033[H' >/dev/tty ;;
    esac
  fi
  tok=""
  echo "Then run this script without options to check the rest of this machine."
}

summary() {
  if [ "$NEEDS" -gt 0 ]; then
    printf '\n%s thing(s) need action:\n%sThen re-run %s\n' "$NEEDS" "$TODO" "$0"
    return 1
  fi
  echo
  echo "All good. Next: open this folder in Obsidian and edit any note. Within"
  echo "about 2 minutes a commit \"sync edits from obsidian\" should appear at"
  echo "https://github.com/abucnasty/factorio-vault/commits/main"
}

check_tools
check_clone
if [ "$MODE" = secret ]; then
  check_worker
  set_worker_secret
else
  check_identity
  check_push
  check_vault
  check_lfs_install
  check_endpoint
  check_worker
  check_helper
  check_token
  check_images
fi
summary
