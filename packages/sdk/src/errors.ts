/** Turns program/transaction errors into the human-readable text the UI shows (DESIGN.md §5.5). */
import { IDL } from './program'

const FRIENDLY: Record<string, string> = {
  SnipeLocked: 'Snipe-locked: tokens bought in the opening window can’t move until the lock ends.',
  RecipientNotRegistered: 'During the opening window tokens can only go to registered wallets. Register first (buying through Holdfast does it for you).',
  MaxWalletExceeded: 'During the opening window no wallet may hold more than the max-wallet limit. Buy less, or wait for the window to end.',
  ParamOutOfBounds: 'A launch parameter is outside the allowed range.',
  WrongHookProgram: 'This token isn’t a Holdfast launch.',
  NotTransferring: 'The Holdfast hook can only run inside a token transfer.',
  NotFinalized: 'Rewards open once the launch graduates and is finalized.',
  AlreadyFinalized: 'This launch is already finalized.',
  CurveNotComplete: 'The bonding curve hasn’t completed yet.',
  MathOverflow: 'Math overflow.',
  NothingToClaim: 'Nothing to claim right now.',
  InvalidDbcAccount: 'That isn’t the Meteora pool for this token (or you aren’t its creator).',
  MintAuthorityNotRevoked: 'The token must have a fixed supply.',
  TradingClosed: 'The bonding phase is over; registration is closed.',
  WrongFeeMode: 'That action isn’t available in this launch’s fee mode.',
}

const byCode = new Map<number, string>(IDL.errors.map((e) => [e.code, e.name]))

function logsOf(err: unknown): string[] {
  const e = err as { logs?: string[]; transactionLogs?: string[]; getLogs?: unknown }
  return e?.transactionLogs ?? e?.logs ?? []
}

/** Name of the Holdfast error in `err`, if any. */
export function holdfastErrorName(err: unknown): string | undefined {
  const text = [...logsOf(err), String((err as Error)?.message ?? err)].join('\n')
  const named = text.match(/Error Code: (\w+)\./)
  if (named && named[1] in FRIENDLY) return named[1]
  const hex = text.match(/custom program error: 0x([0-9a-f]+)/i)
  if (hex) return byCode.get(parseInt(hex[1], 16))
  return undefined
}

/** Maps any error from a Holdfast flow to a sentence for the user. */
export function explainError(err: unknown, opts: { timeZone?: string } = {}): string {
  const name = holdfastErrorName(err)
  const logs = logsOf(err)
  if (name === 'SnipeLocked') {
    const unlock = logs.join('\n').match(/unlocks at unix (\d+)/)
    if (unlock) {
      const t = new Date(Number(unlock[1]) * 1000).toLocaleTimeString('en-GB', { hour12: false, timeZone: opts.timeZone })
      return `Snipe-locked until ${t}`
    }
  }
  if (name) return FRIENDLY[name]
  const text = [...logs, String((err as Error)?.message ?? err)].join('\n')
  if (/insufficient lamports|insufficient funds|0x1\b/i.test(text)) return 'Not enough SOL for this transaction.'
  if (/ExceededSlippage|exceeds desired slippage|slippage/i.test(text)) return 'Price moved too much: try again or raise slippage.'
  if (/User rejected|rejected the request/i.test(text)) return 'Transaction cancelled in the wallet.'
  if (/blockhash not found|block height exceeded/i.test(text)) return 'The network was slow and the transaction expired: please retry.'
  return String((err as Error)?.message ?? err).split('\n')[0]
}
