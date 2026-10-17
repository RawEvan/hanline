# Hanline

Hanline listens to spoken Chinese in the browser and writes English while you are still holding the button. Turn on Speak English to hear each finished sentence.

Dictation uses sherpa-onnx streaming Paraformer. Translation uses a Qwen3.5 GGUF file on this device (0.8B by default, or 2B). Speech is the browser voice, or an optional English Piper model. Weights download from their publishers. Nothing is sent to a translation service.

## Try it

Hosted build (GitHub Pages):

https://rawevan.github.io/hanline/

The first visit downloads the dictation and translation files from Hugging Face (about 0.8GB for the default 0.8B setup). Optional English-model speech also loads a small same-origin voice data pack. Later visits reuse the browser’s stored copies.

## Run locally

```bash
npm install
npm run dev
```

Open http://127.0.0.1:4179 , wait until the listen button enables, then hold it and speak Chinese.

## Checks

```bash
npm test
npm run e2e
BASE_PATH=/hanline/ npm run build
npm run check:pages-dist
```

The end-to-end check generates a Chinese recording, plays it into the page microphone, and writes `.cache/output/english.wav`.

Model archives and the translation file are cached under `.cache/` and are not part of this repository.
