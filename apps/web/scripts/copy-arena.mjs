// Copies the recorded devnet Arena run (docs/arena/devnet) into the app, so it ships with the deploy.
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const src = join(here, '..', '..', '..', 'docs', 'arena', 'devnet')
const dest = join(here, '..', 'data', 'arena')
if (existsSync(src)) {
  mkdirSync(dest, { recursive: true })
  for (const f of ['events.jsonl', 'summary.json', 'arena.json', 'bots.json']) cpSync(join(src, f), join(dest, f))
  console.log('copied Arena run →', dest)
} else if (!existsSync(join(dest, 'events.jsonl'))) {
  throw new Error(`no Arena run at ${src}`)
}
