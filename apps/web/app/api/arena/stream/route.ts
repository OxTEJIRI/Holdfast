/**
 * Server-sent events for /arena.
 *   ?speed=N   replay the recorded devnet run N× faster (default 8)
 *   ?live=1    tail a running simulation's sim/out/events.jsonl (local development)
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RECORDED = join(process.cwd(), 'data', 'arena', 'events.jsonl')
const LIVE = process.env.ARENA_LIVE_FILE ?? join(process.cwd(), '..', '..', 'sim', 'out', 'events.jsonl')

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const id = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(id)
      resolve()
    })
  })

export async function GET(req: Request) {
  const url = new URL(req.url)
  const speed = Math.min(120, Math.max(0.5, Number(url.searchParams.get('speed') ?? 8)))
  const live = url.searchParams.get('live') === '1' && existsSync(LIVE)
  const enc = new TextEncoder()
  const signal = req.signal

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string, event?: string) => controller.enqueue(enc.encode(`${event ? `event: ${event}\n` : ''}data: ${data}\n\n`))
      try {
        if (live) {
          // tail: emit lines as the simulation appends them
          let offset = 0
          send(JSON.stringify({ mode: 'live' }), 'hello')
          while (!signal.aborted) {
            const size = statSync(LIVE).size
            if (size < offset) offset = 0 // a new run truncated the file
            if (size > offset) {
              const chunk = readFileSync(LIVE, 'utf8').slice(offset)
              offset = size
              for (const line of chunk.split('\n')) if (line.trim()) send(line)
            }
            await sleep(1000, signal)
          }
        } else {
          const lines = readFileSync(RECORDED, 'utf8').split('\n').filter((l) => l.trim())
          send(JSON.stringify({ mode: 'replay', speed, total: lines.length }), 'hello')
          let prev = 0
          for (const line of lines) {
            if (signal.aborted) break
            const t = (JSON.parse(line) as { t: number }).t
            // long quiet stretches (e.g. waiting out the locks) are compressed further
            await sleep(Math.min(4000, ((t - prev) * 1000) / speed), signal)
            prev = t
            send(line)
          }
          send('{}', 'done')
        }
      } catch (e) {
        send(JSON.stringify({ error: String(e) }), 'error')
      } finally {
        controller.close()
      }
    },
  })
  return new Response(stream, {
    headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' },
  })
}
