/**
 * Phase 6 security regressions. A caller chooses the extra accounts of a hooked transfer, so a forged
 * holder record (an empty account, someone else's record, a different launch) must never be accepted
 * in place of the real one: that would skip the snipe-lock or the forfeiture.
 *
 * Token-2022 already enforces this: it re-resolves the hook's ExtraAccountMetaList against the real
 * source and destination and rejects any mismatch with spl-tlv-account-resolution's IncorrectAccount
 * (0xa261c2c0) BEFORE the Holdfast program runs. These tests pin that behaviour for every forgery we
 * can think of, so a runtime change can't silently open the hole.
 */
import { assert } from 'chai'
import { Keypair, PublicKey } from '@solana/web3.js'
import {
  ExtensionType, TOKEN_2022_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, createInitializeAccount3Instruction,
  createTransferCheckedInstruction, getAccountLen,
} from '@solana/spl-token'
import { SystemProgram } from '@solana/web3.js'
import * as sdk from '@holdfast/sdk'
import { TestLaunch, ata, balanceOf, buy, conn, createLaunch, expectError, fetchHolder, newActor, registerIxs, send, waitUntil, fetchLaunch } from './helpers'

/** A hooked transferChecked whose hook accounts we control: `forge` may replace any of the five. */
async function forgedTransfer(
  l: TestLaunch, from: Keypair, to: PublicKey, amount: bigint,
  forge: Partial<{ launch: PublicKey; src: PublicKey; dst: PublicKey; metas: PublicKey }>,
) {
  const src = ata(l.mint, from.publicKey)
  const dst = ata(l.mint, to)
  const ix = createTransferCheckedInstruction(src, l.mint, dst, from.publicKey, amount, 6, [], TOKEN_2022_PROGRAM_ID)
  const real = sdk.hookAccounts(l.mint, src, dst)
  const keys = [
    forge.launch ?? real[0].pubkey, forge.src ?? real[1].pubkey, forge.dst ?? real[2].pubkey, real[3].pubkey, forge.metas ?? real[4].pubkey,
  ]
  keys.forEach((pubkey, i) => ix.keys.push({ ...real[i], pubkey }))
  return send([createAssociatedTokenAccountIdempotentInstruction(from.publicKey, dst, to, l.mint, TOKEN_2022_PROGRAM_ID), ix], [from])
}

async function expectMessage(fn: () => Promise<unknown>, re: RegExp) {
  try {
    await fn()
  } catch (e) {
    const text = String((e as Error).message) + ((e as { transactionLogs?: string[] }).transactionLogs ?? []).join('\n')
    if (!re.test(text)) throw new Error(`expected ${re}, got: ${text.slice(0, 300)}`)
    return
  }
  throw new Error(`expected ${re}, but the transaction succeeded`)
}

