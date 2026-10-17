import './buffer-shim'
import { assetUrl } from './asset'
import {
  ASR_FILES,
  ESPEAK_PACK,
  PIPER_FILES,
  QWEN_08_ID,
  translateModel,
  type TranslateModelId,
  type WeightFile,
} from './catalog'
import { extractTarBz2, resolveAsrPaths, resolveTtsPaths, type FileMap } from './archive'
import { concatFloats, encodeWav, resampleLinear } from './audio'
import { isAbort, loadFileMap, loadWeight } from './download'
import { applyMirror, readMirror, MIRROR_KEY, type Mirror } from './mirror'
import { progressLabel, type Transfer } from './progress'
import { buildTranslatePrompt, stripThink, voiceAction, type VoiceChoice } from './prompt'
import { Wllama } from '@wllama/wllama'

type Marks = {
  firstChinesePartial: number | null
  firstEnglishToken: number | null
  firstPiperAudio: number | null
  firstBrowserSpeech: number | null
  released: number | null
}

type Probe = {
  marks: Marks
  chinese: string
  english: string
  utterances: string[]
  sampleRate: number
  samples: Float32Array
  resetMarks: () => void
}

const CHUNK = 1600

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  text = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value)
  if (text) node.textContent = text
  return node
}

function emptyMarks(): Marks {
  return {
    firstChinesePartial: null,
    firstEnglishToken: null,
    firstPiperAudio: null,
    firstBrowserSpeech: null,
    released: null,
  }
}

