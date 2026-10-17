import { createHash } from 'node:crypto'
import { createWriteStream, mkdirSync, statSync, existsSync, copyFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pipeline } from 'node:stream/promises'
import { Readable, Transform } from 'node:stream'
import { createReadStream } from 'node:fs'
import {
  ASR_FILES,
  ESPEAK_PACK,
  PIPER_FILES,
  TRANSLATE_MODELS,
} from '../src/catalog.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cache = join(root, '.cache')
const publicDir = join(root, 'public')
mkdirSync(cache, { recursive: true })

const files = [
  ...ASR_FILES,
  ...PIPER_FILES,
  ...TRANSLATE_MODELS.filter((row) => row.id === 'qwen35-08b'),
]

async function download(item) {
  const dest = join(cache, item.file)
  let have = existsSync(dest) ? statSync(dest).size : 0
  if (have && (!item.bytes || have === item.bytes)) {
    console.log('have', item.file, have)
    return dest
  }
  if (item.bytes && have > item.bytes) have = 0
  const headers = {}
  if (have) headers.Range = `bytes=${have}-`
  console.log('get', item.url, have ? `from ${have}` : '')
  const res = await fetch(item.url, { redirect: 'follow', headers })
  if (have && res.status === 200) have = 0
  if (!res.ok || !res.body) throw new Error(`${item.file} HTTP ${res.status}`)
  const total = have + Number(res.headers.get('content-length') || 0)
  let got = have
  let mark = have
  const counter = new Transform({
    transform(chunk, _enc, cb) {
      got += chunk.length
      if (got - mark >= 50 * 1024 * 1024) {
        mark = got
        console.log(item.file, Math.round(got / 1024 / 1024), 'MB', total ? `of ${Math.round(total / 1024 / 1024)}` : '')
      }
      cb(null, chunk)
    },
  })
  await pipeline(Readable.fromWeb(res.body), counter, createWriteStream(dest, { flags: have ? 'a' : 'w' }))
  console.log('saved', item.file, statSync(dest).size)
  return dest
}

function hashFile(path) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const input = createReadStream(path)
    input.on('data', (chunk) => hash.update(chunk))
    input.on('error', reject)
    input.on('end', () => resolve(hash.digest('hex')))
  })
}

for (const item of files) {
  let dest = ''
  let lastError = null
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      dest = await download(item)
      lastError = null
      break
    } catch (err) {
      lastError = err
      console.log('retry', item.file, attempt, err instanceof Error ? err.message : err)
    }
  }
  if (!dest || lastError) throw lastError
  const sha = await hashFile(dest)
  const size = statSync(dest).size
  console.log(JSON.stringify({ name: item.file, bytes: size, sha256: sha }))
  if (item.sha256 && sha !== item.sha256) {
    throw new Error(`${item.file} sha mismatch ${sha}`)
  }
}

const espeakPublic = join(publicDir, ESPEAK_PACK.file)
const espeakCache = join(cache, ESPEAK_PACK.file)
if (!existsSync(espeakPublic)) {
  throw new Error(`Missing ${espeakPublic}. Keep the same-origin espeak archive in public/.`)
}
copyFileSync(espeakPublic, espeakCache)
const espeakSha = await hashFile(espeakCache)
if (espeakSha !== ESPEAK_PACK.sha256) {
  throw new Error(`${ESPEAK_PACK.file} sha mismatch ${espeakSha}`)
}
console.log(JSON.stringify({ name: ESPEAK_PACK.file, bytes: statSync(espeakCache).size, sha256: espeakSha }))
