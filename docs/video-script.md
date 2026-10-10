# Demo video script

> **The step-by-step recording guide is [DEMO.md](../DEMO.md).** This file is the shorter shot list.

Target length: **2:45** (about 380 words of narration at a calm pace). Screen recording of https://hold-fast-mauve.vercel.app, with your voice over it. Every number on screen is from real devnet transactions.

## Before you record

- Use Phantom or Solflare on **devnet** with about 0.5 SOL. Ask Claude to send some if needed.
- Browser at 1440×900 or similar, 100% zoom, bookmarks bar hidden, notifications off.
- Open these tabs in order:
  1. the home page `/`;
  2. `/arena`;
  3. the graduated test token `/t/6GPt1ftJUEb9VqYH1rCSKqbKmZUPrHbv2U5N6X9opKf9`;
  4. `/launch`;
  5. `/developers`.
- **Shot 5 needs a live token in its opening window.** About two minutes before you start, launch a token with the **Fair Launch** preset (2-minute window, 15-minute lock) from `/launch`. Buy 0.01 SOL on it straight away, so your wallet is snipe-locked for the shot.
- Do a dry run of shots 2 and 4 first: the Arena replay timing depends on the speed you pick.

## Shot list

| # | Time | On screen | Narration |
|---|---|---|---|
| 1 | 0:00–0:12 | Home page hero: kelp swaying, headline "Launches that reward the people who stay." | On a bonding-curve launch, the money goes to whoever is fastest. Snipers buy in the first second, bundlers spray fresh wallets, flippers churn. The people who actually stay get nothing for staying. |
| 2 | 0:12–0:25 | Scroll to **"What is staying worth?"** Drag *You hold for* from 60 down to 10, then set *Then sell* to 100%. The ring drops to 0. | Holdfast changes who gets paid. Every holder earns conviction: how much they hold times how long. Sell half your bag and you lose half your points. Sell it all and you're back to zero. |
| 3 | 0:25–0:35 | Scroll to **Provably not a honeypot**. | A transfer hook can block sales, so we capped that power in the program itself. Rules only apply in the first minutes, forty at the very most. After that the hook can't stop a single transfer, and at graduation Meteora removes it entirely. |
| 4 | 0:35–1:40 | `/arena`, click **20×**, then **Restart**. Let it play: the tank, snipers bouncing off "the hook" line, the amber feed. When it reaches graduation, point at "hook revoked: free water". Click **Show them now** under *Who got paid?* | To prove it, we ran an arena on devnet. Twenty-seven bots, one real launch. Three snipers buy in the first seconds and try to dump. Watch them hit the line: snipe-locked, twenty-four times. The bundler sprays five fresh wallets: rejected, all five. The whale tries to grab eight percent in the window: refused, so it waits. Flippers get in and out. Ten holders just buy small and keep holding. The curve completes, the hook is revoked, the pool moves to DAMM v2, and the fees get paid. Holders: thirty-six milli-SOL of rewards for every SOL they put in. Snipers and flippers: zero. They can still take profit, but the fee stream belongs to the people who stayed. |
| 5 | 1:40–2:05 | The live token you launched in prep: the **conviction ring** ticking up, the rules timeline counting down. Open the **Sell** tab, click **Try to sell anyway**, and show the toast "Snipe-locked until …". | This is a real launch with a real wallet. My points grow every second I hold, and the ring is my share of every future fee. I bought in the opening window, so if I try to dump, the hook says no, and tells me exactly when I can. |
| 6 | 2:05–2:18 | The graduated token tab: the rewards panel with "You've earned 0.016273 SOL". If you can, replay the claim celebration. Otherwise show `docs/screens/06a-claim-celebration.png`. | After graduation, fees flow in from the bonding curve, then from the DAMM v2 pool for as long as the token trades. Holders claim in SOL. |
| 7 | 2:18–2:35 | `/developers`: the three-call code block, then the safety caps. | Any DBC launchpad can add this with three calls from our SDK: create the launch, buy, and claim. It plugs into Meteora's Dynamic Bonding Curve with transfer-hook pools and the anti-sniper fee scheduler, graduates into a compounding DAMM v2 pool with the partner LP locked forever, and splits fees through Dynamic Fee Sharing. |
| 8 | 2:35–2:45 | Back to the home page hero. | Holdfast. Launches that reward the people who stay. |

## After recording

- Upload the video unlisted on YouTube (or as a Loom). Send Claude the link, and it will add it to the README and the deck.
- Keep the raw file: the Colosseum and Superteam forms may each want a link.
