import assert from 'node:assert/strict'
import test from 'node:test'
import { ASR_FILES, ESPEAK_PACK, PIPER_FILES, TRANSLATE_MODELS, weightUrls } from './catalog.ts'
import { applyMirror, readMirror } from './mirror.ts'

test('china source uses the ModelScope file and keeps the international url untouched', () => {
  const original = ASR_FILES[0].url
  const china = applyMirror(ASR_FILES[0], 'china')
  assert.equal(china.url.startsWith('https://www.modelscope.cn/models/pengzhendong/'), true)
  assert.equal(china.url.endsWith('/encoder.int8.onnx'), true)
  assert.equal(china.url.includes('huggingface.co'), false)
  assert.equal(ASR_FILES[0].url, original)
  assert.equal(applyMirror(ASR_FILES[0], 'international').url, original)
})

test('translation china urls are the matching ModelScope files', () => {
  for (const model of TRANSLATE_MODELS) {
    const china = applyMirror(model, 'china')
    assert.equal(china.url.startsWith('https://www.modelscope.cn/models/unsloth/'), true)
    assert.equal(china.url.endsWith(`/${model.file}`), true)
    assert.equal(china.sha256, model.sha256)
  }
})

test('china source does not invent a host for the english voice', () => {
  assert.throws(() => applyMirror(PIPER_FILES[0], 'china'), /China mirror/)
  assert.equal(PIPER_FILES[0].cn, undefined)
  const espeak = applyMirror({ ...ESPEAK_PACK, url: '/hanline/espeak-ng-data.tar.bz2' }, 'china')
  assert.equal(espeak.url, '/hanline/espeak-ng-data.tar.bz2')
})

test('stored mirror value is only the china choice or international', () => {
  assert.equal(readMirror('china'), 'china')
  assert.equal(readMirror('international'), 'international')
  assert.equal(readMirror(null), 'international')
  assert.equal(readMirror('hf-mirror'), 'international')
})

test('published urls stay on the two allowed hosts', () => {
  for (const url of weightUrls()) {
    assert.equal(url.includes('hf-mirror.com'), false)
    const host = new URL(url).host
    assert.equal(host === 'huggingface.co' || host === 'www.modelscope.cn', true)
  }
})
