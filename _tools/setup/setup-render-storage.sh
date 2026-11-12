#!/usr/bin/env bash
#
# setup-render-storage.sh: check and fix this machine's Git LFS setup for
# render images in the factorio-blueprints vault. Re-run it any time; it only
# changes what is missing, and asks first. Run with --help for the options.
#
# Built from the /wizard skill template. Everything above the "STAGES" marker
# is the wizard library: do not hand-edit it. The checks are below the marker.

# The library's _clear is replaced below the marker, so shellcheck sees the
# library copy as unused.
# shellcheck disable=SC2329
set -euo pipefail

# ──────────────────────────────────────────────────────────────────────────
# Wizard library: delightful, consistent UX, identical across every wizard.
# ──────────────────────────────────────────────────────────────────────────

if [[ -t 1 ]] && command -v tput >/dev/null 2>&1 && [[ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]]; then
  BOLD=$(tput bold); DIM=$(tput dim); RESET=$(tput sgr0)
  BLUE=$(tput setaf 4); GREEN=$(tput setaf 2); YELLOW=$(tput setaf 3); RED=$(tput setaf 1)
else
  BOLD=""; DIM=""; RESET=""; BLUE=""; GREEN=""; YELLOW=""; RED=""
fi

# Author sets this at the top of the stages section.
TOTAL_STAGES=0

_STAGE_INDEX=0
ENV_FILE="${ENV_FILE:-.env}"
WRITTEN_ENV=()    # KEYs written to ENV_FILE this run
WRITTEN_SECRET=() # secret NAMEs set this run
SKIPPED=()        # things we couldn't do (e.g. gh missing)

# _clear wipes the terminal so only the current step is on screen. No-op when
# output isn't a terminal, so piped logs stay readable.
_clear() {
  [[ -t 1 ]] || return 0
  if command -v tput >/dev/null 2>&1; then tput clear; else printf '\033[2J\033[3J\033[H'; fi
}

# banner "Title" shows the opening frame: what this wizard does.
banner() {
  _clear
  printf '\n%s%s  %s%s\n' "$BOLD" "$BLUE" "$1" "$RESET"
  printf '%s  %s stages%s\n\n' "$DIM" "$TOTAL_STAGES" "$RESET"
  printf '%s  You drive the browser; this wizard tells you exactly what to do and\n' "$DIM"
  printf '  captures the values you copy back. Stop any time with Ctrl-C and re-run\n'
  printf '  later, since it remembers values already saved.%s\n' "$RESET"
  pause "Ready to start?"
}

# stage "Name" clears the screen, then announces a stage and shows progress.
# Clearing keeps only the current step on screen.
stage() {
  _clear
  _STAGE_INDEX=$((_STAGE_INDEX + 1))
  printf '\n%s%s▸ Stage %s/%s · %s%s\n' \
    "$BOLD" "$BLUE" "$_STAGE_INDEX" "$TOTAL_STAGES" "$1" "$RESET"
}

# say "..." prints a plain instruction line.
say()  { printf '  %s\n' "$1"; }
# step "..." is a numbered-feeling action the human takes in the browser.
step() { printf '  %s•%s %s\n' "$BLUE" "$RESET" "$1"; }
note() { printf '  %s%s%s\n' "$DIM" "$1" "$RESET"; }
warn() { printf '  %s⚠ %s%s\n' "$YELLOW" "$1" "$RESET"; }

# open_url URL opens it in the human's browser, cross-platform incl. WSL.
open_url() {
  local url="$1"
  printf '  %s↗ opening%s %s\n' "$GREEN" "$RESET" "$url"
  { if   command -v wslview     >/dev/null 2>&1; then wslview "$url"
    elif command -v explorer.exe >/dev/null 2>&1; then explorer.exe "$url"
    elif command -v xdg-open    >/dev/null 2>&1; then xdg-open "$url"
    elif command -v open        >/dev/null 2>&1; then open "$url"
    else warn "couldn't open a browser; visit it manually: $url"; fi
  } >/dev/null 2>&1 || warn "couldn't open a browser, so visit it manually: $url"
}

# pause "msg" waits for the human to confirm they've done the manual part.
pause() {
  printf '  %s%s%s ' "$DIM" "${1:-Press Enter to continue}" "$RESET"
  read -r _ || true
}

# confirm "question" is a y/N gate; returns success on yes.
confirm() {
  local reply=""
  printf '  %s? %s [y/N] ' "$YELLOW" "$1"
  read -r reply || true
  [[ "$reply" =~ ^[Yy] ]]
}

# _existing KEY: current value of KEY in ENV_FILE, if any.
_existing() {
  [[ -f "$ENV_FILE" ]] || return 1
  local line; line=$(grep -E "^${1}=" "$ENV_FILE" | tail -n1) || return 1
  printf '%s' "${line#*=}"
}

