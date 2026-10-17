const THINK_BLOCK = /<think\b[^>]*>[\s\S]*?<\/think>/gi
const THINK_OPEN = /<think\b[^>]*>[\s\S]*$/i
const IM_END = /<\|im_end\|>[\s\S]*$/
const CONTROL = /[/／]\s*no[\s_-]*think\b/gi

export function buildTranslatePrompt(chinese: string): string {
  const text = chinese.trim()
  return (
    '<|im_start|>user\n' +
    'Translate this Chinese sentence into English. Do not paraphrase. ' +
    'Output only the English sentence:\n\n' +
    text +
    '<|im_end|>\n' +
    '<|im_start|>assistant\n' +
    '<think>\n\n</think>\n'
  )
}

export function stripThink(raw: string): string {
  return String(raw || '')
    .replace(THINK_BLOCK, '')
    .replace(THINK_OPEN, '')
    .replace(IM_END, '')
    .replace(CONTROL, '')
    .replace(/<\|im_start\|>assistant/gi, '')
    .trim()
}

export type VoiceChoice = 'browser' | 'piper'

export function voiceAction(speak: boolean, voice: VoiceChoice): 'off' | VoiceChoice {
  if (!speak) return 'off'
  return voice
}