export function mount(root: HTMLElement): void {
  const probe: Probe = {
    marks: emptyMarks(),
    chinese: '',
    english: '',
    utterances: [],
    sampleRate: 22050,
    samples: new Float32Array(),
    resetMarks() {
      this.marks = emptyMarks()
      this.utterances = []
      this.samples = new Float32Array()
    },
  }
  ;(window as unknown as { __hanline: Probe }).__hanline = probe

  const app = el('main', { class: 'app' })
  const title = el('h1', {}, 'Hanline')
  const lede = el('p', { class: 'lede' }, 'Hold the button, speak Chinese, and read the English as it arrives.')
  const status = el('p', { class: 'status' }, 'Preparing models…')
  const bar = el('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0', 'aria-label': 'Download' })
  const barFill = el('span')
  bar.append(barFill)
  const error = el('p', { class: 'error' })
  const chinesePanel = el('section', { class: 'panel' })
  chinesePanel.append(el('p', { class: 'label' }, 'Chinese'), el('p', { class: 'transcript', id: 'chinese' }))
  const englishPanel = el('section', { class: 'panel' })
  englishPanel.append(el('p', { class: 'label' }, 'English'), el('p', { class: 'transcript', id: 'english' }))
  const hold = el('button', { class: 'primary', type: 'button' }, 'Hold to listen')
  hold.disabled = true
  const speak = el('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': 'false' }, 'Speak English')
  const model08 = el('button', { type: 'button' }, 'Qwen 0.8B')
  const model2 = el('button', { type: 'button' }, 'Qwen 2B')
  const voiceBrowser = el('button', { type: 'button' }, 'Browser voice')
  const voicePiper = el('button', { type: 'button' }, 'English model')
  const hear = el('button', { type: 'button' }, 'Hear it')
  const sourceIntl = el('button', { type: 'button', 'aria-pressed': 'true' }, 'International')
  const sourceChina = el('button', { type: 'button', 'aria-pressed': 'false' }, 'China mirror')
  const controls = el('div', { class: 'row' })
  controls.append(hold, speak, hear)
  const sources = el('div', { class: 'row' })
  sources.append(el('span', { class: 'source-label' }, 'Download from'), sourceIntl, sourceChina)
  const choices = el('div', { class: 'row' })
  choices.append(model08, model2, voiceBrowser, voicePiper)
  app.append(title, lede, status, bar, error, chinesePanel, englishPanel, controls, sources, choices)
  root.append(app)

  const chineseNode = chinesePanel.querySelector('#chinese') as HTMLElement
  const englishNode = englishPanel.querySelector('#english') as HTMLElement

  let mirror: Mirror = readMirror(storedMirror())
  let modelId: TranslateModelId = QWEN_08_ID
  let voice: VoiceChoice = 'browser'
  let speakOn = false
  let ready = false
  let holding = false
  let worker: Worker | null = null
  let llama: Wllama | null = null
  let asrReady = false
  let ttsReady = false
  let audioCtx: AudioContext | null = null
  let capture: AudioWorkletNode | null = null
  let sink: GainNode | null = null
  let mic: MediaStream | null = null
  let pcm = new Float32Array(0)
  let committed = ''
  let partial = ''
  const englishParts: string[] = []
  let translateChain = Promise.resolve()
  let playChain = Promise.resolve()
  const clips: Float32Array[] = []
  let clipRate = 22050
  let generation = 0
  let workletReady = false
  let bootId = 0
  let job = new AbortController()
  let paintAt = 0

  function storedMirror(): string | null {
    try {
      return localStorage.getItem(MIRROR_KEY)
    } catch {
      return null
    }
  }

  function rememberMirror(next: Mirror) {
    try {
      localStorage.setItem(MIRROR_KEY, next)
    } catch {
      /* the choice still applies for this visit */
    }
  }

  function paintChoices() {
    model08.classList.toggle('selected', modelId === QWEN_08_ID)
    model2.classList.toggle('selected', modelId === 'qwen35-2b')
    voiceBrowser.classList.toggle('selected', voice === 'browser')
    voicePiper.classList.toggle('selected', voice === 'piper')
    sourceIntl.classList.toggle('selected', mirror === 'international')
    sourceChina.classList.toggle('selected', mirror === 'china')
    sourceIntl.setAttribute('aria-pressed', mirror === 'international' ? 'true' : 'false')
    sourceChina.setAttribute('aria-pressed', mirror === 'china' ? 'true' : 'false')
    speak.setAttribute('aria-checked', speakOn ? 'true' : 'false')
  }

  function setStatus(text: string, ratio = 1, readyState = '') {
    status.textContent = text
    const pct = Math.max(0, Math.min(100, Math.round(ratio * 100)))
    barFill.style.width = `${pct}%`
    bar.setAttribute('aria-valuenow', String(pct))
    if (readyState) status.dataset.ready = readyState
  }

  function report(title: string, transfer: Transfer) {
    const view = progressLabel(title, transfer)
    const now = performance.now()
    const pct = Math.round(view.ratio * 100)
    const quiet = transfer.phase === 'download' && pct !== 0 && pct !== 100 && now - paintAt < 150
    if (quiet && status.textContent?.includes('%')) return
    paintAt = now
    setStatus(view.text, view.ratio)
  }

  function showError(err: unknown) {
    error.textContent = err instanceof Error ? err.message : String(err)
  }

  function publishText() {
    probe.chinese = (committed + partial).trim()
    probe.english = englishParts.filter(Boolean).join(' ').trim()
    chineseNode.textContent = probe.chinese
    englishNode.textContent = probe.english
  }

  function noteChinese(text: string) {
    partial = text
    if (text && probe.marks.firstChinesePartial == null && holding) {
      probe.marks.firstChinesePartial = performance.now()
    }
    publishText()
  }

  function fileMapMessage(files: FileMap): { files: Record<string, ArrayBuffer>; transfer: ArrayBuffer[] } {
    const out: Record<string, ArrayBuffer> = {}
    const transfer: ArrayBuffer[] = []
    for (const [path, bytes] of Object.entries(files)) {
      const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
      out[path] = copy
      transfer.push(copy)
    }
    return { files: out, transfer }
  }

  async function ensureWorker(): Promise<Worker> {
    if (worker) return worker
    const next = new Worker(`${assetUrl('engine-worker.js')}?hanline=7`)
    worker = next
    next.onmessage = (event) => onWorker(event.data)
    await new Promise<void>((resolve, reject) => {
      const wait = (event: MessageEvent) => {
        if (event.data?.type === 'trace') {
          setStatus(String(event.data.message || 'Starting speech engine…'))
          return
        }
        if (event.data?.type === 'ready') {
          next.removeEventListener('message', wait)
          resolve()
        } else if (event.data?.type === 'error') {
          next.removeEventListener('message', wait)
          reject(new Error(event.data.message))
        }
      }
      next.addEventListener('message', wait)
      next.onerror = (event) => {
        next.removeEventListener('message', wait)
        reject(new Error(event.message || 'Speech worker failed.'))
      }
      next.postMessage({ type: 'init' })
    })
    return next
  }

  function onWorker(data: { type: string; text?: string; message?: string; samples?: Float32Array; sampleRate?: number }) {
    if (data.type === 'partial') noteChinese(data.text || '')
    if (data.type === 'endpoint' && data.text) {
      committed = `${committed}${data.text}`.trim() + '\n'
      partial = ''
      publishText()
      const sentence = data.text.trim()
      if (sentence) translateChain = translateChain.then(() => translateSentence(sentence)).catch(showError)
    }
    if (data.type === 'audio' && data.samples && data.sampleRate) {
      if (probe.marks.firstPiperAudio == null) probe.marks.firstPiperAudio = performance.now()
      clips.push(data.samples)
      clipRate = data.sampleRate
      probe.samples = concatFloats(clips)
      probe.sampleRate = clipRate
      const blob = encodeWav(data.samples, data.sampleRate)
      playChain = playChain.then(() => playBlob(blob)).catch(showError)
    }
    if (data.type === 'error' && data.message) showError(new Error(data.message))
  }

  async function playBlob(blob: Blob): Promise<void> {
    const ctx = audioCtx || new AudioContext()
    audioCtx = ctx
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer())
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    await new Promise<void>((resolve) => {
      source.onended = () => resolve()
      source.start()
    })
  }

  async function translateSentence(sentence: string): Promise<void> {
    if (!llama) throw new Error('Translation model is not loaded.')
    const gen = generation
    const index = englishParts.length
    englishParts.push('')
    let raw = ''
    let stopped = false
    await llama.createCompletion({
      prompt: buildTranslatePrompt(sentence),
      stream: true,
      max_tokens: 96,
      temp: 0,
      top_k: 1,
      stop: '<|im_end|>',
      onData(chunk) {
        if (stopped) return
        raw += chunk.choices[0]?.text || ''
        if (raw.includes('<|im_end|>')) stopped = true
        if (gen !== generation) return
        const visible = stripThink(raw)
        englishParts[index] = visible
        if (visible && probe.marks.firstEnglishToken == null) {
          probe.marks.firstEnglishToken = performance.now()
        }
        publishText()
      },
    })
    if (gen !== generation) return
    const visible = stripThink(raw)
    englishParts[index] = visible
    publishText()
    const action = voiceAction(speakOn, voice)
    if (!visible || action === 'off') return
    if (action === 'piper') {
      worker?.postMessage({ type: 'speak', id: index, text: visible })
    } else {
      speakBrowser(visible)
    }
  }

  function speakBrowser(text: string) {
    const synth = window.speechSynthesis
    const chosen = synth.getVoices().find((item) => item.lang.toLowerCase().startsWith('en'))
    if (!chosen) throw new Error('No English voice is installed in this browser.')
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.voice = chosen
    utterance.lang = chosen.lang
    if (probe.marks.firstBrowserSpeech == null) probe.marks.firstBrowserSpeech = performance.now()
    probe.utterances.push(text)
    synth.speak(utterance)
  }

  function keepFiles(files: FileMap, keys: string[]): FileMap {
    const out: FileMap = {}
    for (const key of keys) {
      const bytes = files[key]
      if (!bytes) throw new Error('A required model file is missing.')
      out[key] = bytes
    }
    return out
  }

  async function loadAsr(speech: Worker, signal: AbortSignal) {
    const packedAsr = await (async () => {
      const files = await loadFileMap(
        ASR_FILES.map((file) => applyMirror(file, mirror)),
        (transfer) => report('Chinese dictation', transfer),
        signal,
      )
      const paths = resolveAsrPaths(files)
      const needed = keepFiles(files, [paths.encoder, paths.decoder, paths.tokens])
      return { paths, packed: fileMapMessage(needed) }
    })()
    await new Promise<void>((resolve, reject) => {
      const wait = (event: MessageEvent) => {
        if (event.data?.type === 'asr-loaded') {
          speech.removeEventListener('message', wait)
          resolve()
        } else if (event.data?.type === 'error') {
          speech.removeEventListener('message', wait)
          reject(new Error(event.data.message))
        }
      }
      speech.addEventListener('message', wait)
      speech.postMessage({ type: 'load-asr', files: packedAsr.packed.files, paths: packedAsr.paths }, packedAsr.packed.transfer)
    })
    asrReady = true
  }

  async function loadPiper(speech: Worker, signal: AbortSignal) {
    const packedTts = await (async () => {
      const piper = PIPER_FILES.map((file) => applyMirror(file, mirror))
      const espeak = applyMirror({ ...ESPEAK_PACK, url: assetUrl(ESPEAK_PACK.file) }, mirror)
      const grand = [...piper, espeak].reduce((sum, file) => sum + file.bytes, 0) || 1
      const piperBytes = piper.reduce((sum, file) => sum + file.bytes, 0)
      const files = await loadFileMap(
        piper,
        (transfer) => report('English voice', { ...transfer, total: grand }),
        signal,
      )
      const archive = await loadWeight(
        espeak,
        (transfer) => {
          const current = transfer.phase === 'download' ? transfer.received : espeak.bytes
          report('English voice', { received: piperBytes + current, total: grand, phase: transfer.phase })
        },
        signal,
      )
      setStatus('Unpacking English voice…', 0.96)
      const dataFiles = extractTarBz2(archive)
      for (const [path, data] of Object.entries(dataFiles)) files[path] = data
      const paths = resolveTtsPaths(files)
      const needed = keepFiles(files, [paths.model, paths.tokens])
      for (const [path, data] of Object.entries(files)) {
        if (path.startsWith(`${paths.dataDir}/`) || path.startsWith(`${paths.dataDir}\\`)) needed[path] = data
      }
      return { paths, packed: fileMapMessage(needed) }
    })()
    await new Promise<void>((resolve, reject) => {
      const wait = (event: MessageEvent) => {
        if (event.data?.type === 'tts-loaded') {
          speech.removeEventListener('message', wait)
          resolve()
        } else if (event.data?.type === 'error') {
          speech.removeEventListener('message', wait)
          reject(new Error(event.data.message))
        }
      }
      speech.addEventListener('message', wait)
      speech.postMessage(
        { type: 'load-tts', files: packedTts.packed.files, paths: packedTts.paths },
        packedTts.packed.transfer,
      )
    })
    ttsReady = true
    setStatus('Ready', 1, 'piper')
  }

  async function loadLlama(file: WeightFile, signal: AbortSignal) {
    const bytes = await loadWeight(applyMirror(file, mirror), (transfer) => report('Translation model', transfer), signal)
    if (signal.aborted) return
    if (llama) await llama.exit()
    llama = new Wllama({ default: assetUrl('vendor/wllama.wasm') }, { suppressNativeLog: true })
    setStatus('Loading translation model…', 1)
    await llama.loadModel([new Blob([bytes.slice()])], {
      n_ctx: 512,
      n_threads: 1,
      reasoning: false,
      reasoning_format: 'none',
      warmup: false,
    })
  }

  async function boot() {
    const id = ++bootId
    job.abort()
    job = new AbortController()
    const signal = job.signal
    ready = false
    hold.disabled = true
    try {
      paintChoices()
      const speech = await ensureWorker()
      if (id !== bootId) return
      await loadAsr(speech, signal)
      if (id !== bootId) return
      await loadLlama(translateModel(modelId), signal)
      if (id !== bootId) return
      ready = asrReady && Boolean(llama)
      hold.disabled = !ready
      setStatus(ready ? 'Ready' : 'Still preparing…', 1, ready ? 'asr' : '')
    } catch (err) {
      if (id !== bootId || isAbort(err)) return
      showError(err)
      setStatus('Setup failed', 0)
    }
  }

  function chooseMirror(next: Mirror) {
    if (next === mirror) return
    mirror = next
    rememberMirror(next)
    paintChoices()
    if (ready) return
    error.textContent = ''
    void boot()
  }

  async function switchModel(next: TranslateModelId) {
    if (next === modelId || holding) return
    modelId = next
    paintChoices()
    if (!ready) {
      await boot()
      return
    }
    job.abort()
    job = new AbortController()
    const signal = job.signal
    ready = false
    hold.disabled = true
    try {
      await loadLlama(translateModel(modelId), signal)
      if (signal.aborted) return
      ready = asrReady && Boolean(llama)
      hold.disabled = !ready
      setStatus('Ready', 1, 'asr')
    } catch (err) {
      if (isAbort(err)) return
      showError(err)
    }
  }

  async function switchVoice(next: VoiceChoice) {
    voice = next
    paintChoices()
    if (next === 'piper' && !ttsReady) {
      const signal = job.signal
      try {
        const speech = await ensureWorker()
        await loadPiper(speech, signal)
        if (signal.aborted) return
        setStatus('Ready', 1)
      } catch (err) {
        if (isAbort(err)) return
        showError(err)
      }
    }
  }

  function pushPcm(samples: Float32Array) {
    const merged = new Float32Array(pcm.length + samples.length)
    merged.set(pcm, 0)
    merged.set(samples, pcm.length)
    pcm = merged
    while (pcm.length >= CHUNK) {
      const slice = pcm.slice(0, CHUNK)
      pcm = pcm.slice(CHUNK)
      worker?.postMessage({ type: 'pcm', samples: slice }, [slice.buffer])
    }
  }

  async function startHold() {
    if (!ready || holding) return
    error.textContent = ''
    holding = true
    generation += 1
    probe.resetMarks()
    committed = ''
    partial = ''
    englishParts.length = 0
    clips.length = 0
    probe.samples = new Float32Array()
    publishText()
    hold.textContent = 'Listening…'
    audioCtx = audioCtx || new AudioContext()
    await audioCtx.resume()
    if (!workletReady) {
      await audioCtx.audioWorklet.addModule('/capture-processor.js')
      workletReady = true
    }
    mic = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false },
    })
    if (!holding) {
      mic.getTracks().forEach((track) => track.stop())
      mic = null
      return
    }
    const source = audioCtx.createMediaStreamSource(mic)
    capture = new AudioWorkletNode(audioCtx, 'hanline-capture')
    sink = audioCtx.createGain()
    sink.gain.value = 0
    const rate = audioCtx.sampleRate
    capture.port.onmessage = (event) => {
      const input = event.data as Float32Array
      pushPcm(resampleLinear(input, rate, 16000))
    }
    source.connect(capture)
    capture.connect(sink)
    sink.connect(audioCtx.destination)
    hold.dataset.listening = 'live'
  }

  function stopHold() {
    if (!holding) return
    holding = false
    delete hold.dataset.listening
    probe.marks.released = performance.now()
    hold.textContent = 'Hold to listen'
    capture?.disconnect()
    sink?.disconnect()
    capture = null
    sink = null
    mic?.getTracks().forEach((track) => track.stop())
    mic = null
    if (pcm.length) {
      const tail = pcm
      pcm = new Float32Array(0)
      worker?.postMessage({ type: 'pcm', samples: tail }, [tail.buffer])
    }
    worker?.postMessage({ type: 'stop' })
  }

  hold.addEventListener('pointerdown', (event) => {
    event.preventDefault()
    hold.setPointerCapture(event.pointerId)
    startHold().catch(showError)
  })
  hold.addEventListener('pointerup', stopHold)
  hold.addEventListener('pointercancel', stopHold)
  speak.addEventListener('click', () => {
    speakOn = !speakOn
    paintChoices()
  })
  model08.addEventListener('click', () => {
    switchModel(QWEN_08_ID).catch(showError)
  })
  model2.addEventListener('click', () => {
    switchModel('qwen35-2b').catch(showError)
  })
  voiceBrowser.addEventListener('click', () => {
    switchVoice('browser').catch(showError)
  })
  voicePiper.addEventListener('click', () => {
    switchVoice('piper').catch(showError)
  })
  sourceIntl.addEventListener('click', () => chooseMirror('international'))
  sourceChina.addEventListener('click', () => chooseMirror('china'))
  hear.addEventListener('click', () => {
    const text = probe.english.trim()
    if (!text) return
    const action = voiceAction(true, voice)
    if (action === 'browser') speakBrowser(text)
    else if (ttsReady) worker?.postMessage({ type: 'speak', id: 'replay', text })
  })

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(assetUrl('sw.js')).catch(() => {})
  }
  void boot()
}

mount(document.querySelector('#app') as HTMLElement)