# ask KEY "Prompt" reads a value into $KEY. Offers the existing .env value as
# a default on re-runs (Enter keeps it). Visible input (non-secret).
ask() {
  local key="$1" prompt="$2" current input
  current=$(_existing "$key" || true)
  if [[ -n "$current" ]]; then
    printf '  %s%s%s %s[Enter keeps current]%s ' "$BOLD" "$prompt" "$RESET" "$DIM" "$RESET"
  else
    printf '  %s%s%s ' "$BOLD" "$prompt" "$RESET"
  fi
  read -r input || true
  [[ -z "$input" && -n "$current" ]] && input="$current"
  printf -v "$key" '%s' "$input"
}

# ask_secret KEY "Prompt" is like ask, but input is hidden.
ask_secret() {
  local key="$1" prompt="$2" current input
  current=$(_existing "$key" || true)
  if [[ -n "$current" ]]; then
    printf '  %s%s%s %s[Enter keeps current]%s ' "$BOLD" "$prompt" "$RESET" "$DIM" "$RESET"
  else
    printf '  %s%s%s ' "$BOLD" "$prompt" "$RESET"
  fi
  read -rs input || true
  printf '\n'
  [[ -z "$input" && -n "$current" ]] && input="$current"
  printf -v "$key" '%s' "$input"
}

# write_env KEY VALUE upserts KEY=VALUE into ENV_FILE (creates it; replaces
# any existing line). Idempotent.
write_env() {
  local key="$1" value="$2" tmp
  touch "$ENV_FILE"
  tmp=$(mktemp)
  grep -vE "^${key}=" "$ENV_FILE" > "$tmp" || true
  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  mv "$tmp" "$ENV_FILE"
  WRITTEN_ENV+=("$key")
  printf '  %s✓ wrote%s %s → %s\n' "$GREEN" "$RESET" "$key" "$ENV_FILE"
}

# set_secret NAME VALUE sets a GitHub Actions repo secret via gh. Falls back
# to a warning (and records it) if gh is unavailable or unauthenticated.
set_secret() {
  local name="$1" value="$2"
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    if printf '%s' "$value" | gh secret set "$name" >/dev/null 2>&1; then
      WRITTEN_SECRET+=("$name")
      printf '  %s✓ set%s GitHub secret %s\n' "$GREEN" "$RESET" "$name"
      return
    fi
  fi
  SKIPPED+=("GitHub secret $name (set it manually: gh secret set $name)")
  warn "skipped GitHub secret $name: gh not ready; set it later"
}

# set_var NAME VALUE sets a GitHub Actions repo variable (non-secret).
set_var() {
  local name="$1" value="$2"
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    if gh variable set "$name" --body "$value" >/dev/null 2>&1; then
      printf '  %s✓ set%s GitHub variable %s\n' "$GREEN" "$RESET" "$name"
      return
    fi
  fi
  SKIPPED+=("GitHub variable $name")
  warn "skipped GitHub variable $name, gh not ready; set it later"
}

