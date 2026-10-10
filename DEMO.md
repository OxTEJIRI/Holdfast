# Recording the Holdfast demo

This is the exact plan for the submission video: what to set up, what to click, and what to say. The finished video is about **3 minutes**. You record it in **one Loom session**, pausing during the waits so no editing is needed.

The live app is **https://hold-fast-mauve.vercel.app** (devnet). The video has two halves:

- **The tour** (about 1:40): the home page, then the Arena replay of the 27-bot run.
- **The live launch** (about 1:20): you launch your own token on camera, get snipe-locked, graduate it, and claim rewards.

---

## Part 0 · Set up (20 minutes, the day before or an hour before)

### 0.1 Wallet on devnet

1. In **Phantom**: Settings → Developer Settings → turn on **Testnet Mode** → select **Solana Devnet**.
   (In **Solflare**: Settings → General → Network → **Devnet**.)
2. Get **2 devnet SOL**. Use faucet.solana.com (sign in with GitHub), or send your wallet address to Claude and it will send SOL from the test wallet.
3. Check that Phantom shows about 2 SOL with the devnet label.

### 0.2 Browser

- Use Chrome or Edge with only the Phantom extension pinned.
- Set the window to roughly **1440 × 900** at **100% zoom**. Hide the bookmarks bar (Ctrl+Shift+B).
- Turn on Windows **Focus assist** (Do not disturb), so no notifications pop up.
- Open these tabs, in this order:
  1. https://hold-fast-mauve.vercel.app
  2. https://hold-fast-mauve.vercel.app/arena
  3. https://hold-fast-mauve.vercel.app/launch
  4. https://hold-fast-mauve.vercel.app/developers
- On the **launch** tab, click **Select Wallet** → Phantom → Connect. The top right then shows your address.

### 0.3 Recorder

- Install **Loom** (free, loom.com): the desktop app or the Chrome extension.
- Choose **Screen + Camera** if you want your face in a bubble, or **Screen only**.
- Record the **current tab** or the **full screen**. Use a headset mic if you have one.
- You'll use the **Pause** button (or Alt+Shift+P) during the waits.

### 0.4 Do one full dry run without recording

Go through Part 2 once for real, so you know the flow and your wallet has approved the site. Expect it to cost about 0.7 devnet SOL. Then top up to about 2 SOL again before recording.

---

## Part 1 · The tour (record this first)

**Start Loom recording.** Begin on tab 1 (home), scrolled to the very top.

### Shot 1 · The problem (0:00–0:12)

- **Do:** nothing. Let the kelp sway behind the headline.
- **Say:**
  > "On a bonding-curve launch, the money goes to whoever is fastest. Snipers buy in the first second, bundlers spray fresh wallets, flippers churn in and out. The people who actually stay get nothing for staying."

### Shot 2 · The idea (0:12–0:28)

- **Do:** scroll down slowly until the **"What is staying worth?"** card fills the screen.
  1. Drag **You hold for** from **60** down to **10**. The ring shrinks.
  2. Drag it back up to **60**.
  3. Drag **Then sell** to **100%**. The ring drops to 0.
- **Say:**
  > "Holdfast changes who gets paid. Every holder earns conviction: how much they hold, times how long. Hold longer and your share of the fees grows. Sell half your bag and you lose half your points. Sell it all and you're back to zero."

### Shot 3 · It's safe (0:28–0:40)

- **Do:** scroll to **"Provably not a honeypot."** and hover over the coloured bar.
- **Say:**
  > "A transfer hook can block sales, so we capped that power inside the program. The rules only apply in the first minutes, forty at the very most. After that the hook can't stop a single transfer, and when the token graduates, Meteora removes the hook entirely."

### Shot 4 · The Arena (0:40–1:40)

- **Do:**
  1. Switch to tab 2 (**Arena**).
  2. The replay starts on its own at **20×** (about 30 seconds). Click **Restart** so it plays from the beginning while you talk.
  3. Point your cursor at the **tank** while it plays. Snipers (amber fish) rush the **"the hook"** line and bounce off; the bundler's fish stay stuck on the left.
  4. When the line disappears and the label says **"hook revoked: free water"**, the run has graduated.
  5. Scroll down and click **Show them now** under **"Who got paid?"**.
- **Say** (pace it to the replay):
  > "To prove it, we ran an arena on devnet: twenty-seven bots, one real launch. Three snipers buy in the first seconds and try to dump. Watch them hit the line: snipe-locked, twenty-four times. The bundler sprays five fresh wallets: rejected, all five. The whale tries to grab eight percent during the opening window: refused, so it has to wait. Flippers get in and get out. Ten holders just buy small and keep holding.
  > The curve completes, the hook is revoked, the pool graduates to Meteora's DAMM v2, and the fees get paid out.
  > Holders earned thirty-six milli-SOL of rewards for every SOL they put in. Snipers and flippers earned zero. They can still take profit on the price, but the fee stream belongs to the people who stayed."
- **Then:** click **Pause** in Loom.

---

## Part 2 · Your live launch

The opening window lasts **45 seconds** from the moment your launch confirms. Steps 2.3 to 2.5 must happen inside it, so read them before you start.

### 2.1 Prepare the wizard while paused (not recorded)

On tab 3 (**/launch**), with your wallet connected:

