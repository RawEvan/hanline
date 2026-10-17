import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ASR_FILES,
  ESPEAK_PACK,
  PIPER_FILES,
  QWEN_2B_ID,
  TRANSLATE_MODELS,
  allowedWeightHost,
  translateModel,
  weightUrls,
} from './catalog.ts'

test('weight urls are Hugging Face files browsers can fetch', () => {
  assert.equal(
    ASR_FILES[0].url,
    'https://huggingface.co/csukuangfj/sherpa-onnx-streaming-paraformer-bilingual-zh-en/resolve/main/encoder.int8.onnx',
  )
  assert.equal(
    PIPER_FILES[0].url,
    'https://huggingface.co/csukuangfj/vits-piper-en_US-lessac-medium/resolve/main/en_US-lessac-medium.onnx',
  )
  assert.equal(
    translateModel('qwen35-08b').url,
    'https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/resolve/main/Qwen3.5-0.8B-Q4_K_M.gguf',
  )
  assert.equal(
    translateModel(QWEN_2B_ID).url,
    'https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/main/Qwen3.5-2B-Q4_K_M.gguf',
  )
  for (const url of weightUrls()) {
    assert.equal(allowedWeightHost(url), true)
  }
  assert.equal(ESPEAK_PACK.url, '')
  assert.equal(ESPEAK_PACK.file, 'espeak-ng-data.tar.bz2')
})

test('2B entry is the text file only', () => {
  const model = translateModel(QWEN_2B_ID)
  assert.equal(model.file.includes('mmproj'), false)
  assert.equal(JSON.stringify(TRANSLATE_MODELS).includes('mmproj'), false)
})

test('cache keys stay unique across packs', () => {
  const names = [...ASR_FILES, ...PIPER_FILES, ESPEAK_PACK, ...TRANSLATE_MODELS].map((row) => row.file)
  assert.equal(new Set(names).size, names.length)
})
