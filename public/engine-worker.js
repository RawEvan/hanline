/* Hanline speech worker. Engine scripts come from the sherpa-onnx npm package. */
'use strict'

const vendorBase = new URL('vendor/', self.location.href)

function vendorUrl(name) {
  return new URL(name, vendorBase).href
}

self.postMessage({ type: 'trace', message: 'Speech worker started.' })
self.process = { type: 'renderer', versions: {} }
try {
  importScripts(
    vendorUrl('sherpa-onnx-wasm-nodejs.js') + '?hanline=7',
    vendorUrl('sherpa-onnx-asr.js') + '?hanline=1',
    vendorUrl('sherpa-onnx-tts.js') + '?hanline=1',
  )
} catch (err) {
  self.postMessage({ type: 'error', message: err && err.message ? err.message : String(err) })
  throw err
}
self.postMessage({ type: 'trace', message: 'Speech scripts loaded.' })

let engine = null
let recognizer = null
let stream = null
let tts = null

function post(message, transfer) {
  self.postMessage(message, transfer || [])
}

function errorText(err) {
  if (!err) return 'Speech engine failed.'
  if (typeof err === 'string') return err
  if (err.message || err.stack) return [err.message, err.stack].filter(Boolean).join('\n')
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

function mkdirDeep(path) {
  const parts = path.split('/').filter(Boolean)
  let cur = ''
  for (const part of parts) {
    cur += '/' + part
    try {
      engine.FS.mkdir(cur)
    } catch {
      /* already there */
    }
  }
}

function writeFiles(files) {
  for (const [rel, bytes] of Object.entries(files)) {
    const path = '/' + String(rel).replace(/^\/+/, '')
    const dir = path.slice(0, path.lastIndexOf('/'))
    if (dir) mkdirDeep(dir)
    engine.FS.writeFile(path, new Uint8Array(bytes))
  }
}

function resultText() {
  if (!recognizer || !stream) return ''
  const result = recognizer.getResult(stream)
  return String((result && result.text) || '').trim()
}

function drainReady() {
  while (recognizer.isReady(stream)) recognizer.decode(stream)
}

async function boot() {
  const response = await fetch(vendorUrl('sherpa-onnx-wasm-nodejs.wasm'))
  if (!response.ok) throw new Error('Could not load the speech engine.')
  const wasmBinary = await response.arrayBuffer()
  const factory = self.Module
  if (typeof factory !== 'function') throw new Error('Speech engine factory is missing.')
  const created = factory({
    wasmBinary,
    print: function () {},
    printErr: function () {},
    locateFile: function (path) {
      return vendorUrl(path)
    },
  })
  engine = created && typeof created.then === 'function' ? await created : created
  if (!engine || !engine.FS) throw new Error('Speech engine did not start.')
}

self.onmessage = async function (event) {
  const msg = event.data || {}
  try {
    if (msg.type === 'init') {
      await boot()
      post({ type: 'ready' })
      return
    }
    if (!engine) throw new Error('Speech engine is not ready.')
    if (msg.type === 'load-asr') {
      writeFiles(msg.files)
      if (stream) stream.free()
      if (recognizer) recognizer.free()
      recognizer = createOnlineRecognizer(engine, {
        featConfig: { sampleRate: 16000, featureDim: 80 },
        modelConfig: {
          paraformer: {
            encoder: '/' + msg.paths.encoder,
            decoder: '/' + msg.paths.decoder,
          },
          tokens: '/' + msg.paths.tokens,
          numThreads: 1,
          provider: 'cpu',
          debug: 0,
          modelType: 'paraformer',
        },
        decodingMethod: 'greedy_search',
        enableEndpoint: 1,
        rule1MinTrailingSilence: 2.4,
        rule2MinTrailingSilence: 0.8,
        rule3MinUtteranceLength: 20,
      })
      stream = recognizer.createStream()
      post({ type: 'asr-loaded' })
      return
    }
    if (msg.type === 'load-tts') {
      writeFiles(msg.files)
      if (tts) tts.free()
      tts = createOfflineTts(engine, {
        model: {
          vits: {
            model: '/' + msg.paths.model,
            lexicon: '',
            tokens: '/' + msg.paths.tokens,
            dataDir: '/' + msg.paths.dataDir,
          },
          numThreads: 1,
          debug: 0,
          provider: 'cpu',
        },
        ruleFsts: '',
        maxNumSentences: 1,
      })
      post({ type: 'tts-loaded' })
      return
    }
    if (msg.type === 'pcm') {
      if (!recognizer || !stream) return
      stream.acceptWaveform(16000, msg.samples)
      drainReady()
      const text = resultText()
      post({ type: 'partial', text })
      if (recognizer.isEndpoint(stream)) {
        if (text) post({ type: 'endpoint', text })
        recognizer.reset(stream)
      }
      return
    }
    if (msg.type === 'stop') {
      if (recognizer && stream) {
        stream.inputFinished()
        drainReady()
        const text = resultText()
        if (text) post({ type: 'endpoint', text })
        recognizer.reset(stream)
      }
      post({ type: 'stopped' })
      return
    }
    if (msg.type === 'speak') {
      if (!tts) throw new Error('English voice is not loaded.')
      const audio = tts.generate({ text: String(msg.text || ''), sid: 0, speed: 1 })
      const samples = new Float32Array(audio.samples)
      post(
        { type: 'audio', id: msg.id, samples, sampleRate: audio.sampleRate },
        [samples.buffer],
      )
      return
    }
    throw new Error('Unknown speech request.')
  } catch (err) {
    post({ type: 'error', message: errorText(err) })
  }
}
