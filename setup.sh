#!/usr/bin/env bash
#
# devlove — check the environment, optionally run the tests, and serve.
#
# There is no build step. The editor is plain ES modules and runs exactly as
# it is written, so this script only ever checks that you have what you need
# and starts a static server.
#
#   ./setup.sh              # check the environment
#   ./setup.sh --serve      # check, then serve on http://127.0.0.1:8080
#   ./setup.sh --test       # run the unit tests, then the browser tests
#   ./setup.sh --test --serve --port 3000
#
set -euo pipefail

PORT=8080
SERVE=0
TEST=0

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# ------------------------------------------------------------------ output --

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }
die()  { printf '  \033[31m✗\033[0m %s\n' "$1" >&2; exit 1; }

usage() {
  cat <<'EOF'
Usage: ./setup.sh [options]

  --serve         serve the editor when the checks pass
  --port <n>      port for --serve (default 8080)
  --test          run the unit tests and the browser test suite
  -h, --help      this message

There is nothing to install for the editor itself. Python is used only for the
bundled static server; Node is used only to run the tests.
EOF
}

# ------------------------------------------------------------------- flags --

while [[ $# -gt 0 ]]; do
  case "$1" in
    --serve) SERVE=1; shift ;;
    --test)  TEST=1; shift ;;
    --port)  PORT="${2:?--port needs a number}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown option: $1  (try --help)" ;;
  esac
done

# ------------------------------------------------------------------ checks --

bold "Checking the environment"

PYTHON=""
for candidate in python3 python; do
  if command -v "$candidate" >/dev/null 2>&1; then
    PYTHON="$candidate"
    break
  fi
done
if [[ -n "$PYTHON" ]]; then
  ok "$($PYTHON --version 2>&1) — for the bundled server"
else
  warn "no Python found. Any static file server works instead; see the README."
fi

if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
  if (( NODE_MAJOR >= 20 )); then
    ok "node $(node -v) — for the tests"
  else
    warn "node $(node -v) is older than v20; the test suites need v20+"
  fi
else
  warn "no Node found. Only the tests need it — the editor does not."
fi

ok "no build step: js/, css/ and index.html are served as written"

# ------------------------------------------------------------------- tests --

if [[ $TEST -eq 1 ]]; then
  command -v node >/dev/null 2>&1 || die "--test needs Node v20+"
  bold "Unit tests"
  node --test "tests/unit/*.test.js"
  bold "Browser tests"
  node tests/run-browser-tests.mjs
fi

# ------------------------------------------------------------------- serve --

if [[ $SERVE -eq 1 ]]; then
  [[ -n "$PYTHON" ]] || die "--serve needs Python 3.8+, or use any static server"
  bold "Serving on http://127.0.0.1:$PORT/"
  exec "$PYTHON" serve.py "$PORT"
fi

if [[ $TEST -eq 0 ]]; then
  bold "Ready"
  echo "  Run:  ./setup.sh --serve"
fi