# finish clears, then shows a closing summary of everything configured.
finish() {
  _clear
  printf '\n%s%s  ✓ Setup complete%s\n' "$BOLD" "$GREEN" "$RESET"
  (( ${#WRITTEN_ENV[@]} ))    && note "wrote ${#WRITTEN_ENV[@]} value(s) to $ENV_FILE: ${WRITTEN_ENV[*]}"
  (( ${#WRITTEN_SECRET[@]} )) && note "set ${#WRITTEN_SECRET[@]} GitHub secret(s): ${WRITTEN_SECRET[*]}"
  if (( ${#SKIPPED[@]} )); then
    printf '\n'; warn "still to do by hand:"
    for s in "${SKIPPED[@]}"; do note "  - $s"; done
  fi
  printf '\n'
}


# ──────────────────────────────────────────────────────────────────────────
# STAGES: the render-storage checks.
#
# Each check prints one result line: PASS, FIXED, INFO or ACTION NEEDED.
# Must run on bash 3.2 (macOS), Linux and Git Bash on Windows: no associative
# arrays, no mapfile, no ${var,,}, and no "${array[@]}" on empty arrays.
#
# The upload token is only ever held in shell variables and passed to other
# programs on stdin (git credential, base64, wrangler). It is never an
# argument, never written anywhere but git's credential store, never printed
# unless the owner asks for it in --set-worker-secret mode.
# ──────────────────────────────────────────────────────────────────────────

# A checklist must stay on screen, so stages do not clear the terminal.
_clear() { :; }
# Never offer values from a .env file (ask_secret reads ENV_FILE).
ENV_FILE=/dev/null

usage() {
  cat <<'EOF'
Usage: _tools/setup/setup-render-storage.sh [options]

Checks this machine's setup for render images (Git LFS on the
factorio-blueprints-lfs Worker) and fixes what is missing, asking first.
Safe to re-run.

Options:
  --check               Only report. Change nothing, ask nothing. Exits 1 if
                        anything needs action, 0 if all is well.
  --yes                 Apply safe fixes without asking. The upload token is
                        still asked for (hidden) when one is needed.
  --round-trip          Also run the end-to-end test (store and upload one
                        tiny test image, download it back) without asking.
  --set-worker-secret   Owner only, once (or to rotate): make a new upload
                        token, set it as LFS_UPLOAD_TOKEN on the deployed
                        Worker with wrangler, and store it on this machine.
  -h, --help            Show this help.

Environment (for testing):
  RENDER_STORAGE_LFS_URL     LFS endpoint to expect instead of .lfsconfig's.
  RENDER_STORAGE_WRANGLER    Command to run instead of "npx wrangler".
  RENDER_STORAGE_RETRY_DELAY Seconds between checks after setting the secret.

Exit codes: 0 all good, 1 something needs action, 2 bad usage.
EOF
}

MODE=setup
ASSUME_YES=0
ROUND_TRIP=0
while [ $# -gt 0 ]; do
  case "$1" in
    --check) MODE=check ;;
    --yes|-y) ASSUME_YES=1 ;;
    --round-trip) ROUND_TRIP=1 ;;
    --set-worker-secret) MODE=secret ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'Unknown option: %s\n\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

# ── results ───────────────────────────────────────────────────────────────

N_PASS=0; N_FIXED=0; N_ACTION=0
ACTIONS=""

pass()   { N_PASS=$((N_PASS + 1));   printf '  %sPASS%s           %s\n' "$GREEN" "$RESET" "$1"; }
fixed()  { N_FIXED=$((N_FIXED + 1)); printf '  %sFIXED%s          %s\n' "$GREEN" "$RESET" "$1"; }
info()   {                           printf '  %sINFO%s           %s\n' "$BLUE" "$RESET" "$1"; }
action() {
  # action "what is wrong" "what to do"
  N_ACTION=$((N_ACTION + 1))
  printf '  %sACTION NEEDED%s  %s\n' "$RED" "$RESET" "$1"
  [ -n "${2:-}" ] && printf '                 → %s\n' "$2"
  ACTIONS="${ACTIONS}  - $1"$'\n'"      → ${2:-}"$'\n'
}

summary() {
  printf '\n%s── Summary ──%s  %s pass, %s fixed, %s need action\n' \
    "$BOLD" "$RESET" "$N_PASS" "$N_FIXED" "$N_ACTION"
  if [ "$N_ACTION" -gt 0 ]; then
    printf '\n%sStill to do:%s\n%s' "$YELLOW" "$RESET" "$ACTIONS"
    printf '\nThen re-run: %s\n' "$0"
    return 1
  fi
  printf '%sRender storage is set up on this machine.%s\n' "$GREEN" "$RESET"
}

# stop "reason": a check later ones depend on failed; report and exit.
stop() {
  note "Stopping here: $1"
  summary || true
  exit 1
}

# offer "question": may we apply a fix? Never in --check.
offer() {
  [ "$MODE" = check ] && return 1
  if [ "$ASSUME_YES" = 1 ]; then note "$1 → yes (--yes)"; return 0; fi
  confirm "$1"
}

TMPD=""
cleanup() { [ -n "$TMPD" ] && rm -rf "$TMPD"; return 0; }
trap cleanup EXIT
TMPD=$(mktemp -d "${TMPDIR:-/tmp}/render-storage.XXXXXX")

ZERO_OID=0000000000000000000000000000000000000000000000000000000000000000

# ── helpers ───────────────────────────────────────────────────────────────

os_name() {
  case "$(uname -s 2>/dev/null || echo unknown)" in
    Darwin) echo macos ;;
    Linux) echo linux ;;
    MINGW*|MSYS*|CYGWIN*) echo windows ;;
    *) echo other ;;
  esac
}

install_hint() {
  # install_hint git|git-lfs|curl|node
  local tool="$1"
  case "$(os_name)" in
    macos) echo "brew install $tool   (Homebrew: https://brew.sh)" ;;
    windows)
      case "$tool" in
        node) echo "install Node.js LTS from https://nodejs.org" ;;
        *) echo "reinstall Git for Windows from https://git-scm.com/download/win (it includes git-lfs and curl; keep 'Git LFS' ticked)" ;;
      esac ;;
    linux)
      if command -v apt-get >/dev/null 2>&1; then echo "sudo apt-get install $tool"
      elif command -v dnf >/dev/null 2>&1; then echo "sudo dnf install $tool"
      elif command -v pacman >/dev/null 2>&1; then echo "sudo pacman -S $tool"
      else echo "install $tool with your package manager"; fi ;;
    *) echo "install $tool" ;;
  esac
  [ "$tool" = git-lfs ] && echo "(see https://git-lfs.com)"
  return 0
}

g() { git -C "$REPO" "$@"; }

