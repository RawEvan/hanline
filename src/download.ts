import type { WeightFile } from './catalog'
import { sha256Hex, type FileMap } from './archive'

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

async function readCached(file: WeightFile): Promise<Uint8Array | null> {
  if (!navigator.storage?.getDirectory) return null
  try {
    const root = await navigator.storage.getDirectory()
    const handle = await root.getFileHandle(file.file)
    const blob = await handle.getFile()
    if (file.bytes && blob.size !== file.bytes) return null
    const bytes = new Uint8Array(await blob.arrayBuffer())
    if (file.sha256 && (await sha256Hex(bytes.slice())) !== file.sha256) return null
    return bytes
  } catch {
    return null
  }
}

async function writeCached(file: WeightFile, bytes: Uint8Array): Promise<void> {
  if (!navigator.storage?.getDirectory) return
  try {
    const root = await navigator.storage.getDirectory()
    const handle = await root.getFileHandle(file.file, { create: true })
    const writable = await handle.createWritable()
    await writable.write(bytes.slice())
    await writable.close()
  } catch (error) {
    const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : ''
    if (name !== 'QuotaExceededError') throw error
  }
}

function downloadUrls(file: WeightFile): string[] {
  const urls: string[] = []
  if (import.meta.env.DEV) {
    urls.push(`/model-cache/${encodeURIComponent(file.file)}`)
  }
  if (file.url) urls.push(file.url)
  return urls
}

async function fetchBytes(url: string, file: WeightFile, onProgress: (ratio: number) => void): Promise<Uint8Array> {
  const response = await fetch(url)
  if (!response.ok || !response.body) throw new Error(`Download failed (${response.status || 0}).`)
  const total = file.bytes || Number(response.headers.get('content-length') || 0)
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  while (true) {
    const step = await reader.read()
    if (step.done) break
    chunks.push(step.value)
    received += step.value.length
    if (total) onProgress(Math.min(0.99, received / total))
  }
  return concat(chunks)
}

export async function loadWeight(
  file: WeightFile,
  onProgress: (ratio: number) => void,
): Promise<Uint8Array> {
  const cached = await readCached(file)
  if (cached) {
    onProgress(1)
    return cached
  }
  const urls = downloadUrls(file)
  if (!urls.length) throw new Error('No download URL for this model file.')
  let lastError: unknown
  for (const url of urls) {
    try {
      const bytes = await fetchBytes(url, file, onProgress)
      if (file.sha256 && (await sha256Hex(bytes.slice())) !== file.sha256) {
        throw new Error('Download did not match the published checksum.')
      }
      await writeCached(file, bytes)
      onProgress(1)
      return bytes
    } catch (error) {
      lastError = error
    }
  }
  const message = lastError instanceof Error ? lastError.message : String(lastError || '')
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    throw new Error(
      'Could not reach the model host. Open Hugging Face in this browser, or put the model files in .cache and restart npm run dev.',
    )
  }
  throw lastError instanceof Error ? lastError : new Error('Download failed.')
}

export async function loadFileMap(
  files: WeightFile[],
  onProgress: (ratio: number) => void,
): Promise<FileMap> {
  const total = files.reduce((sum, file) => sum + (file.bytes || 0), 0) || files.length
  let done = 0
  const out: FileMap = {}
  for (const file of files) {
    const before = done
    const bytes = await loadWeight(file, (ratio) => {
      const loaded = before + (file.bytes || 1) * ratio
      onProgress(Math.min(0.99, loaded / total))
    })
    out[file.mapPath] = bytes
    done += file.bytes || 1
    onProgress(Math.min(0.99, done / total))
  }
  onProgress(1)
  return out
}
