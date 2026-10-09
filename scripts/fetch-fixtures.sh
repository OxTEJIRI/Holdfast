#!/usr/bin/env bash
# Dumps the Meteora program binaries used by the local validator / tests into fixtures/.
# Default cluster is mainnet (DESIGN.md §5.6). Devnet DFS lags mainnet: it does not whitelist
# DBC claim_trading_fee2 (see docs/VERIFICATION.md), so mainnet binaries are the reference.
set -euo pipefail
cd "$(dirname "$0")/.."
CLUSTER=${1:-mainnet-beta}
mkdir -p fixtures
for p in dbc:dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN dfs:dfsdo2UqvwfN8DuUVrMRNfQe11VaiNoKcMqLHVvDPzh damm_v2:cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG; do
  name=${p%%:*}; id=${p##*:}
  solana program dump -u "$CLUSTER" "$id" "fixtures/$name.so" >/dev/null
  echo "fixtures/$name.so  ($id, $CLUSTER, $(stat -c %s "fixtures/$name.so") bytes)"
done