# Ask git for the stored LFS credential without any prompt. On success sets
# CRED_USER and CRED_PASS. A login window or terminal prompt here would mean
# Obsidian's git plugin would hang too, so prompting is disabled.
CRED_USER=""; CRED_PASS=""
read_stored_credential() {
  CRED_USER=""; CRED_PASS=""
  local out nl=$'\n'
  out=$(printf 'protocol=%s\nhost=%s\n\n' "$PROTO" "$HOSTPORT" \
        | GIT_TERMINAL_PROMPT=0 GIT_ASKPASS="" SSH_ASKPASS="" \
          git -C "$REPO" credential fill 2>/dev/null) || return 1
  # Parsed with parameter expansion only: a here-doc could land in a temp file.
  out="$nl$out$nl"
  case "$out" in *"${nl}username="*) CRED_USER="${out#*"${nl}"username=}"; CRED_USER="${CRED_USER%%"${nl}"*}" ;; esac
  case "$out" in *"${nl}password="*) CRED_PASS="${out#*"${nl}"password=}"; CRED_PASS="${CRED_PASS%%"${nl}"*}" ;; esac
  out=""
  [ -n "$CRED_PASS" ]
}

store_credential() {
  # store_credential TOKEN: replace any stored credential for the host.
  printf 'protocol=%s\nhost=%s\n\n' "$PROTO" "$HOSTPORT" | g credential reject >/dev/null 2>&1 || true
  printf 'protocol=%s\nhost=%s\nusername=lfs\npassword=%s\n\n' "$PROTO" "$HOSTPORT" "$1" \
    | g credential approve
}

# probe_batch OPERATION [USER PASSWORD]: POST a one-object batch request for
# an oid that is never stored. Prints the HTTP status ("000" if unreachable).
# The response body is kept only for unauthenticated requests: an accepted
# upload reply carries the token in its action headers.
probe_batch() {
  local op="$1" user="${2:-}" pass="${3:-}" b64 code
  printf '{"operation":"%s","transfers":["basic"],"objects":[{"oid":"%s","size":1}]}' \
    "$op" "$ZERO_OID" > "$TMPD/req.json"
  if [ -n "$pass" ]; then
    b64=$(printf '%s:%s' "$user" "$pass" | base64 | tr -d '\r\n')
    code=$(printf 'Authorization: Basic %s\n' "$b64" \
      | curl -sS -o /dev/null -w '%{http_code}' --max-time 20 -X POST \
          -H 'Content-Type: application/vnd.git-lfs+json' \
          -H 'Accept: application/vnd.git-lfs+json' \
          -H @- --data-binary @"$TMPD/req.json" "$LFS_URL/objects/batch" 2>/dev/null) || code=000
    b64=""
  else
    code=$(curl -sS -o "$TMPD/resp.json" -w '%{http_code}' --max-time 20 -X POST \
          -H 'Content-Type: application/vnd.git-lfs+json' \
          -H 'Accept: application/vnd.git-lfs+json' \
          --data-binary @"$TMPD/req.json" "$LFS_URL/objects/batch" 2>/dev/null) || code=000
  fi
  printf '%s' "${code:-000}"
}

# prompt_token VAR: read a token, hidden, into VAR. Fails on empty input.
prompt_token() {
  local _t=""
  ask_secret _t "Paste the upload token (input hidden):"
  # Tolerate a pasted trailing CR (Windows clipboards).
  _t="${_t%$'\r'}"
  if [ -z "$_t" ]; then warn "No token entered."; return 1; fi
  printf -v "$1" '%s' "$_t"
  _t=""
}

# ── checks shared by both modes ──────────────────────────────────────────

check_tools() {
  stage "Tools: git, git-lfs, curl"
  if command -v git >/dev/null 2>&1; then
    pass "git $(git --version | sed 's/^git version //')"
  else
    action "git is not installed" "$(install_hint git)"
    stop "everything else needs git"
  fi
  if command -v curl >/dev/null 2>&1; then
    pass "curl found"
  else
    action "curl is not installed" "$(install_hint curl)"
    stop "the Worker checks need curl"
  fi
  if git lfs version >/dev/null 2>&1; then
    pass "$(git lfs version | sed 's/ (.*//')"
  else
    action "git-lfs is not installed" "$(install_hint git-lfs | tr '\n' ' ')"
    stop "everything else needs git-lfs"
  fi
}

check_repo() {
  stage "This clone"
  local script_dir origin branch
  script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
  if ! REPO=$(git -C "$script_dir" rev-parse --show-toplevel 2>/dev/null); then
    action "this script is not inside a git clone" \
      "clone the repo (git clone https://github.com/abucnasty/factorio-blueprints) and run the script from that clone"
    stop "no clone to check"
  fi
  if [ ! -f "$REPO/.lfsconfig" ] || ! grep -q 'name = "factorio-blueprints-lfs"' "$REPO/_tools/lfs-worker/wrangler.toml" 2>/dev/null; then
    action "$REPO is not a factorio-blueprints clone with render storage" \
      "run the script from a clone of abucnasty/factorio-blueprints that includes .lfsconfig"
    stop "wrong repository"
  fi
  origin=$(g config --get remote.origin.url 2>/dev/null || echo "no origin remote")
  branch=$(g rev-parse --abbrev-ref HEAD 2>/dev/null || echo "?")
  pass "clone at $REPO (branch $branch, origin $origin)"
  local here
  here=$(git rev-parse --show-toplevel 2>/dev/null || true)
  if [ -n "$here" ] && [ "$here" != "$REPO" ]; then
    info "you ran this from $here; checking the clone that contains the script"
  fi

  LFS_URL="${RENDER_STORAGE_LFS_URL:-$(git config -f "$REPO/.lfsconfig" --get lfs.url || true)}"
  LFS_URL="${LFS_URL%/}"
  if [ -z "$LFS_URL" ]; then
    action ".lfsconfig has no lfs.url" "restore .lfsconfig from origin/main"
    stop "no endpoint"
  fi
  [ -n "${RENDER_STORAGE_LFS_URL:-}" ] && info "endpoint overridden by RENDER_STORAGE_LFS_URL: $LFS_URL"
  PROTO="${LFS_URL%%://*}"
  local rest="${LFS_URL#*://}"
  HOSTPORT="${rest%%/*}"
  CRED_KEY="credential.$PROTO://$HOSTPORT.helper"
}

