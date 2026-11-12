#!/usr/bin/env bash
# Checks this machine's Git LFS setup for render images and fixes what it
# can, asking first. Safe to re-run. See --help.
#
# Runs on bash 3.2 (macOS), Linux and Git Bash. The upload token is only held
# in shell variables and handed to programs on stdin; it is never an
# argument, never printed (unless the owner asks in --set-worker-secret), and
# only stored in git's credential store.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: _tools/setup/setup-render-storage.sh [--check] [--yes] [--set-worker-secret]

Checks Git LFS for render images on this machine and fixes what is missing,
asking first. Asks for the upload token (hidden) if none is stored.

  --check              Only report; change nothing. Exit 1 if anything needs action.
  --yes                Apply fixes without asking (the token is still asked for).
  --set-worker-secret  Owner: make a new upload token, set it as LFS_UPLOAD_TOKEN
                       on the Worker with wrangler, and store it on this machine.
                       Any older token stops working.
  -h, --help           Show this help.

RENDER_STORAGE_LFS_URL overrides the endpoint from .lfsconfig (for testing).
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
action() { NEEDS=$((NEEDS + 1)); echo "ACTION NEEDED  $1"; echo "               -> $2"; TODO="$TODO  - $1: $2"$'\n'; }
summary() {
  if [ "$NEEDS" -gt 0 ]; then printf '\n%s thing(s) need action:\n%sThen re-run %s\n' "$NEEDS" "$TODO" "$0"; return 1; fi
  echo; echo "All good."
}
stop() { summary || true; exit 1; }
# ask "question": may we fix this? Never in --check.
ask() {
  [ "$MODE" = check ] && return 1
  [ "$YES" = 1 ] && { echo "$1 yes (--yes)"; return 0; }
  local reply=""; printf '%s [y/N] ' "$1"; read -r reply || true
  case "$reply" in [Yy]*) return 0 ;; *) return 1 ;; esac
}

TMPD=$(mktemp -d "${TMPDIR:-/tmp}/render-storage.XXXXXX")
trap 'rm -rf "$TMPD"' EXIT
g() { git -C "$REPO" "$@"; }

hint() {
  case "$(uname -s)" in
    Darwin) echo "brew install $1" ;;
    MINGW*|MSYS*|CYGWIN*) echo "reinstall Git for Windows (https://git-scm.com/download/win), which includes git-lfs and curl" ;;
    *) echo "install $1 with your package manager (e.g. sudo apt-get install $1)" ;;
  esac
}

check_tools() {
  local t
  for t in git curl; do
    command -v "$t" >/dev/null 2>&1 || { action "$t is not installed" "$(hint "$t")"; stop; }
  done
  git lfs version >/dev/null 2>&1 || { action "git-lfs is not installed" "$(hint git-lfs)"; stop; }
  pass "git, curl and git-lfs are installed"
}

check_clone() {
  local dir; dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
  REPO=$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null) && [ -f "$REPO/.lfsconfig" ] ||
    { action "this script is not inside a factorio-blueprints clone" "run it from your vault clone"; stop; }
  LFS_URL=${RENDER_STORAGE_LFS_URL:-$(git config -f "$REPO/.lfsconfig" --get lfs.url || true)}
  LFS_URL=${LFS_URL%/}
  [ -n "$LFS_URL" ] || { action ".lfsconfig has no lfs.url" "restore .lfsconfig from origin/main"; stop; }
  local rest=${LFS_URL#*://}
  PROTO=${LFS_URL%%://*}; HOST=${rest%%/*}; HELPER_KEY="credential.$PROTO://$HOST.helper"
  pass "clone at $REPO ($(g config --get remote.origin.url || echo 'no origin')), endpoint $LFS_URL"
}

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
    action "the Worker at $LFS_URL did not answer a download request (HTTP $code)" \
      "check your connection; if it persists the owner checks the Worker in the Cloudflare dashboard"
    stop
  fi
  code=$(probe upload)
  [ "$code" = 401 ] || { action "an upload without a token got HTTP $code, not 401" "do not push renders; the owner checks the Worker"; stop; }
  pass "Worker answers: downloads open, uploads need the token"
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
    pass "lock verification is off (the Worker has no lock API)"
  elif ask "Turn off lock verification for $LFS_URL in this clone?"; then
    g config --local "lfs.$LFS_URL.locksverify" false; fixed "lock verification off"
  else
    action "lock verification is '${lv:-unset}'" "run: git config --local lfs.$LFS_URL.locksverify false"
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

# read_cred: ask git for the stored credential without any prompt; sets
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
# prompt_and_store: read a token with echo off and store it.
prompt_and_store() {
  local tok=""
  printf 'Paste the upload token from the password manager (hidden): '
  read -rs tok || true; echo
  tok=${tok%$'\r'}
  [ -n "$tok" ] || { echo "No token entered."; return 1; }
  store_cred "$tok"; tok=""
  read_cred
}

check_token() {
  if read_cred; then
    pass "an upload token is stored for $HOST"
  elif [ "$MODE" != check ] && prompt_and_store; then
    fixed "upload token stored in git's credential store"
  else
    action "no upload token is stored for $HOST" "re-run this script (without --check) and paste the token"
    return
  fi
  local tries=0 code
  while :; do
    code=$(probe upload "$CUSER" "$CPASS")
    if [ "$code" = 200 ]; then
      if [ "$tries" = 0 ]; then pass "the Worker accepts the stored token"; else fixed "new token accepted"; fi
      break
    fi
    if [ "$code" = 401 ] && [ "$tries" -lt 2 ] && ask "The Worker refused the stored token. Enter another?" && prompt_and_store; then
      tries=$((tries + 1)); continue
    fi
    # The Worker answers 401 both for a wrong token and when no secret is set.
    action "the Worker refused the stored token (HTTP $code)" \
      "paste the current token from the password manager; if it is right, the owner has not set the secret yet: run with --set-worker-secret"
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

check_tools
check_clone
if [ "$MODE" = secret ]; then
  check_worker
  set_worker_secret
else
  check_lfs_install
  check_endpoint
  check_worker
  check_helper
  check_token
  check_images
fi
summary