describe('security: forged hook accounts are rejected', function () {
  this.timeout(600_000)
  const nobody = () => Keypair.generate().publicKey
  /** the transfer is refused by Token-2022's account check */
  const incorrectAccount = (fn: () => Promise<unknown>) => expectMessage(fn, /0xa261c2c0|IncorrectAccount/i)

  describe('inside the opening window', () => {
    let l: TestLaunch
    let sniper: Keypair, friend: Keypair

    before(async () => {
      ;[sniper, friend] = await Promise.all([newActor(), newActor()])
      l = await createLaunch({ windowSecs: 40, snipeLockSecs: 120, maxWalletBps: 0 })
      await send(await Promise.all(registerIxs(l.mint, friend.publicKey)), [friend])
      await buy(l, sniper, 0.01, { register: true })
    })

    it('control: an honest transfer out of the snipe-lock is refused', async () => {
      await expectError(() => forgedTransfer(l, sniper, friend.publicKey, 1n, {}), 'SnipeLocked')
    })

    it('an empty account in place of the sender’s record cannot skip the snipe-lock', async () => {
      await incorrectAccount(() => forgedTransfer(l, sniper, friend.publicKey, 1n, { src: nobody() }))
    })

    it('another holder’s record cannot stand in for the sender’s', async () => {
      const wrong = sdk.holderPda(ata(l.mint, friend.publicKey))
      await incorrectAccount(() => forgedTransfer(l, sniper, friend.publicKey, 1n, { src: wrong }))
    })

    it('a forged receiver record cannot dodge registration or credit someone else', async () => {
      await incorrectAccount(() => forgedTransfer(l, sniper, friend.publicKey, 1n, { dst: nobody() }))
    })

    it('a forged meta list, an empty launch, or another launch’s account is refused', async () => {
      // without the real meta list the hook can't even be invoked (Anchor AccountNotEnoughKeys, 0xbbd)
      await expectMessage(() => forgedTransfer(l, sniper, friend.publicKey, 1n, { metas: nobody() }), /0xbbd|0xa261c2c0|IncorrectAccount/i)
      await incorrectAccount(() => forgedTransfer(l, sniper, friend.publicKey, 1n, { launch: nobody() }))
      const other = await createLaunch({ windowSecs: 0, snipeLockSecs: 0, maxWalletBps: 0 })
      await incorrectAccount(() => forgedTransfer(l, sniper, friend.publicKey, 1n, { launch: other.launch }))
    })

    it('the sniper’s record is untouched by all of the above', async () => {
      const h = (await fetchHolder(l.mint, sniper.publicKey))!
      assert.equal(BigInt(h.trackedBalance.toString()), await balanceOf(l.mint, sniper.publicKey))
    })
  })

  describe('after the window: forfeiture cannot be dodged', () => {
    let l: TestLaunch
    let holder: Keypair, other: Keypair

    before(async () => {
      ;[holder, other] = await Promise.all([newActor(), newActor()])
      l = await createLaunch({ windowSecs: 0, snipeLockSecs: 0, maxWalletBps: 0 })
      await buy(l, holder, 0.02, { register: true })
      await send(await Promise.all(registerIxs(l.mint, other.publicKey)), [other])
      await waitUntil((await fetchLaunch(l.mint)).launchTs.toNumber() + 2)
    })

    it('moving tokens out with a forged sender record is refused (otherwise points would outlive the tokens)', async () => {
      const bal = await balanceOf(l.mint, holder.publicKey)
      await incorrectAccount(() => forgedTransfer(l, holder, other.publicKey, bal / 2n, { src: nobody() }))
      assert.equal(await balanceOf(l.mint, holder.publicKey), bal)
    })

    it('the honest transfer still works and forfeits proportionally', async () => {
      const before = (await fetchHolder(l.mint, holder.publicKey))!
      const bal = await balanceOf(l.mint, holder.publicKey)
      await forgedTransfer(l, holder, other.publicKey, bal / 2n, {})
      const after = (await fetchHolder(l.mint, holder.publicKey))!
      assert.equal(BigInt(after.trackedBalance.toString()), bal - bal / 2n)
      assert.isTrue(BigInt(after.points.toString()) < BigInt(before.points.toString()) + bal * 10n, 'half the points were forfeited')
    })
  })

  describe('after the window: a second account of your own is not a hiding place', () => {
    let l: TestLaunch
    let holder: Keypair

    before(async () => {
      holder = await newActor()
      l = await createLaunch({ windowSecs: 0, snipeLockSecs: 0, maxWalletBps: 0 })
      await buy(l, holder, 0.02, { register: true })
      await waitUntil((await fetchLaunch(l.mint)).launchTs.toNumber() + 3)
    })

    it('moving the bag to another (unregistered) account you own forfeits the points like any transfer', async () => {
      // a plain, non-ATA Token-2022 account with the same owner
      const side = Keypair.generate()
      const space = getAccountLen([ExtensionType.TransferHookAccount, ExtensionType.ImmutableOwner])
      await send([
        SystemProgram.createAccount({
          fromPubkey: holder.publicKey, newAccountPubkey: side.publicKey, space,
          lamports: await conn.getMinimumBalanceForRentExemption(space), programId: TOKEN_2022_PROGRAM_ID,
        }),
        createInitializeAccount3Instruction(side.publicKey, l.mint, holder.publicKey, TOKEN_2022_PROGRAM_ID),
      ], [holder, side])

      const bal = await balanceOf(l.mint, holder.publicKey)
      const src = ata(l.mint, holder.publicKey)
      const ix = createTransferCheckedInstruction(src, l.mint, side.publicKey, holder.publicKey, bal, 6, [], TOKEN_2022_PROGRAM_ID)
      ix.keys.push(...sdk.hookAccounts(l.mint, src, side.publicKey))
      await send([ix], [holder])

      const after = (await fetchHolder(l.mint, holder.publicKey))!
      assert.equal(BigInt(after.trackedBalance.toString()), 0n)
      assert.equal(BigInt(after.points.toString()), 0n, 'points must not outlive the tokens (else: hide the bag, sell it, keep the score)')
    })
  })
})