check_worker() {
  stage "Worker reachable"
  local code
  code=$(probe_batch download)
  if [ "$code" = 200 ] && grep -q '"objects"' "$TMPD/resp.json" 2>/dev/null; then
    pass "download request answered without credentials ($LFS_URL)"
  elif [ "$code" = 000 ]; then
    action "cannot reach $LFS_URL" \
      "check your internet connection; if it is down for everyone, the Worker may be down (owner: check it in the Cloudflare dashboard)"
    stop "the Worker is unreachable"
  else
    action "$LFS_URL answered a download request with HTTP $code" \
      "the Worker is not deployed or is broken (owner: check it in the Cloudflare dashboard, or re-run the Deploy LFS Worker workflow)"
    stop "the Worker is not answering as expected"
  fi
  code=$(probe_batch upload)
  if [ "$code" = 401 ]; then
    pass "upload without credentials is refused (HTTP 401)"
  else
    action "upload without credentials got HTTP $code instead of 401" \
      "this is not the expected Worker; do not push renders until the owner checks it"
    stop "unexpected Worker behaviour"
  fi
}

check_credential_helper() {
  stage "Credential helper for $HOSTPORT"
  local n first has_store=0 vals
  vals=$(g config --get-all "$CRED_KEY" 2>/dev/null || true)
  n=$(g config --get-all "$CRED_KEY" 2>/dev/null | wc -l | tr -d ' ' || true)
  first=$(printf '%s\n' "$vals" | sed -n 1p)
  printf '%s\n' "$vals" | grep -qx store && has_store=1
  if [ "${n:-0}" -ge 2 ] && [ -z "$first" ] && [ "$has_store" = 1 ]; then
    pass "only git's plain credential store is used for $HOSTPORT (no login windows)"
    return
  fi
  if offer "Set this clone to use only git's credential store for $HOSTPORT?"; then
    g config --local --unset-all "$CRED_KEY" >/dev/null 2>&1 || true
    g config --local --add "$CRED_KEY" ""
    g config --local --add "$CRED_KEY" store
    fixed "this clone now uses only git's credential store for $HOSTPORT"
  else
    action "the LFS host may use another credential helper, which can open a login window that Obsidian cannot answer" \
      "re-run without --check and accept the fix"
  fi
}

# Accepted is "yes", "no" (refused) or "unknown" (could not ask).
CRED_ACCEPTED=unknown
test_stored_credential() {
  local code
  code=$(probe_batch upload "$CRED_USER" "$CRED_PASS")
  case "$code" in
    200) CRED_ACCEPTED=yes ;;
    401|403) CRED_ACCEPTED=no ;;
    *) CRED_ACCEPTED=unknown ;;
  esac
  LAST_CODE=$code
}

# ── setup / check mode ───────────────────────────────────────────────────

