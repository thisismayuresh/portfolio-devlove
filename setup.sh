#!/usr/bin/env bash
#
# Forge setup — Linux and macOS.
#
# Installs everything the project needs, builds the WebAssembly engine, and
# optionally serves the editor. Safe to re-run: every step checks first and
# skips what is already in place.
#
#   ./setup.sh                 install, build
#   ./setup.sh --serve         install, build, then serve on :8080
#   ./setup.sh --serve --port 3000
#   ./setup.sh --dev           fast unoptimised build
#   ./setup.sh --test          run the Rust and browser test suites
#   ./setup.sh --yes           never prompt (for CI)
#   ./setup.sh --help
#
# The Windows equivalent is setup.ps1.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# ----------------------------------------------------------------- options --

DO_SERVE=0
DO_TEST=0
ASSUME_YES=0
BUILD_PROFILE="release"
PORT=8080

usage() {
  sed -n '3,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit 0
}

while [ $# -gt 0 ]; do
  case "$1" in
    --serve) DO_SERVE=1 ;;
    --test) DO_TEST=1 ;;
    --dev) BUILD_PROFILE="dev" ;;
    --yes | -y) ASSUME_YES=1 ;;
    --port)
      shift
      PORT="${1:-8080}"
      ;;
    --help | -h) usage ;;
    *)
      echo "Unknown option: $1 (try --help)" >&2
      exit 2
      ;;
  esac
  shift
done

# ------------------------------------------------------------------ output --

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'
  YELLOW=$'\033[33m'; BLUE=$'\033[34m'; RESET=$'\033[0m'
else
  BOLD=""; DIM=""; RED=""; GREEN=""; YELLOW=""; BLUE=""; RESET=""
fi

step() { printf '\n%s==>%s %s%s%s\n' "$BLUE" "$RESET" "$BOLD" "$1" "$RESET"; }
ok()   { printf '    %s✓%s %s\n' "$GREEN" "$RESET" "$1"; }
info() { printf '    %s%s%s\n' "$DIM" "$1" "$RESET"; }
warn() { printf '    %s!%s %s\n' "$YELLOW" "$RESET" "$1"; }
die()  { printf '\n%serror:%s %s\n' "$RED" "$RESET" "$1" >&2; exit 1; }

have() { command -v "$1" >/dev/null 2>&1; }

# Asks a yes/no question. Returns 0 for yes.
confirm() {
  if [ "$ASSUME_YES" -eq 1 ]; then
    return 0
  fi
  if [ ! -t 0 ]; then
    # No terminal to ask on (CI, piped). Refuse rather than install silently.
    return 1
  fi
  printf '    %s?%s %s [y/N] ' "$YELLOW" "$RESET" "$1"
  read -r reply
  case "$reply" in [yY] | [yY][eE][sS]) return 0 ;; *) return 1 ;; esac
}

# ------------------------------------------------------------- environment --

step "Checking the environment"

OS="$(uname -s)"
ARCH="$(uname -m)"
info "$OS $ARCH"

case "$OS" in
  Linux)
    if ! have cc && ! have gcc && ! have clang; then
      warn "No C compiler found. Rust needs a linker to build host binaries."
      if have apt-get; then
        info "Install one with:  sudo apt-get install -y build-essential pkg-config"
      elif have dnf; then
        info "Install one with:  sudo dnf install -y gcc"
      elif have pacman; then
        info "Install one with:  sudo pacman -S --needed base-devel"
      elif have apk; then
        info "Install one with:  sudo apk add build-base"
      else
        info "Install your distribution's C toolchain package."
      fi
      die "C toolchain missing"
    fi
    ok "C toolchain present"
    ;;
  Darwin)
    if ! xcode-select -p >/dev/null 2>&1; then
      warn "Xcode Command Line Tools are not installed."
      info "Install them with:  xcode-select --install"
      die "Command Line Tools missing"
    fi
    ok "Xcode Command Line Tools present"
    ;;
  *)
    warn "Unrecognised platform '$OS' — continuing, but you are off the tested path."
    ;;
esac

# --------------------------------------------------------------------- Rust --

step "Rust toolchain"

# A previous run in this same shell session may not have refreshed PATH yet.
if [ -f "$HOME/.cargo/env" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.cargo/env"
fi

if have cargo; then
  ok "$(rustc --version)"
else
  warn "Rust is not installed."
  if ! have curl; then
    die "curl is required to install Rust. Install curl, or install Rust from https://rustup.rs"
  fi
  if ! confirm "Install the Rust toolchain via rustup (from https://sh.rustup.rs)?"; then
    die "Rust is required. Install it from https://rustup.rs and re-run."
  fi
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --no-modify-path
  # shellcheck disable=SC1091
  . "$HOME/.cargo/env"
  have cargo || die "Rust installed but cargo is still not on PATH"
  ok "$(rustc --version)"
fi

# ------------------------------------------------------------- wasm target --

step "WebAssembly target"

if rustup target list --installed 2>/dev/null | grep -q '^wasm32-unknown-unknown$'; then
  ok "wasm32-unknown-unknown already installed"
else
  info "Adding wasm32-unknown-unknown…"
  rustup target add wasm32-unknown-unknown
  ok "wasm32-unknown-unknown installed"
fi

# ----------------------------------------------------------------- wasm-pack --

step "wasm-pack"

if have wasm-pack; then
  ok "$(wasm-pack --version)"
else
  warn "wasm-pack is not installed."
  if ! confirm "Build and install wasm-pack with cargo? (takes a few minutes)"; then
    die "wasm-pack is required. See https://rustwasm.github.io/wasm-pack/"
  fi
  cargo install wasm-pack --locked
  have wasm-pack || die "wasm-pack installed but is not on PATH (check ~/.cargo/bin)"
  ok "$(wasm-pack --version)"
fi

# --------------------------------------------------------------------- build --

step "Building the engine"

if [ "$BUILD_PROFILE" = "dev" ]; then
  info "wasm-pack build --target web --dev"
  wasm-pack build --target web --dev
else
  info "wasm-pack build --target web"
  wasm-pack build --target web
fi

[ -f "pkg/designer_engine.js" ] || die "build finished but pkg/designer_engine.js is missing"
ok "pkg/ is ready ($(du -h pkg/designer_engine_bg.wasm 2>/dev/null | cut -f1 || echo '?') wasm)"

# --------------------------------------------------------------------- tests --

PYTHON=""
for candidate in python3 python; do
  if have "$candidate"; then
    PYTHON="$candidate"
    break
  fi
done

if [ "$DO_TEST" -eq 1 ]; then
  step "Running tests"
  cargo test
  ok "Rust unit tests passed"

  if have node && [ -n "$PYTHON" ]; then
    node tests/run-browser-tests.mjs
    ok "Browser tests passed"
  else
    warn "Skipping browser tests (needs Node 22+ and Python on PATH)"
  fi
fi

# --------------------------------------------------------------------- serve --

if [ "$DO_SERVE" -eq 1 ]; then
  [ -n "$PYTHON" ] || die "Python 3 is required to serve. Install it, or use any static file server."
  step "Serving"
  exec "$PYTHON" serve.py "$PORT"
fi

step "Done"
if [ -n "$PYTHON" ]; then
  printf '    Start the editor with:  %s%s serve.py%s\n' "$BOLD" "$PYTHON" "$RESET"
else
  printf '    Serve this folder over HTTP and open index.html.\n'
fi
printf '    Rebuild after editing src/:  %swasm-pack build --target web%s\n\n' "$BOLD" "$RESET"
