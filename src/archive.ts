import Bunzip from 'seek-bzip'

export type FileMap = Record<string, Uint8Array>

function readOctal(bytes: Uint8Array, start: number, len: number): number {
  let text = ''
  for (let i = 0; i < len; i++) {
    const c = bytes[start + i]
    if (!c || c === 0 || c === 32) continue
    text += String.fromCharCode(c)
  }
  const n = Number.parseInt(text.trim(), 8)
  return Number.isFinite(n) ? n : 0
}

function readCString(bytes: Uint8Array, start: number, len: number): string {
  let end = start
  const last = start + len
  while (end < last && bytes[end]) end += 1
  return new TextDecoder().decode(bytes.subarray(start, end))
}

export function extractTarBz2(archive: Uint8Array): FileMap {
  const decoded = Bunzip.decode(archive)
  if (!decoded) throw new Error('Could not unpack the archive.')
  const tar = decoded instanceof Uint8Array ? decoded : new Uint8Array(decoded)
  const out: FileMap = {}
  let offset = 0
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512)
    const name = readCString(header, 0, 100)
    if (!name) break
    const size = readOctal(header, 124, 12)
    const type = header[156]
    offset += 512
    const prefix = readCString(header, 345, 155)
    const path = prefix ? `${prefix}/${name}` : name
    if (type === 0 || type === 48) {
      out[path.replace(/^\.\//, '')] = tar.slice(offset, offset + size)
    }
    offset += Math.ceil(size / 512) * 512
  }
  return out
}

export async function sha256Hex(bytes: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function baseName(path: string): string {
  const parts = path.split(/[/\\]/)
  return parts[parts.length - 1] || path
}

function findNamed(files: FileMap, names: string[]): string {
  const keys = Object.keys(files)
  for (const want of names) {
    const hit = keys.find((key) => baseName(key) === want)
    if (hit) return hit
  }
  return ''
}

export type AsrPaths = { encoder: string; decoder: string; tokens: string }
export type TtsPaths = { model: string; tokens: string; dataDir: string }

export function resolveAsrPaths(files: FileMap): AsrPaths {
  const encoder = findNamed(files, ['encoder.int8.onnx', 'encoder.onnx'])
  const decoder = findNamed(files, ['decoder.int8.onnx', 'decoder.onnx'])
  const tokens = findNamed(files, ['tokens.txt'])
  if (!encoder || !decoder || !tokens) throw new Error('The dictation archive is missing model files.')
  return { encoder, decoder, tokens }
}

export function resolveTtsPaths(files: FileMap): TtsPaths {
  const model = findNamed(files, ['en_US-lessac-medium.onnx', 'model.onnx'])
  const tokens = findNamed(files, ['tokens.txt'])
  const phontab = Object.keys(files).find((key) => key.includes('espeak-ng-data/phontab'))
  if (!model || !tokens || !phontab) throw new Error('The English voice archive is missing model files.')
  const dataDir = phontab.slice(0, phontab.indexOf('espeak-ng-data') + 'espeak-ng-data'.length)
  return { model, tokens, dataDir }
}
