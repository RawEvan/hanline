import assert from 'node:assert/strict'
import test from 'node:test'
import { cacheFileNames } from './catalog.ts'
import { cacheWriteCurrent, currentCacheEpoch, invalidateCacheWrites, removeCachedFiles, type CacheDirectory } from './cache.ts'

function missing(name: string): Error {
  const error = new Error(`missing ${name}`)
  error.name = 'NotFoundError'
  return error
}

test('removeCachedFiles deletes each saved model and skips names already gone', async () => {
  const removed: string[] = []
  const root: CacheDirectory = {
    async removeEntry(name: string) {
      if (name === 'asr-tokens.txt') throw missing(name)
      removed.push(name)
    },
  }
  await removeCachedFiles(['asr-encoder.int8.onnx', 'asr-tokens.txt', 'Qwen3.5-2B-Q4_K_M.gguf'], root)
  assert.deepEqual(removed, ['asr-encoder.int8.onnx', 'Qwen3.5-2B-Q4_K_M.gguf'])
})

test('removeCachedFiles surfaces a storage failure', async () => {
  const root: CacheDirectory = {
    async removeEntry() {
      const error = new Error('busy')
      error.name = 'InvalidStateError'
      throw error
    },
  }
  await assert.rejects(() => removeCachedFiles(['asr-encoder.int8.onnx'], root), /busy/)
})

test('a clear invalidates a write that already started', () => {
  const started = currentCacheEpoch()
  assert.equal(cacheWriteCurrent(started), true)
  invalidateCacheWrites()
  assert.equal(cacheWriteCurrent(started), false)
})

test('manual clear covers every saved model file and leaves the source choice alone', () => {
  const names = cacheFileNames()
  for (const name of [
    'asr-encoder.int8.onnx',
    'asr-decoder.int8.onnx',
    'asr-tokens.txt',
    'piper-en_US-lessac-medium.onnx',
    'piper-tokens.txt',
    'espeak-ng-data.tar.bz2',
    'Qwen3.5-0.8B-Q4_K_M.gguf',
    'Qwen3.5-2B-Q4_K_M.gguf',
  ]) {
    assert.equal(names.includes(name), true)
  }
  assert.equal(names.includes('hanline.mirror'), false)
  assert.equal(new Set(names).size, names.length)
})
