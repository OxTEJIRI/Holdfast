#!/usr/bin/env bash
# Integration tests (DESIGN.md §5.6): builds the program, starts a fresh local validator with the
# real Meteora programs (mainnet binaries + cloned accounts), runs the mocha suite, stops the
# validator. Rust unit tests (incl. §5.6 test 12) run first via cargo.
# Usage: scripts/test.sh [mocha args...]     e.g. scripts/test.sh --grep snipe
set -euo pipefail
cd "$(dirname "$0")/.."

cargo test --manifest-path programs/holdfast/Cargo.toml --lib --quiet
anchor build
[[ -f fixtures/dbc.so ]] || scripts/fetch-fixtures.sh

if solana cluster-version -u localhost >/dev/null 2>&1; then
  echo "a validator is already running on localhost:8899; stop it first" >&2
  exit 1
fi
scripts/local-validator.sh mainnet --reset >/dev/null 2>&1 &
VALIDATOR=$!
trap 'kill $VALIDATOR 2>/dev/null; wait $VALIDATOR 2>/dev/null || true' EXIT
for _ in $(seq 1 90); do solana cluster-version -u localhost >/dev/null 2>&1 && break; sleep 1; done
solana cluster-version -u localhost >/dev/null

pnpm exec mocha "$@"
