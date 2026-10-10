import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ArenaView } from '@/components/arena/ArenaView'
import type { ArenaMeta, ArenaSummary, BotNames } from '@/lib/arena'

export const metadata = { title: 'The Arena · Holdfast' }

const read = <T,>(f: string): T => JSON.parse(readFileSync(join(process.cwd(), 'data', 'arena', f), 'utf8'))

export default function ArenaPage() {
  return <ArenaView summary={read<ArenaSummary>('summary.json')} meta={read<ArenaMeta>('arena.json')} bots={read<BotNames>('bots.json')} />
}
