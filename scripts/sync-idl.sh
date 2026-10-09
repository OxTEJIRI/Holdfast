#!/usr/bin/env bash
# Copies the Anchor IDL + TS types into @holdfast/sdk (run after `anchor build`).
set -euo pipefail
cd "$(dirname "$0")/.."
cp target/idl/holdfast.json packages/sdk/src/idl/holdfast.json
cp target/types/holdfast.ts packages/sdk/src/idl/holdfast.ts
