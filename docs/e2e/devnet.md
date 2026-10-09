# Phase 2 end-to-end run (devnet)

Run at 2026-10-09T17:08:14.266Z by `scripts/e2e.ts` (keeper fee mode). Program `E5AkJh1QFPsVTBf6E3Z9MfUWENtb82TGK1hoytkKTEGw`.

| # | Step | Tx | Note |
|---|---|---|---|
| 1 | §6.1 launch: DBC hook config, then pool + init_launch + creator register in one tx | [3XMShH23…](https://explorer.solana.com/tx/3XMShH23o2LgpmdV5oR72HQz2my9Xjrsh1QJCUWQPCEYxLPF38ofJnPEZkeUYrQFCSim4xiFS5MRRngHr46naorZ?cluster=devnet) | window 60 s, lock 60 s, max wallet 3%, threshold 0.1 SOL |
| 2 | alice registers + buys 1.5% of supply in the window | [4oVx12o7…](https://explorer.solana.com/tx/4oVx12o783fhbEA2NG7XwwvTbZjKsRTQyoGhSW3qf1TQn1HaLCpcBEjF7w6fCbjBfoAszk1dGxR1yS558McTdJuv?cluster=devnet) |  |
| 3 | bob registers + buys 1% of supply in the window | [33DiCALM…](https://explorer.solana.com/tx/33DiCALMQkmS8TuhdW65NfW6KbvWTQ1ZhtwuTyVeSh8d9DvFuVNikKFXMCsgD2qrivDnS6txV46HRjgr4W4d6BJW?cluster=devnet) |  |
| 4 | alice tries to dump inside her lock → rejected (simulation) | simulated | SnipeLocked |
| 5 | unregistered wallet tries to buy in the window → rejected (simulation) | simulated | RecipientNotRegistered |
| 6 | bob tries to go above 3% of supply in the window → rejected (simulation) | simulated | MaxWalletExceeded |
| 7 | flipper buys after the window (unregistered → untracked) | [45edoqAa…](https://explorer.solana.com/tx/45edoqAaSmMcCEdxi3ACVy1nnp3GLumEoNTHcu8VQtY6NZwWceja2XKF649iA2KxsPjf8A9cDUKb6JdKCCuEsj4H?cluster=devnet) |  |
| 8 | flipper sells everything | [5edej58j…](https://explorer.solana.com/tx/5edej58jdfCWhgy9Ny6Vtnu45tXoUi4Bs65x5oPD9S2BzG14xVSvi58LkaMFAu84xpiztSyeXEcmobRaDc244UKV?cluster=devnet) |  |
| 9 | bob sends 30% to a fresh wallet (forfeits 30% of his points) | [5idBt222…](https://explorer.solana.com/tx/5idBt222mue46ecAcGwKCDXmrEBE2AaazDFWtb2T3rdMHnkvifuMyrsYBjPcr2Pfc34nyEhTg84dHe7SVadothy?cluster=devnet) |  |
| 10 | closer completes the curve (DBC revokes the hook) | [3YqqoFKX…](https://explorer.solana.com/tx/3YqqoFKXV15Pdtio1EcQWX5pJ6dKieZqYWtRgWoBtCsfT4j4Gn54MNkKrzoEgQXGyhtkt4LwLrXA94hDypMLMzx5?cluster=devnet) |  |
| 11 | finalize: conviction frozen at finishCurveTimestamp | [4Jno1orR…](https://explorer.solana.com/tx/4Jno1orRqS4JX3kp73Kc9ehZuQgwZ9sBGjZr4zDg9dDKMTdQ5RQ6u3mVve1Q7Rz5CajFud8BA6BrwijFrZhVmLhd?cluster=devnet) |  |
| 12 | keeper: claimPartnerTradingFee2 (DBC bonding fees) | [2ibYoE4S…](https://explorer.solana.com/tx/2ibYoE4Sx7UAVQavig9edD1J6oKgEMncEgMRU5p36wsdKwYJMEqnc2aPaw4JtzLSTrJULabejbfAUjG85ba6dLQV?cluster=devnet) | 0.001126 SOL |
| 13 | keeper: deposit_rewards (holders' 60%) | [37CLc3hF…](https://explorer.solana.com/tx/37CLc3hFoLGw53QjbdNbennGjCqU6kKUoAqcqUEKqCjGZzAXSmYWBM5kL1NXWbKdYXYXGzAAnHqtgnEukctwSUyd?cluster=devnet) | 0.000676 SOL |
| 14 | alice claims (round 1) | [5ZyMw1uC…](https://explorer.solana.com/tx/5ZyMw1uCXQVQWzgGTwc1fRJzEkoXSRRG1twVheQMpbQdZkC9TmjPwsBmNv4QJRWkL6fi1opWETGremogDMngFmh9?cluster=devnet) | 0.000474 SOL |
| 15 | bob claims (round 1) | [2UaAvsUJ…](https://explorer.solana.com/tx/2UaAvsUJPx8B2K2GN3c5VNbotMEQ2NMxKG1zSKejHccZE3fHpbhwr9rwCQNDW5BjJLMW6Cv8Crz4FnJ6e5dy4ooj?cluster=devnet) | 0.000202 SOL |
| 16 | migrateToDammV2 (Compounding pool) | [n3p4Xn7L…](https://explorer.solana.com/tx/n3p4Xn7L5CxyRauYA9UtrfuUJfwFUd3BXZPkSSnzrcpUT56eWg71SeM1wF24ajMVjaBRLaYHhbHviLnM1SfMBoL?cluster=devnet) |  |
| 17 | post-graduation trade on DAMM v2 (closer sells half) | [45yCsdnr…](https://explorer.solana.com/tx/45yCsdnr8psbxuNf7QyFz6ysS1pG21Bnsk7aEjd29RutU3MmthxYzW7ck9ChCBSc6dcUQS6tVCC7HozfLu9SL3Ms?cluster=devnet) |  |
| 18 | keeper: claim partner LP fee (DAMM v2 claim_position_fee) | [38uiEr8i…](https://explorer.solana.com/tx/38uiEr8iuigsaRtQTKYueiNSTXWhBVPSWL5jFAgEKQ5x5F71DgsRBJi1aoKRJbKGgoj6MW1VAddCQwMMcqnQ23RN?cluster=devnet) | 0.000132 SOL (quote side) |
| 19 | keeper: deposit_rewards (holders' 60% of LP fees) | [3eh9cQR7…](https://explorer.solana.com/tx/3eh9cQR7QSDT25rSqefSYEBJtLRCVqq7vTCChbRhSFsuX7TDYnwFaaHdRid28VcU5qML5GLZMZA15WQtLJzu61MR?cluster=devnet) | 0.000079 SOL |
| 20 | alice claims again (round 2, post-graduation) | [Q7iKTgtU…](https://explorer.solana.com/tx/Q7iKTgtUPKtRAHrSrWJGjN7zEh1fAFqXhytUwJDqGyHpZEDajmr12sVSxKbL7wQjLvvx459PfsvHXHBtX89rdsT?cluster=devnet) | 0.000055 SOL |
| 21 | bob claims again (round 2, post-graduation) | [3sUgVrDn…](https://explorer.solana.com/tx/3sUgVrDnrBbR5DKvKjUoLKNeA1MNqoHidyRddRM4L4uuTTnP6CcZsx7NUqu1e7oRd7FJN5T5rddZfArvReTJcadt?cluster=devnet) | 0.000024 SOL |

## Facts

- mint: `4XdLj26LrZQrYGCuS4AwtnTWafNuDCfsafro7MXfMr3R`
- pool: `ExZfi55FDDWjw4XMnZC7qL5R5LtwdX87vD9rxrV8vJtZ`
- launch: `DVRskQhqEZb8RuXSY3tFSBmk5gHrsjh9AP9f4RZCyQdf`
- finalTs: `1791565669`
- finalTotalPoints: `2394000000000000`
- dammPool: `7xW4Luj7KQegXvTHGUsLXKrJ9jTgsyrzNtt7dsTGon7Z`
- dammCollectFeeMode: `2`
- partnerLpFeeLamports: `131740`
- aliceFinalPoints: `1680000000000000`
- bobFinalPoints: `714000000000000`
- aliceClaimedLamports: `529778`
- bobClaimedLamports: `225155`
- totalRewardsIn: `754934`
- totalRewardsClaimed: `754933`
- walletSolSpent: `0.327918`
