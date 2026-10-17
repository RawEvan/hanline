import type { WeightFile } from './catalog'

export type Mirror = 'international' | 'china'

export const MIRROR_KEY = 'hanline.mirror'

export function readMirror(stored: string | null): Mirror {
  return stored === 'china' ? 'china' : 'international'
}

/** Point a catalog row at the selected source. Same-origin packs stay put. */
export function applyMirror(file: WeightFile, mirror: Mirror): WeightFile {
  if (mirror !== 'china') return file
  if (file.cn) return { ...file, url: file.cn }
  if (!file.url || !/^https?:/i.test(file.url)) return file
  throw new Error('This file is not on the China mirror. Switch to International to download it.')
}