1. **Token:**
   - Name: `Patient Capital`.
   - Symbol: `STAY`.
   - Pick any avatar, then click **Continue**.
2. **Preset:** click the **Arena (demo)** card → **Continue**.
3. **Rules:**
   - Drag **Graduation threshold** down to **0.5 SOL**, so you can complete the curve yourself.
   - Leave the rest as is: window 0:45, snipe-lock 2:30, max wallet 3%.
   - Click **Continue**.
4. **Fees:** leave 60 / 30 / 10 and the treasury empty → **Continue**.
5. **Curve:** shows the chart → **Continue**.
6. You're now on **Review and launch**. Leave **Your first buy** empty.

**Resume** the Loom recording.

### Shot 5 · Launch (1:40–1:55)

- **Do:**
  1. Scroll up briefly so the review summary is visible.
  2. Click **Launch (2 signatures)** and approve **both** Phantom pop-ups. The kelp grows with each confirmation, and a **"Launched"** ripple appears.
  3. Click **Open your token**.
- **Say:**
  > "Now a real launch, with a real wallet. One click creates a Meteora bonding-curve pool with Holdfast built in. Two signatures, and it's live."

### Shot 6 · Buy and get snipe-locked (1:55–2:20)

Do this **immediately**: the badge at the top right must still read **Opening window**.

- **Do:**
  1. In **Trade → Buy**, type **0.005** and click **Buy**. Approve in Phantom.
     - You get a toast **"Bought with 0.005 SOL (wallet registered)"** and an **"In."** ripple.
     - The ring fills and turns **amber**, and **Unlocks in** shows a countdown.
  2. Point at **Points** increasing.
  3. Click the **Sell** tab, then **Try to sell anyway**. A red toast reads **"Snipe-locked until 14:32:05"** (your own time).
- **Say:**
  > "I buy in the opening window. My first buy registers my wallet, and my points start growing every second. That ring is my share of every future fee. But I bought in the window, so if I try to dump, the hook says no, and tells me exactly when I can."
- If instead the toast says the wallet **can't hold more than the max-wallet limit**, keep it in the video. That's the anti-whale rule. Say *"and that's the max-wallet rule stopping a whale"*, then buy **0.002** instead.
- **Then:** **Pause** Loom.

### 2.2 Graduate the token while paused (not recorded, about 2 minutes)

1. Wait until the **Rules** card shows **Opening window** crossed out with "ended …". The 3% cap only applies inside the window.
2. In **Trade → Buy**, buy **0.1** SOL, approve, and repeat until the **Bonding curve** bar reaches **100%**. It takes about 5 or 6 buys. The last buy only fills what's left of the curve.
3. The badge changes to **Graduated**.

**Resume** the Loom recording.

### Shot 7 · Get paid (2:20–2:42)

- **Do**, in the **Rewards** panel:
  1. Click **Finalize** and approve. You see "Conviction frozen".
  2. Click **Route fees to holders** and approve all the pop-ups (2 to 4). You see the toast "Fees routed to holders".
  3. Click **Claim … SOL** and approve. You see a big **"+… SOL, paid for staying"** ripple.
  4. Optionally click **Migrate to DAMM v2** and approve. The badge becomes **Trading on DAMM v2**.
- **Say:**
  > "When the curve completes, conviction freezes. The trading fees, from the bonding curve and then from the DAMM v2 pool for as long as the token trades, are paid to holders by their share, in SOL."

---

## Part 3 · Close

### Shot 8 · For builders (2:42–2:55)

- **Do:** switch to tab 4 (**/developers**) and scroll slowly past the **Three calls** code and the **Safety caps**.
- **Say:**
  > "Any Meteora launchpad can add this with three calls from our SDK. It runs on the Dynamic Bonding Curve's transfer-hook pools and anti-sniper fees, graduates into a compounding DAMM v2 pool with the LP locked forever, and on mainnet splits fees through Dynamic Fee Sharing. On devnet a keeper does that split."

### Shot 9 · Sign-off (2:55–3:00)

- **Do:** switch to tab 1 and scroll to the top hero.
- **Say:**
  > "Holdfast. Launches that reward the people who stay."
- **Stop** the Loom recording.

---

## After recording

1. In Loom, trim the very start and end if needed. The pauses already removed the waits.
2. Set the video to **Anyone with the link can view**, and copy the link.
3. Send the link to Claude, which will add it to the README, the deck and `docs/submission.md`.
4. Submit using `docs/submission.md`: Colosseum by **Oct 12**, Superteam by **Oct 13, 06:59 UTC**.

## If something goes wrong on camera

| What happens | What to do |
|---|---|
| The window ended before your buy landed (no amber ring, no "Unlocks in") | Pause, then go back to Part 2.1 and launch a second token. Do the buy faster this time. |
| A toast says "The network was slow … please retry" | Click the same button again. The public devnet RPC sometimes rate-limits. |
| A buy says "Price moved too much" | Click Buy again. |
| A page is stuck on the loading shimmer | Refresh. Your wallet stays connected. |
| Phantom shows "insufficient SOL" | Pause and top up from the faucet. Each full run needs about 0.7 SOL. |

**Why your claim is small:** on devnet you are the only trader, so the fees you claim are mostly the ones your own buys paid. That's expected; the Arena (shot 4) is the proof with 27 independent wallets.