check_lfs_install() {
  stage "Git LFS installed for your user and this clone"
  local process hooks_dir ok=1
  process=$(g config --get filter.lfs.process 2>/dev/null || true)
  hooks_dir=$(g rev-parse --git-path hooks)
  case "$hooks_dir" in /*|?:*) ;; *) hooks_dir="$REPO/$hooks_dir" ;; esac
  [ -n "$process" ] || ok=0
  grep -qs 'git[- ]lfs' "$hooks_dir/pre-push" || ok=0
  if [ "$ok" = 1 ]; then
    pass "git lfs install has been run (filters and pre-push hook present)"
    return
  fi
  if offer "Run 'git lfs install' (sets up the LFS filters for your user and this clone's hooks)?"; then
    g lfs install >/dev/null
    fixed "ran git lfs install"
  else
    action "git lfs install has not been run" "run: git lfs install   (in the clone)"
  fi
}

check_endpoint() {
  stage "LFS endpoint and lock verification"
  local envout endpoint origin_info
  envout=$(g lfs env 2>/dev/null || true)
  endpoint=$(printf '%s\n' "$envout" | sed -n 's/^Endpoint=\([^ ]*\).*/\1/p' | sed -n 1p)
  endpoint="${endpoint%/}"
  if [ "$endpoint" = "$LFS_URL" ]; then
    pass "git-lfs uses $LFS_URL"
  else
    origin_info=$(g config --show-origin --get-all lfs.url 2>/dev/null | tr '\t' ' ' | tr '\n' ';' || true)
    if offer "git-lfs uses '${endpoint:-nothing}' instead of $LFS_URL. Set lfs.url in this clone's .git/config to $LFS_URL?"; then
      g config --local lfs.url "$LFS_URL"
      fixed "this clone's lfs.url is now $LFS_URL"
    else
      action "git-lfs endpoint is '${endpoint:-unset}', expected $LFS_URL${origin_info:+ (set in: $origin_info)}" \
        "remove the overriding lfs.url, or re-run without --check to set it for this clone"
    fi
  fi

  local lv
  lv=$(g config --get-urlmatch lfs.locksverify "$LFS_URL" 2>/dev/null || true)
  [ -n "$lv" ] || lv=$(git config -f "$REPO/.lfsconfig" --get-urlmatch lfs.locksverify "$LFS_URL" 2>/dev/null || true)
  if [ "$lv" = false ]; then
    pass "lock verification is off (the Worker has no lock API)"
  elif offer "Lock verification is '${lv:-unset}'; the Worker has no lock API. Turn it off for $LFS_URL in this clone?"; then
    g config --local "lfs.$LFS_URL.locksverify" false
    fixed "lock verification is off for $LFS_URL"
  else
    action "lock verification is '${lv:-unset}', which makes pushes warn or fail" \
      "run: git config --local lfs.$LFS_URL.locksverify false"
  fi
}

check_stored_credential() {
  stage "Upload token stored for git"
  if read_stored_credential; then
    pass "a credential for $HOSTPORT is stored and git returns it without prompting"
    return
  fi
  if [ "$MODE" = check ]; then
    action "no upload token is stored for $HOSTPORT" \
      "run this script without --check and paste the token from the password manager"
    return
  fi
  say "Uploading renders needs the upload token. Get it from the owner's password manager."
  say "It is stored in git's credential store (~/.git-credentials), nowhere else."
  local tok=""
  if prompt_token tok; then
    store_credential "$tok"
    tok=""
    if read_stored_credential; then
      fixed "upload token stored for $HOSTPORT"
    else
      action "the token was entered but git does not return it" \
        "check 'git config --show-origin --get-all $CRED_KEY' lists an empty value then 'store'"
    fi
  else
    action "no upload token is stored for $HOSTPORT" \
      "re-run this script and paste the token from the password manager"
  fi
}

check_credential_accepted() {
  stage "Worker accepts the stored token"
  if [ -z "$CRED_PASS" ]; then
    action "cannot test the token: none is stored" "see the previous check"
    return
  fi
  local attempts=0 tok=""
  while :; do
    test_stored_credential
    case "$CRED_ACCEPTED" in
      yes)
        if [ "$attempts" = 0 ]; then pass "the Worker accepts the stored token for uploads"
        else fixed "new token stored and accepted by the Worker"; fi
        break ;;
      unknown)
        action "could not test the token: the Worker answered HTTP $LAST_CODE" "try again later"
        break ;;
    esac
    # Refused. The Worker answers the same 401 when the token is wrong and
    # when LFS_UPLOAD_TOKEN was never set on it, so say both.
    if [ "$attempts" -lt 2 ] && offer "The Worker refused the stored token. Enter a different token now?"; then
      attempts=$((attempts + 1))
      if prompt_token tok; then
        store_credential "$tok"; tok=""
        read_stored_credential || true
        continue
      fi
    fi
    action "the Worker refused the stored upload token (HTTP 401)" \
      "either the token is old or mistyped (re-run and paste the current one from the password manager), or the owner has not set LFS_UPLOAD_TOKEN on the Worker yet (owner: run this script with --set-worker-secret)"
    break
  done
  CRED_PASS=""
}

check_images_present() {
  stage "Render images downloaded"
  local listing missing total
  listing=$(g lfs ls-files 2>/dev/null || true)
  total=$(printf '%s' "$listing" | grep -c . || true)
  missing=$(printf '%s' "$listing" | grep -c '^[0-9a-f]* - ' || true)
  if [ "${total:-0}" = 0 ]; then
    pass "no render images committed yet"
  elif [ "${missing:-0}" = 0 ]; then
    pass "all $total render images are downloaded"
  elif g config --get filter.lfs.smudge 2>/dev/null | grep -q -- '--skip'; then
    info "$missing of $total images are not downloaded; this clone skips them on purpose (git lfs pull to fetch)"
  elif offer "$missing of $total render images are still pointer files. Download them now (git lfs pull)?"; then
    g lfs pull
    fixed "downloaded render images"
  else
    action "$missing of $total render images are pointer files, not images" "run: git lfs pull"
  fi
}

