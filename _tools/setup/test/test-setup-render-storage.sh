#!/usr/bin/env bash
#
# Tests for setup-render-storage.sh against a local stand-in for the Worker
# (the real handler from _tools/lfs-worker over HTTP, with in-memory R2), in
# throwaway repos with a fake HOME. Touches nothing outside a temp directory
# and never contacts Cloudflare.
#
#   _tools/setup/test/test-setup-render-storage.sh
#
# Needs: bash, git, git-lfs, curl, node >= 22.18.

set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(cd "$HERE/../../.." && pwd)
SCRIPT_REL=_tools/setup/setup-render-storage.sh

WORK=$(mktemp -d "${TMPDIR:-/tmp}/rs-test.XXXXXX")
PIDS=""
cleanup() {
  for p in $PIDS; do kill "$p" 2>/dev/null || true; done
  if [ -n "${RS_TEST_KEEP:-}" ]; then echo "kept $WORK"; else rm -rf "$WORK"; fi
}
trap cleanup EXIT

FAILS=0; PASSES=0
ok()   { PASSES=$((PASSES + 1)); printf 'ok   %s\n' "$1"; }
fail() { FAILS=$((FAILS + 1));   printf 'FAIL %s\n' "$1"; [ -n "${2:-}" ] && sed 's/^/     | /' "$2" | tail -40; return 0; }

new_token() { od -An -tx1 -N32 /dev/urandom | tr -d ' \n'; }
TOKEN=$(new_token)          # the Worker's real token in these tests
WRONG=$(new_token)          # a token the Worker does not know
ROTATED_MARK=$WORK/rotated  # where the wrangler stub saves the new token for leak checks

# ── local Worker ──────────────────────────────────────────────────────────
start_worker() {
  # start_worker NAME [token]: prints the base URL.
  local name="$1" out="$WORK/$1.server"
  if [ -n "${2:-}" ]; then
    LFS_UPLOAD_TOKEN="$2" node "$ROOT/_tools/lfs-worker/test/local-worker.mjs" >"$out" 2>"$out.err" &
  else
    env -u LFS_UPLOAD_TOKEN node "$ROOT/_tools/lfs-worker/test/local-worker.mjs" >"$out" 2>"$out.err" &
  fi
  PIDS="$PIDS $!"
  local i=0
  while ! grep -q '^port ' "$out" 2>/dev/null; do
    i=$((i + 1)); [ "$i" -gt 100 ] && { cat "$out.err" >&2; echo "worker did not start" >&2; exit 1; }
    sleep 0.1
  done
  printf 'http://127.0.0.1:%s' "$(sed -n 's/^port //p' "$out")"
}

# ── argument logging shims ───────────────────────────────────────────────
# Every external command the script can run goes through a shim that logs
# its arguments, so the tests can prove the token is never an argument.
SHIMS=$WORK/shims; ARGLOG=$WORK/argv.log; : >"$ARGLOG"
mkdir -p "$SHIMS"
for cmd in git git-lfs curl base64 od tr sed grep wc cut mktemp rm cp mkdir uname cat dirname sleep npx node env; do
  real=$(command -v "$cmd" || true)
  [ -n "$real" ] || continue
  printf '#!/bin/sh\nprintf "%%s\\n" "%s $*" >>"%s"\nexec "%s" "$@"\n' "$cmd" "$ARGLOG" "$real" >"$SHIMS/$cmd"
  chmod +x "$SHIMS/$cmd"
done

# Wrangler stand-in: whoami succeeds unless STUB_LOGGED_OUT=1; "secret put"
# reads the secret from stdin and sends it to the local Worker on stdin.
cat >"$WORK/wrangler-stub" <<EOF
#!/bin/sh
case "\$1" in
  whoami)
    if [ "\${STUB_LOGGED_OUT:-0}" = 1 ]; then echo "You are not authenticated. Please run \\\`wrangler login\\\`."; exit 0; fi
    echo "You are logged in with an OAuth Token." ;;
  secret)
    [ "\$2" = put ] && [ "\$3" = LFS_UPLOAD_TOKEN ] || { echo "unexpected: \$*"; exit 1; }
    cat >"$ROTATED_MARK"
    curl -sS -X PUT --data-binary @"$ROTATED_MARK" "\$STUB_WORKER_URL/__test/secret"
    echo "Success! Uploaded secret LFS_UPLOAD_TOKEN" ;;
  *) echo "unexpected: \$*"; exit 1 ;;
esac
EOF
chmod +x "$WORK/wrangler-stub"

