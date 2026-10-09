#!/usr/bin/env bash
# Local validator with the REAL Meteora programs (DBC, DFS, DAMM v2) plus the DAMM v2 migration
# config accounts. Holdfast itself is loaded from target/deploy.
#
# Usage: scripts/local-validator.sh [mainnet|devnet] [--reset]
#   mainnet (default): program binaries from fixtures/ (scripts/fetch-fixtures.sh), configs cloned from mainnet
#   devnet:            programs + configs cloned live from devnet
set -euo pipefail
cd "$(dirname "$0")/.."

SOURCE=${1:-mainnet}
DBC=dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN
DFS=dfsdo2UqvwfN8DuUVrMRNfQe11VaiNoKcMqLHVvDPzh
DAMM=cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG
HOLDFAST=$(solana-keygen pubkey target/deploy/holdfast-keypair.json)
UPGRADE_AUTH=$(solana-keygen pubkey ~/.config/solana/id.json)
# Cloned accounts. DBC SDK DAMM_V2_MIGRATION_FEE_ADDRESS (index 6 = Customizable); same keys on mainnet and devnet
DAMM_CONFIGS=(
  7F6dnUcRuyM2TwR8myT1dYypFXpPSxqwKNSFNkxyNESd 2nHK1kju6XjphBLbNxpM5XRGFj7p9U8vvNzyZiha1z6k
  Hv8Lmzmnju6m7kcokVKvwqz7QPmdX9XfKjJsXz8RXcjp 2c4cYd4reUYVRAB9kUUkrq55VPyy2FNQ3FDL4o12JXmq
  AkmQWebAwFvWk55wBoCr5D62C6VVDTzi84NJuD9H7cFD DbCRBj8McvPYHJG1ukj8RE15h2dCNUdTAESG49XpQ44u
  A8gMrEPJkacWkcb3DGwtJwTe16HktSEfvwtuDh2MCtck
  # DBC pool authority PDA: the deployed DBC pays DAMM v2 migration rent from its lamports
  FhVo3mqL8PW5pH5U2CN4XE33DokiyZnUwuGpH2hmHLuM
)

mkdir -p .anchor
args=(--ledger .anchor/test-ledger --quiet
  --upgradeable-program "$HOLDFAST" target/deploy/holdfast.so "$UPGRADE_AUTH")
case "$SOURCE" in
  mainnet)
    [[ -f fixtures/dbc.so ]] || scripts/fetch-fixtures.sh
    args+=(--url mainnet-beta
      --upgradeable-program "$DBC" fixtures/dbc.so "$UPGRADE_AUTH"
      --upgradeable-program "$DFS" fixtures/dfs.so "$UPGRADE_AUTH"
      --upgradeable-program "$DAMM" fixtures/damm_v2.so "$UPGRADE_AUTH") ;;
  devnet)
    args+=(--url devnet --clone-upgradeable-program "$DBC" --clone-upgradeable-program "$DFS" --clone-upgradeable-program "$DAMM") ;;
  *) echo "unknown source $SOURCE" >&2; exit 1 ;;
esac
for a in "${DAMM_CONFIGS[@]}"; do args+=(--clone "$a"); done
[[ " $* " == *" --reset "* ]] && args+=(--reset)
exec solana-test-validator "${args[@]}"
