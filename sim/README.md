# The Arena

Bots that prove Holdfast's mechanics on a real launch (DESIGN.md §8). Uses only `@holdfast/sdk`.

| Persona | Bots | Behaviour | What Holdfast does |
|---|---:|---|---|
| Sniper | 3 | buy 2.5% of supply at t+2 s, try to dump at t+15 s, retry every 10 s | `SnipeLocked` until the lock ends; dumping forfeits every point |
| Bundler | 1 (+5 wallets) | buys into 5 fresh, unregistered wallets in the window | `RecipientNotRegistered` |
| Whale | 1 | tries to take 8% in the window, then buys 8% after it | `MaxWalletExceeded`, then allowed |
| Flipper | 6 | buys after the window, sells everything 30–90 s later | sells forfeit all points |
| Holder | 10 | three small clips, never sells | earns the fees |
| Closer | 1 | completes the curve | triggers graduation |

After graduation: crank (finalize + route bonding fees), migrate to DAMM v2, every holder claims, the closer trades on DAMM v2, crank again (LP fees), everyone claims again.

```bash
pnpm -C sim fund                      # create bots in sim/.keys/ (gitignored) and top them up
pnpm -C sim arena [--speed 0.4]       # → sim/out/events.jsonl, arena.json, summary.json
pnpm -C sim report                    # copy the run to docs/arena/<network>/ + README
pnpm -C sim sweep                     # return the bots' leftover SOL
```

`RPC_URL` picks the cluster (default: local validator; refuses mainnet). `--speed` scales the timeline **and** the launch's window, lock and fee decay.

## Public devnet RPC

`api.devnet.solana.com` limits each IP to roughly 100 requests per 10 s, 40 per method per 10 s, and 40 new connections per 10 s. Twenty-seven bots hitting it at once get 429s, and the opening window closes before their trades land. The sim therefore:

- paces every RPC call with a token bucket (`RPC_RPS`, `RPC_BURST`) and caps requests in flight (`RPC_IN_FLIGHT`);
- runs at most `SIM_ACTIONS` bot actions at once, so they finish in scheduled order;
- shares one blockhash and confirms all pending transactions with one batched `getSignatureStatuses` poll;
- prices trades after the run instead of during it.

Settings used for the recorded devnet run: `RPC_RPS=3.5 RPC_BURST=6 RPC_IN_FLIGHT=4 SIM_ACTIONS=2 --speed 2` (90 s window, 300 s lock, about 8 minutes). With a dedicated RPC endpoint, raise `RPC_RPS` and lower `--speed`. The web app's `/arena` page replays the recorded events at any speed.
