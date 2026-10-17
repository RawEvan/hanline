export const QWEN_08_ID = 'qwen35-08b'
export const QWEN_2B_ID = 'qwen35-2b'

export type TranslateModelId = typeof QWEN_08_ID | typeof QWEN_2B_ID

export type WeightFile = {
  id: string
  /** Unique OPFS / local-cache key */
  file: string
  /** Path used inside the speech worker filesystem */
  mapPath: string
  /** Publisher URL used by the international source. */
  url: string
  /** Same bytes on the China source. Absent when that file is not published there. */
  cn?: string
  bytes: number
  sha256: string
}

const ASR_BASE =
  'https://huggingface.co/csukuangfj/sherpa-onnx-streaming-paraformer-bilingual-zh-en/resolve/main'
const ASR_CN =
  'https://www.modelscope.cn/models/pengzhendong/sherpa-onnx-streaming-paraformer-bilingual-zh-en/resolve/master'
const PIPER_BASE = 'https://huggingface.co/csukuangfj/vits-piper-en_US-lessac-medium/resolve/main'

/** Dictation weights (Hugging Face; browser-CORS friendly). */
export const ASR_FILES: WeightFile[] = [
  {
    id: 'asr-encoder',
    file: 'asr-encoder.int8.onnx',
    mapPath: 'encoder.int8.onnx',
    url: `${ASR_BASE}/encoder.int8.onnx`,
    cn: `${ASR_CN}/encoder.int8.onnx`,
    bytes: 165_462_184,
    sha256: '81a70226a8934e6ed92aa1d4fc486b428b5398e2f2619ed4897b7294cab90e9a',
  },
  {
    id: 'asr-decoder',
    file: 'asr-decoder.int8.onnx',
    mapPath: 'decoder.int8.onnx',
    url: `${ASR_BASE}/decoder.int8.onnx`,
    cn: `${ASR_CN}/decoder.int8.onnx`,
    bytes: 71_664_561,
    sha256: 'f3cca9f77bb9d93c8fcbfb63ae617b6b1ee96818df3aa3b151c40658fe38594f',
  },
  {
    id: 'asr-tokens',
    file: 'asr-tokens.txt',
    mapPath: 'tokens.txt',
    url: `${ASR_BASE}/tokens.txt`,
    cn: `${ASR_CN}/tokens.txt`,
    bytes: 75_756,
    sha256: '59aba8873a2ed1e122c25fee421e25f283b63290efbde85c1f01a853d83cb6e6',
  },
]

/** English Piper voice (model + tokens from Hugging Face). */
export const PIPER_FILES: WeightFile[] = [
  {
    id: 'piper-model',
    file: 'piper-en_US-lessac-medium.onnx',
    mapPath: 'en_US-lessac-medium.onnx',
    url: `${PIPER_BASE}/en_US-lessac-medium.onnx`,
    bytes: 63_201_425,
    sha256: 'ea793a648ce0370665f99fbf891eae3b3a973565c72b08534bb5b2c04e8f2332',
  },
  {
    id: 'piper-tokens',
    file: 'piper-tokens.txt',
    mapPath: 'tokens.txt',
    url: `${PIPER_BASE}/tokens.txt`,
    bytes: 921,
    sha256: '87c8ef66eae5473ed0cc0366b3964c736ca6c5f676c979522ea31234e47430b9',
  },
]

/**
 * espeak-ng-data for Piper, served from this site (same origin) so browsers
 * are not blocked by GitHub release CORS.
 */
export const ESPEAK_PACK: WeightFile = {
  id: 'espeak',
  file: 'espeak-ng-data.tar.bz2',
  mapPath: 'espeak-ng-data.tar.bz2',
  url: '',
  bytes: 7_282_600,
  sha256: '9fc2fabaf8b67787d9bbc185b02e749a7cf8f056d22dbce7e0b25402f3f227bb',
}

export const TRANSLATE_MODELS: WeightFile[] = [
  {
    id: QWEN_08_ID,
    file: 'Qwen3.5-0.8B-Q4_K_M.gguf',
    mapPath: 'Qwen3.5-0.8B-Q4_K_M.gguf',
    url: 'https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/resolve/main/Qwen3.5-0.8B-Q4_K_M.gguf',
    cn: 'https://www.modelscope.cn/models/unsloth/Qwen3.5-0.8B-GGUF/resolve/master/Qwen3.5-0.8B-Q4_K_M.gguf',
    bytes: 532_517_120,
    sha256: 'bd258782e35f7f458f8aced1adc053e6e92e89bc735ba3be89d38a06121dc517',
  },
  {
    id: QWEN_2B_ID,
    file: 'Qwen3.5-2B-Q4_K_M.gguf',
    mapPath: 'Qwen3.5-2B-Q4_K_M.gguf',
    url: 'https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/main/Qwen3.5-2B-Q4_K_M.gguf',
    cn: 'https://www.modelscope.cn/models/unsloth/Qwen3.5-2B-GGUF/resolve/master/Qwen3.5-2B-Q4_K_M.gguf',
    bytes: 1_280_835_840,
    sha256: 'aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223',
  },
]

export function translateModel(id: string): WeightFile {
  const found = TRANSLATE_MODELS.find((row) => row.id === id)
  if (!found) throw new Error('Unknown translation model.')
  return found
}

export function weightUrls(): string[] {
  const rows = [...ASR_FILES, ...PIPER_FILES, ...TRANSLATE_MODELS]
  return rows.flatMap((row) => (row.cn ? [row.url, row.cn] : [row.url]))
}

export function allowedWeightHost(url: string): boolean {
  if (!url) return false
  const host = new URL(url).host
  return host === 'huggingface.co' || host === 'www.modelscope.cn'
}

export function cacheFileNames(): string[] {
  return [
    ...ASR_FILES.map((row) => row.file),
    ...PIPER_FILES.map((row) => row.file),
    ESPEAK_PACK.file,
    ...TRANSLATE_MODELS.map((row) => row.file),
  ]
}
