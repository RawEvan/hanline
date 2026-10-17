import type { WeightFile } from './catalog'
import { sha256Hex, type FileMap } from './archive'
import type { Transfer } from './progress'

export function isAbort(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'name' in error && (error as { name?: string }).name === 'AbortError')
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  const reason = signal.reason
  if (isAbort(reason)) throw reason
  throw new DOMException('Aborted', 'AbortError')
}

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

async function fetchBytes(
  url: string,
  file: WeightFile,
  onProgress: (transfer: Transfer) => void,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const planned = file.bytes || 0
  onProgress({ received: 0, total: planned, phase: 'download' })
  const response = await fetch(url, { signal })
  if (!response.ok || !response.body) throw new Error(`Download failed (${response.status || 0}).`)
  const total = file.bytes || Number(response.headers.get('content-length') || 0)
  onProgress({ received: 0, total, phase: 'download' })
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  while (true) {
    throwIfAborted(signal)
    const step = await reader.read()
    if (step.done) break
    chunks.push(step.value)
    received += step.value.length
    onProgress({ received, total: total || received, phase: 'download' })
  }
  return concat(chunks)
}

function hostHint(file: WeightFile): string {
  let host = ''
  try {
    host = new URL(file.url, 'https://hanline.local').host
  } catch {
    host = ''
  }
  if (host === 'www.modelscope.cn') return 'Could not reach the China mirror.'
  if (host === 'huggingface.co') return 'Could not reach Hugging Face.'
  return 'Could not download a file from this site.'
}

export async function loadWeight(
  file: WeightFile,
  onProgress: (transfer: Transfer) => void,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  throwIfAborted(signal)
  const cached = await readCached(file)
  if (cached) {
    onProgress({ received: file.bytes || cached.length, total: file.bytes || cached.length, phase: 'download' })
    return cached
  }
  const urls = downloadUrls(file)
  if (!urls.length) throw new Error('No download URL for this model file.')
  let lastError: unknown
  for (const url of urls) {
    try {
      throwIfAborted(signal)
      const bytes = await fetchBytes(url, file, onProgress, signal)
      const total = file.bytes || bytes.length
      onProgress({ received: total, total, phase: 'check' })
      await new Promise((resolve) => setTimeout(resolve, 0))
      throwIfAborted(signal)
      if (file.sha256 && (await sha256Hex(bytes.slice())) !== file.sha256) {
        throw new Error('Download did not match the published checksum.')
      }
      throwIfAborted(signal)
      onProgress({ received: total, total, phase: 'save' })
      await writeCached(file, bytes)
      onProgress({ received: total, total, phase: 'download' })
      return bytes
    } catch (error) {
      if (isAbort(error)) throw error
      lastError = error
    }
  }
  const message = lastError instanceof Error ? lastError.message : String(lastError || '')
  if (/failed to fetch|networkerror|load failed/i.test(message)) throw new Error(hostHint(file))
  throw lastError instanceof Error ? lastError : new Error('Download failed.')
}

export async function loadFileMap(
  files: WeightFile[],
  onProgress: (transfer: Transfer) => void,
  signal?: AbortSignal,
): Promise<FileMap> {
  const total = files.reduce((sum, file) => sum + (file.bytes || 0), 0) || 1
  let done = 0
  const out: FileMap = {}
  for (const file of files) {
    const before = done
    const bytes = await loadWeight(
      file,
      (transfer) => {
        const current = transfer.phase === 'download' ? transfer.received : file.bytes || transfer.received
        onProgress({ received: before + current, total, phase: transfer.phase })
      },
      signal,
    )
    out[file.mapPath] = bytes
    done += file.bytes || bytes.length
    onProgress({ received: Math.min(done, total), total, phase: 'download' })
  }
  onProgress({ received: total, total, phase: 'download' })
  return out
}
