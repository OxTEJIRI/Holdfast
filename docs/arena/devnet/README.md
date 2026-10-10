# Arena run (devnet)

599 s, speed 2: window 90 s, snipe-lock 300 s, max wallet 3%, keeper fee mode.
Mint [`APiwgUykFZShEoiYR35MVa2P7HJbjHyHDorQ38M2cTtd`](https://explorer.solana.com/address/APiwgUykFZShEoiYR35MVa2P7HJbjHyHDorQ38M2cTtd?cluster=devnet). Produced by `pnpm -C sim arena` (sim/src/run.ts).

## Who got paid?

| Persona | Bots | SOL in | SOL out (sells) | Rewards (SOL) | Rewards per SOL in | Blocked by Holdfast |
|---|---:|---:|---:|---:|---:|---|
| Holders (buy small clips, never sell) | 10 | 0.6000 | 0.0000 | 0.021546 | 35.910 mSOL | — |
| Whale (8% after the window) | 1 | 0.1056 | 0.0000 | 0.005308 | 50.283 mSOL | MaxWalletExceeded ×1 |
| Snipers (buy at t+2 s, dump ASAP) | 3 | 0.0615 | 0.1691 | 0.000000 | 0.000 mSOL | SnipeLocked ×24 |
| Flippers (buy after the window, sell 30–90 s later) | 6 | 0.3600 | 0.4452 | 0.000000 | 0.000 mSOL | — |
| Bundler (+5 fresh wallets) | 6 | 0.0000 | 0.0000 | 0.000000 | 0.000 mSOL | RecipientNotRegistered ×5 |
| Closer (completes the curve) | 1 | 1.5394 | 0.0000 | 0.000000 | 0.000 mSOL | — |

- Holders vs flippers: **infinite**; holders vs snipers: **infinite** (rewards per SOL invested).
- Success metric (holders' rewards per SOL ≥ 5× flippers' and snipers'): **met**.
- Rewards paid: 0.025008 SOL from bonding-curve fees, then 0.001846 SOL from post-graduation DAMM v2 LP fees.
- 30 transfers were rejected by the hook, all inside the opening window or a snipe-lock.
- Honest note: snipers and flippers still sold for more than they paid (price appreciation). Holdfast doesn't stop that; it makes sure the launch's fee stream goes only to the people who stayed.

## Key transactions

- launch: [explorer](https://explorer.solana.com/tx/2pXwQk2JKkiutEn854VFWpV7cUtdJA9WoQcsV3UYDqiVZVi6BRAZiaExo5a5VSGeGGcKUmx36wsxvzD7asX4GXxK?cluster=devnet)
- graduation: [explorer](https://explorer.solana.com/tx/KW5hBM5pFWsFQfPKdaDqSRBCRNu7xi9fbcZTzj4ixDmndkXmNaPJhyf1GzZpXXYCBo1wHYuj7oUGbDczCxmN3Tn?cluster=devnet)
- finalize: [explorer](https://explorer.solana.com/tx/4aosJ9LLBoHMEmxdMqWG2SK3BgLSy7Kwc1jMg6tZF492rGnNwB8EMtvqyyydETkffSMDTXQ3fdJm63Z8aWEguw9m?cluster=devnet)
- bonding fees: [explorer](https://explorer.solana.com/tx/ePujAQ6vocxiCiK4ET8hU9KYzJkfhrJ1P3ZYC2xHMcnDFK51Q1ARR1UEvY3qWHWQaAu9bUX9R5i82agQ57oahcq?cluster=devnet)
- migrate: [explorer](https://explorer.solana.com/tx/2iU1MncZgezVNBpFSoWuvEb5397jrEuw7HiP4cwvUgLJZ9GWc3Qy4vtQBDu3stXCWH4AWtW5uW2Xg1pSByyb4bRu?cluster=devnet)
- claim-1: [explorer](https://explorer.solana.com/tx/bLP5NLPrWj5wij9MEWZCXia1wiqs1gyXBtB4jgfrmkqdakjM9P6jtA3Fvx37vV5VFGGYqzVKrERey35mAe99Nkq?cluster=devnet)
- LP fees: [explorer](https://explorer.solana.com/tx/5dpKhVCfow4k3YbvKNxRBgWgsiB3TvjXCzJP5gHs6eCAxJCc1ofwDvP4cWFGEEMRgNxvAFNCcFWbKf243WT5vqvz?cluster=devnet)
- claim-2: [explorer](https://explorer.solana.com/tx/5aUyvPgoq9uihn8tqn6kALWALZ8r2heRAgw5wdMjejGFHzcR47rPkZqeXHXZQAgBFsjHr9yY8HjKQcgPBYeYe54r?cluster=devnet)

Full event feed: `events.jsonl` (one JSON event per line; the web app's /arena page replays it).