# A fixed 69-byte 1x1 PNG. Its oid never changes, so repeated round trips
# reuse one object in the bucket instead of adding a new one each run.
write_test_png() {
  printf '\211\120\116\107\015\012\032\012\000\000\000\015\111\110\104\122\000\000\000\001\000\000\000\001\010\002\000\000\000\220\167\123\336\000\000\000\014\111\104\101\124\170\332\143\370\320\040\000\000\003\344\001\201\144\256\145\056\000\000\000\000\111\105\116\104\256\102\140\202' > "$1"
}
TEST_PNG_OID=ced8c4f454bf49dcdd19f439b01616f031f2bb896e867504eb329ea41723e587

round_trip() {
  stage "End-to-end round trip (optional)"
  if [ "$MODE" = check ]; then info "skipped in --check mode"; return; fi
  if [ "$ROUND_TRIP" != 1 ]; then
    say "This stores a tiny test image under renders/ in a throwaway repo (not"
    say "this clone, no commit), uploads it, and downloads it back. The bucket"
    say "keeps that one 69-byte object; every later run reuses it."
    if ! confirm "Run the round trip?"; then info "round trip skipped"; return; fi
  fi
  if [ "$CRED_ACCEPTED" != yes ]; then
    action "round trip not run: the upload token is not working yet" "fix the token checks above first"
    return
  fi
  local rt="$TMPD/round-trip" pointer oid code already=0
  git init -q "$rt"
  cp "$REPO/.gitattributes" "$rt/.gitattributes"
  git -C "$rt" config lfs.url "$LFS_URL"
  git -C "$rt" config "lfs.$LFS_URL.locksverify" false
  git -C "$rt" config --add "$CRED_KEY" ""
  git -C "$rt" config --add "$CRED_KEY" store
  git -C "$rt" remote add origin "$REPO"
  mkdir -p "$rt/test/renders"
  write_test_png "$rt/test/renders/0.png"
  git -C "$rt" add .gitattributes test/renders/0.png
  pointer=$(git -C "$rt" cat-file -p :test/renders/0.png)
  oid=$(printf '%s\n' "$pointer" | sed -n 's/^oid sha256://p')
  if ! printf '%s\n' "$pointer" | grep -q '^version https://git-lfs.github.com/spec/v1' || [ "$oid" != "$TEST_PNG_OID" ]; then
    action "a file under renders/ was not stored as an LFS pointer" \
      "check .gitattributes in this clone matches origin/main and 'git lfs install' has been run"
    return
  fi
  pass "a file under renders/ is staged as an LFS pointer, not image bytes"
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 -I "$LFS_URL/objects/$oid" 2>/dev/null) || code=000
  [ "$code" = 200 ] && already=1
  if ! GIT_TERMINAL_PROMPT=0 GIT_ASKPASS="" SSH_ASKPASS="" git -C "$rt" lfs push --object-id origin "$oid" >"$TMPD/push.log" 2>&1; then
    action "uploading the test image failed" "see the git-lfs output: $(tr '\n' ' ' <"$TMPD/push.log" | cut -c1-300)"
    return
  fi
  if [ "$already" = 1 ]; then
    pass "upload accepted (the test image was already stored by an earlier run)"
  else
    pass "test image uploaded"
  fi
  rm -f "$TMPD/download.bin"
  code=$(curl -sS -o "$TMPD/download.bin" -w '%{http_code}' --max-time 20 "$LFS_URL/objects/$oid" 2>/dev/null) || code=000
  if [ "$code" = 200 ] && [ "$(git lfs pointer --file="$TMPD/download.bin" 2>/dev/null | sed -n 's/^oid sha256://p')" = "$oid" ]; then
    pass "downloaded it back from the Worker, byte for byte identical"
  else
    action "the test image did not download back intact (HTTP $code)" "tell the owner; uploads may not be reaching the bucket"
  fi
}

run_setup() {
  TOTAL_STAGES=9
  printf '\n%s%sRender storage setup%s  %s(%s mode)%s\n' "$BOLD" "$BLUE" "$RESET" "$DIM" "$MODE" "$RESET"
  check_tools
  check_repo
  check_lfs_install
  check_endpoint
  check_worker
  check_credential_helper
  check_stored_credential
  check_credential_accepted
  check_images_present
  if [ "$MODE" != check ] && { [ "$ROUND_TRIP" = 1 ] || [ -t 0 ]; }; then
    TOTAL_STAGES=10
    round_trip
  fi
  summary
}

# ── --set-worker-secret mode ─────────────────────────────────────────────

run_wrangler() {
  if [ -n "${RENDER_STORAGE_WRANGLER:-}" ]; then
    (cd "$REPO/_tools/lfs-worker" && "$RENDER_STORAGE_WRANGLER" "$@")
  else
    (cd "$REPO/_tools/lfs-worker" && npx --no-install wrangler "$@")
  fi
}

new_token() {
  # 32 random bytes as 64 hex characters: no characters that need escaping.
  od -An -tx1 -N32 /dev/urandom | tr -d ' \n'
}

