/** Offline SDK tests (no validator): presets, validation, conviction views, error mapping. */
import { assert } from 'chai'
import { Keypair, PublicKey } from '@solana/web3.js'
import { validateConfigParameters } from '@meteora-ag/dynamic-bonding-curve-sdk'
import BN from 'bn.js'
import {
  HOLDFAST_PROGRAM_ID, type HolderAccount, type LaunchAccount, buildHoldfastConfig, claimable, explainError, forfeitPreview,
  holdfastErrorName, pointsAt, presets, projectedShare, resolvePreset, totalPointsAt,
} from '../src'

describe('presets → DBC config', () => {
  for (const id of Object.keys(presets) as (keyof typeof presets)[]) {
    for (const network of ['mainnet', 'devnet'] as const) {
      it(`${id} (${network}) passes the DBC SDK's own config validation`, () => {
        const config = buildHoldfastConfig(id, {}, { network })
        validateConfigParameters(
          { ...config, leftoverReceiver: Keypair.generate().publicKey },
          { isTransferHook: true, transferHookProgram: HOLDFAST_PROGRAM_ID },
        )
        const threshold = Number(config.migrationQuoteThreshold.toString()) / 1e9
        const want = network === 'mainnet' ? presets[id].thresholdSol.mainnet : presets[id].thresholdSol.devnet
        assert.closeTo(threshold, want, want * 0.02, 'graduation threshold matches the preset')
        assert.equal(config.tokenType, 1, 'Token-2022')
        assert.equal(config.tokenUpdateAuthority, 1, 'Immutable')
        assert.equal(config.collectFeeMode, 0, 'fees in the quote token')
        assert.equal(config.creatorTradingFeePercentage, 0)
        assert.equal(config.migratedPoolFee.collectFeeMode, 2, 'Compounding DAMM v2 pool')
      })
    }
  }

  it('rejects rules beyond the program caps and bad splits, with readable messages', () => {
    assert.throws(() => resolvePreset('arena', { rules: { windowSecs: 601 } }), /Opening window/)
    assert.throws(() => resolvePreset('arena', { rules: { snipeLockSecs: 1801 } }), /Snipe-lock/)
    assert.throws(() => resolvePreset('arena', { rules: { maxWalletBps: 49 } }), /Max wallet/)
    assert.throws(() => resolvePreset('arena', { split: { holders: 40, creator: 50, treasury: 10 } }), /at least 50%/)
    assert.throws(() => resolvePreset('arena', { split: { holders: 60, creator: 30, treasury: 5 } }), /100%/)
    assert.doesNotThrow(() => resolvePreset('arena', { rules: { maxWalletBps: 0 } }))
  })
})

describe('conviction views', () => {
  const launch = {
    totalPoints: new BN(1_000), totalTracked: new BN(30), globalLastTs: new BN(100),
    finalized: false, finalTs: new BN(0), finalTotalPoints: new BN(0), accRewardPerPoint: new BN(0),
  } as unknown as LaunchAccount
  const holder = {
    points: new BN(400), trackedBalance: new BN(20), lastTs: new BN(90), rewardDebt: new BN(0),
  } as unknown as HolderAccount

  it('accrues lazily like the program', () => {
    assert.equal(pointsAt(holder, 110), 400n + 20n * 20n)
    assert.equal(totalPointsAt(launch, 110), 1_000n + 30n * 10n)
    assert.closeTo(projectedShare(holder, launch, 110), 800 / 1300, 1e-9)
  })

  it('forfeit preview: selling 25% of the bag costs 25% of the points', () => {
    assert.equal(forfeitPreview(holder, 5n, 110), 200n)
    assert.equal(forfeitPreview(holder, 999n, 110), 800n)
  })

  it('claimable = floor(final_points × acc / 2^64) − debt, once finalized', () => {
    assert.equal(claimable(holder, launch), 0n)
    const fin = { ...launch, finalized: true, finalTs: new BN(110), finalTotalPoints: new BN(1_300), accRewardPerPoint: new BN((1000n << 64n) / 1300n).add(new BN(0)) } as unknown as LaunchAccount
    const expected = (800n * ((1000n << 64n) / 1300n)) >> 64n
    assert.equal(claimable(holder, fin), expected)
    assert.equal(claimable({ ...holder, rewardDebt: new BN(expected.toString()) } as unknown as HolderAccount, fin), 0n)
  })
})

describe('explainError', () => {
  it('turns SnipeLocked logs into "Snipe-locked until HH:MM:SS"', () => {
    const err = {
      message: 'Simulation failed',
      transactionLogs: [
        'Program log: SnipeLocked: unlocks at unix 1791565669',
        'Program log: AnchorError thrown in programs/holdfast/src/hook.rs:157. Error Code: SnipeLocked. Error Number: 6000.',
      ],
    }
    assert.equal(holdfastErrorName(err), 'SnipeLocked')
    assert.match(explainError(err, { timeZone: 'UTC' }), /^Snipe-locked until \d\d:\d\d:\d\d$/)
  })

  it('maps raw custom error codes via the IDL', () => {
    assert.equal(holdfastErrorName(new Error('failed: custom program error: 0x1771')), 'RecipientNotRegistered')
    assert.match(explainError(new Error('custom program error: 0x1772')), /max-wallet/)
  })

  it('falls back to common wallet / network errors', () => {
    assert.equal(explainError(new Error('User rejected the request.')), 'Transaction cancelled in the wallet.')
    assert.match(explainError(new Error('Transfer: insufficient lamports 5, need 10')), /Not enough SOL/)
    assert.isTrue(new PublicKey(HOLDFAST_PROGRAM_ID).equals(HOLDFAST_PROGRAM_ID))
  })
})
