import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const dist = join(root, 'dist')
const base = process.env.BASE_PATH || '/hanline/'
const required = [
  'index.html',
  'engine-worker.js',
  'sw.js',
  'manifest.webmanifest',
  'favicon.svg',
  'espeak-ng-data.tar.bz2',
  'vendor/wllama.wasm',
  'vendor/sherpa-onnx-wasm-nodejs.wasm',
  'vendor/sherpa-onnx-wasm-nodejs.js',
  'vendor/sherpa-onnx-asr.js',
  'vendor/sherpa-onnx-tts.js',
]

if (!existsSync(dist)) {
  console.error('dist/ is missing. Run BASE_PATH=/hanline/ npm run build first.')
  process.exit(1)
}

const missing = required.filter((name) => !existsSync(join(dist, name)))
if (missing.length) {
  console.error('Pages dist is missing files:\n' + missing.join('\n'))
  process.exit(1)
}

const index = readFileSync(join(dist, 'index.html'), 'utf8')
if (!index.includes(base) && base !== '/') {
  console.error(`dist/index.html does not reference base ${base}`)
  process.exit(1)
}
if (index.includes('src="/src/') || index.includes('href="/src/')) {
  console.error('dist/index.html still points at /src/ (dev-only paths)')
  process.exit(1)
}

const worker = readFileSync(join(dist, 'engine-worker.js'), 'utf8')
if (worker.includes("importScripts(\n  '/vendor/") || worker.includes("fetch('/vendor/")) {
  console.error('engine-worker.js still uses root-absolute /vendor/ paths')
  process.exit(1)
}
if (!worker.includes("new URL('vendor/'")) {
  console.error('engine-worker.js is missing relative vendor URL resolution')
  process.exit(1)
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else out.push(path)
  }
  return out
}

const assets = walk(join(dist, 'assets')).map((path) => readFileSync(path, 'utf8')).join('\n')
const rootedVendor = assets.match(/(?:["'])\/vendor\/[^"']+/g) || []
if (rootedVendor.length) {
  console.error('Built JS still references root /vendor/ paths:\n' + rootedVendor.join('\n'))
  process.exit(1)
}
const expectedVendor = `${base}vendor/wllama.wasm`.replace(/\/+/g, '/')
if (!assets.includes(`${base}vendor/wllama`) && !assets.includes('vendor/wllama')) {
  console.error(`Built JS does not reference wllama under ${base}`)
  process.exit(1)
}
void expectedVendor

console.log('pages dist ok', { base, files: required.length })