show_token_once() {
  # show_token_once TOKEN: only to the terminal, never to stdout or a log.
  if ! { : >/dev/tty; } 2>/dev/null; then
    warn "No terminal to show the token on, so it was not shown."
    return
  fi
  {
    printf '\n  Upload token (shown once, copy it now):\n\n    %s\n\n' "$1"
    printf '  Press Enter when it is saved; the screen will be cleared.'
  } >/dev/tty
  read -r _ </dev/tty || true
  printf '\033[2J\033[3J\033[H' >/dev/tty
}

run_secret() {
  TOTAL_STAGES=6
  printf '\n%s%sSet the Worker upload token%s  %s(owner, once or to rotate)%s\n' "$BOLD" "$BLUE" "$RESET" "$DIM" "$RESET"
  check_tools
  check_repo
  check_worker

  stage "wrangler and Cloudflare login"
  if [ -z "${RENDER_STORAGE_WRANGLER:-}" ]; then
    if ! command -v npx >/dev/null 2>&1; then
      action "node and npx are not installed" "$(install_hint node)"
      stop "wrangler needs node"
    fi
    if [ ! -x "$REPO/_tools/lfs-worker/node_modules/.bin/wrangler" ]; then
      if offer "wrangler is not installed in _tools/lfs-worker. Run 'npm ci' there?"; then
        (cd "$REPO/_tools/lfs-worker" && npm ci)
        fixed "installed wrangler in _tools/lfs-worker"
      else
        action "wrangler is not installed" "run: cd _tools/lfs-worker && npm ci"
        stop "wrangler is needed"
      fi
    fi
  fi
  local who=""
  if ! who=$(run_wrangler whoami 2>&1) || printf '%s' "$who" | grep -qi 'not authenticated\|not logged in'; then
    action "wrangler is not logged in to Cloudflare" \
      "run: cd _tools/lfs-worker && npx wrangler login   then re-run with --set-worker-secret"
    stop "cannot set the secret without a Cloudflare login"
  fi
  pass "wrangler is logged in"

  stage "New upload token on the Worker"
  say "This makes a new random token and sets it as LFS_UPLOAD_TOKEN on the"
  say "factorio-blueprints-lfs Worker. Any older token stops working: every"
  say "other vault machine must re-run this script with the new token."
  if ! offer "Replace the Worker's upload token now?"; then
    info "nothing changed"
    summary || true
    exit 1
  fi
  local tok out
  tok=$(new_token)
  if [ "${#tok}" != 64 ]; then
    action "could not generate a random token" "check that /dev/urandom and od are available"
    stop "no token"
  fi
  if ! out=$(printf '%s' "$tok" | run_wrangler secret put LFS_UPLOAD_TOKEN 2>&1); then
    printf '%s\n' "${out//$tok/[hidden]}" | sed 's/^/    /'
    tok=""
    action "wrangler could not set the secret" "read the wrangler output above; you may not be logged in (run: npx wrangler login, in _tools/lfs-worker), or the Worker is not deployed"
    stop "secret not set"
  fi
  out=""
  fixed "LFS_UPLOAD_TOKEN set on the Worker"

  stage "Store the token on this machine"
  check_credential_helper_quiet
  store_credential "$tok"
  read_stored_credential || true
  local tries=0 delay="${RENDER_STORAGE_RETRY_DELAY:-5}"
  while :; do
    test_stored_credential
    [ "$CRED_ACCEPTED" = yes ] && break
    tries=$((tries + 1))
    [ "$tries" -ge 6 ] && break
    note "waiting for the new secret to take effect ($tries/5)…"
    sleep "$delay"
  done
  CRED_PASS=""
  if [ "$CRED_ACCEPTED" = yes ]; then
    fixed "stored on this machine and accepted by the Worker"
  else
    action "the Worker does not accept the new token yet (HTTP $LAST_CODE)" \
      "wait a minute and run this script without options to re-check"
  fi

  say ""
  say "Save the token in your password manager now: other machines need it."
  say "It is not printed unless you ask. This machine keeps a copy in git's"
  say "credential store (~/.git-credentials)."
  if [ "$ASSUME_YES" != 1 ] && confirm "Show the token once now, to copy it?"; then
    show_token_once "$tok"
    info "token shown once on the terminal and cleared"
  else
    info "token not shown"
  fi
  tok=""
  say ""
  say "Next, run this script without options to check the rest of this machine."
  summary
}

# Used by --set-worker-secret: apply the helper override without a stage.
check_credential_helper_quiet() {
  local vals first
  vals=$(g config --get-all "$CRED_KEY" 2>/dev/null || true)
  first=$(printf '%s\n' "$vals" | sed -n 1p)
  if [ -n "$vals" ] && [ -z "$first" ] && printf '%s\n' "$vals" | grep -qx store; then return; fi
  g config --local --unset-all "$CRED_KEY" >/dev/null 2>&1 || true
  g config --local --add "$CRED_KEY" ""
  g config --local --add "$CRED_KEY" store
  fixed "this clone now uses only git's credential store for $HOSTPORT"
}

case "$MODE" in
  secret) run_secret ;;
  *) run_setup ;;
esac