# ── throwaway clone + fake HOME ──────────────────────────────────────────
make_clone() {
  # make_clone NAME: a repo with the files the script relies on, and an
  # empty HOME. Prints nothing; sets CLONE and FAKE_HOME.
  CLONE=$WORK/$1/clone; FAKE_HOME=$WORK/$1/home
  mkdir -p "$CLONE/_tools/setup" "$CLONE/_tools/lfs-worker" "$FAKE_HOME"
  cp "$ROOT/.lfsconfig" "$ROOT/.gitattributes" "$CLONE/"
  cp "$ROOT/_tools/lfs-worker/wrangler.toml" "$CLONE/_tools/lfs-worker/"
  cp "$ROOT/$SCRIPT_REL" "$CLONE/_tools/setup/"
  HOME=$FAKE_HOME GIT_CONFIG_NOSYSTEM=1 git -C "$CLONE" init -q -b main
  HOME=$FAKE_HOME GIT_CONFIG_NOSYSTEM=1 git -C "$CLONE" add -A
  HOME=$FAKE_HOME GIT_CONFIG_NOSYSTEM=1 git -C "$CLONE" -c user.name=t -c user.email=t@example.invalid commit -q -m init
  git -C "$CLONE" remote add origin https://github.com/abucnasty/factorio-blueprints
}

# run NAME URL STDIN ARGS...: run the script; output in $WORK/NAME.out, exit
# code in RC. Watches the process table while it runs.
RC=0
run() {
  local name="$1" url="$2" input="$3"; shift 3
  local out="$WORK/$name.out"
  ( while :; do ps -eo args 2>/dev/null >>"$WORK/ps.log" || true; sleep 0.05; done ) &
  local watcher=$!
  set +e
  printf '%s' "$input" | env -i PATH="$SHIMS:$PATH" HOME="$FAKE_HOME" GIT_CONFIG_NOSYSTEM=1 \
    TERM=dumb TMPDIR="$WORK" RENDER_STORAGE_LFS_URL="$url" \
    RENDER_STORAGE_WRANGLER="$WORK/wrangler-stub" RENDER_STORAGE_RETRY_DELAY=0.2 \
    STUB_WORKER_URL="$url" STUB_LOGGED_OUT="${STUB_LOGGED_OUT:-0}" \
    bash "$CLONE/$SCRIPT_REL" "$@" >"$out" 2>&1
  RC=$?
  set -e
  kill "$watcher" 2>/dev/null || true; wait "$watcher" 2>/dev/null || true
  printf '%s\n' "$RC" >"$out.rc"
}

expect_rc()   { if [ "$RC" = "$2" ]; then ok "$1 (exit $2)"; else fail "$1: expected exit $2, got $RC" "$WORK/$3.out"; fi; }
expect_out()  { if grep -q -- "$2" "$WORK/$3.out"; then ok "$1"; else fail "$1: output lacks '$2'" "$WORK/$3.out"; fi; }
expect_no()   { if grep -q -- "$2" "$WORK/$3.out"; then fail "$1: output has '$2'" "$WORK/$3.out"; else ok "$1"; fi; }
# git-lfs itself records lfs.repositoryformatversion in .git/config the first
# time any git lfs command runs in a clone; that is not the script's change.
snapshot()    { (git config -f "$CLONE/.git/config" --list | grep -v '^lfs\.repositoryformatversion='; ls -la "$FAKE_HOME"; cat "$FAKE_HOME/.gitconfig" 2>/dev/null) || true; }

URL=$(start_worker main "$TOKEN")
URL_NOSECRET=$(start_worker nosecret)

# ── fresh machine ────────────────────────────────────────────────────────
make_clone fresh
before=$(snapshot)
run fresh-check "$URL" "" --check
expect_rc "fresh machine, --check reports problems" 1 fresh-check
expect_out "fresh --check flags git lfs install" "ACTION NEEDED  git lfs install has not been run" fresh-check
expect_out "fresh --check flags the missing token" "no upload token is stored" fresh-check
expect_no "fresh --check fixes nothing" "FIXED" fresh-check
if [ "$(snapshot)" = "$before" ]; then ok "--check left config and HOME unchanged"; else
  fail "--check changed config or HOME"; diff <(printf '%s\n' "$before") <(snapshot) | sed 's/^/     | /' || true; fi

run fresh-setup "$URL" "$TOKEN"$'\n' --yes
expect_rc "fresh machine, setup --yes with the token" 0 fresh-setup
expect_out "setup ran git lfs install" "FIXED          ran git lfs install" fresh-setup
expect_out "setup stored the token" "FIXED          upload token stored" fresh-setup
expect_out "setup confirmed the Worker accepts it" "PASS           the Worker accepts the stored token" fresh-setup
expect_out "setup set the helper override" "FIXED          this clone now uses only git's credential store" fresh-setup
helpers=$(git -C "$CLONE" config --local --get-all "credential.$URL.helper" | tr '\n' '|')
if [ "$helpers" = "|store|" ]; then ok "helper override is '' then 'store'"; else fail "helper override is '$helpers'"; fi
if [ "$(stat -c %a "$FAKE_HOME/.git-credentials" 2>/dev/null || stat -f %Lp "$FAKE_HOME/.git-credentials")" = 600 ]; then ok "credential file is mode 600"; else fail "credential file mode"; fi

# ── already configured: idempotent ───────────────────────────────────────
before=$(snapshot)
run again-setup "$URL" "" --yes
expect_rc "second run on a configured machine" 0 again-setup
expect_no "second run changes nothing" "FIXED" again-setup
expect_no "second run asks for no token" "Paste the upload token" again-setup
if [ "$(snapshot)" = "$before" ]; then ok "second run left config unchanged"; else fail "second run changed config"; fi
run again-check "$URL" "" --check
expect_rc "--check on a configured machine" 0 again-check

# ── round trip ───────────────────────────────────────────────────────────
run rt1 "$URL" "" --round-trip
expect_rc "round trip" 0 rt1
expect_out "round trip: pointer staged" "staged as an LFS pointer" rt1
expect_out "round trip: uploaded" "PASS           test image uploaded" rt1
expect_out "round trip: downloaded intact" "byte for byte identical" rt1
run rt2 "$URL" "" --round-trip
expect_out "round trip again reuses the object" "already stored by an earlier run" rt2
objects=$(curl -sS "$URL/__test/objects")
if [ "$objects" = '["ce/d8/ced8c4f454bf49dcdd19f439b01616f031f2bb896e867504eb329ea41723e587"]' ]; then
  ok "bucket holds exactly the one fixed test object"; else fail "bucket holds: $objects"; fi
if [ "$(git -C "$CLONE" rev-list --all --count)" = 1 ] && [ -z "$(git -C "$CLONE" status --porcelain)" ]; then
  ok "round trip left no commit or file in the clone"; else fail "round trip changed the clone"; fi

# ── wrong token ──────────────────────────────────────────────────────────
printf 'protocol=http\nhost=%s\nusername=lfs\npassword=%s\n\n' "${URL#http://}" "$WRONG" \
  | HOME=$FAKE_HOME GIT_CONFIG_NOSYSTEM=1 git -C "$CLONE" credential approve
run wrong-check "$URL" "" --check
expect_rc "wrong token, --check" 1 wrong-check
expect_out "wrong token is reported" "the Worker refused the stored upload token" wrong-check
expect_out "message names the no-secret case too" "set-worker-secret" wrong-check
run wrong-fix "$URL" "$TOKEN"$'\n' --yes
expect_rc "wrong token, re-entered the right one" 0 wrong-fix
expect_out "re-entered token accepted" "FIXED          new token stored and accepted" wrong-fix

# ── Worker without a secret ──────────────────────────────────────────────
make_clone nosecret
run nosecret-setup "$URL_NOSECRET" "$TOKEN"$'\n' --yes
expect_rc "Worker without LFS_UPLOAD_TOKEN" 1 nosecret-setup
expect_out "no-secret case is explained" "has not set LFS_UPLOAD_TOKEN on the Worker yet" nosecret-setup

# ── owner mode: --set-worker-secret ──────────────────────────────────────
STUB_LOGGED_OUT=1 run secret-loggedout "$URL_NOSECRET" "" --set-worker-secret --yes
expect_rc "--set-worker-secret when wrangler is logged out" 1 secret-loggedout
expect_out "logged-out message says how to log in" "npx wrangler login" secret-loggedout

run secret-set "$URL_NOSECRET" "" --set-worker-secret --yes
expect_rc "--set-worker-secret sets and stores a new token" 0 secret-set
expect_out "secret set" "FIXED          LFS_UPLOAD_TOKEN set on the Worker" secret-set
expect_out "new token accepted" "stored on this machine and accepted by the Worker" secret-set
expect_out "token not shown without a request" "token not shown" secret-set
ROTATED=$(cat "$ROTATED_MARK")
if [ "${#ROTATED}" = 64 ] && [ "$ROTATED" != "$TOKEN" ]; then ok "generated a fresh 64-hex token"; else fail "generated token looks wrong"; fi
run secret-after "$URL_NOSECRET" "" --check
expect_rc "--check after --set-worker-secret" 0 secret-after

# ── usage ────────────────────────────────────────────────────────────────
run help "$URL" "" --help
expect_rc "--help" 0 help
expect_out "--help shows usage" "Usage:" help
run badopt "$URL" "" --nope
expect_rc "unknown option" 2 badopt

# ── token never leaks ────────────────────────────────────────────────────
for t in TOKEN WRONG ROTATED; do
  v=${!t}
  if grep -rlF -- "$v" "$WORK"/*.out >/dev/null 2>&1; then fail "$t appears in script output"; else ok "$t never in script output"; fi
  if grep -qF -- "$v" "$ARGLOG"; then fail "$t appears in a command's arguments"; else ok "$t never in command arguments ($(wc -l <"$ARGLOG" | tr -d ' ') calls logged)"; fi
  if grep -qF -- "$v" "$WORK/ps.log"; then fail "$t seen in the process table"; else ok "$t never in the process table"; fi
  hits=$(grep -rlF -- "$v" "$WORK/fresh" "$WORK/nosecret" 2>/dev/null | sed "s|$WORK/||" | tr '\n' ' ' || true)
  case "$hits" in
    ""|*home/.git-credentials\ ) ok "$t only stored in ~/.git-credentials (${hits:-nowhere})" ;;
    *) if [ "$(printf '%s' "$hits" | tr ' ' '\n' | grep -vc 'home/.git-credentials$' || true)" = 0 ]; then
         ok "$t only stored in ~/.git-credentials ($hits)"; else fail "$t found in: $hits"; fi ;;
  esac
done

printf '\n%s passed, %s failed\n' "$PASSES" "$FAILS"
[ "$FAILS" = 0 ]
