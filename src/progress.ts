export type TransferPhase = 'download' | 'check' | 'save'

export type Transfer = {
  received: number
  total: number
  phase: TransferPhase
}

const MB = 1024 * 1024
const KB = 1024

/** received / total in one unit, chosen from the larger side. */
export function formatPair(received: number, total: number): string {
  const scale = Math.max(0, received, total)
  if (scale >= MB) {
    return `${(Math.max(0, received) / MB).toFixed(1)} / ${(Math.max(0, total) / MB).toFixed(1)} MB`
  }
  if (scale >= KB) {
    return `${Math.round(Math.max(0, received) / KB)} / ${Math.round(Math.max(0, total) / KB)} KB`
  }
  return `${Math.round(Math.max(0, received))} / ${Math.round(Math.max(0, total))} B`
}

export function progressLabel(title: string, transfer: Transfer): { text: string; ratio: number } {
  const total = Math.max(0, transfer.total)
  const received = Math.max(0, transfer.received)
  if (transfer.phase === 'check') return { text: `Checking ${title}…`, ratio: total ? Math.min(1, received / total) : 1 }
  if (transfer.phase === 'save') return { text: `Saving ${title}…`, ratio: total ? Math.min(1, received / total) : 1 }
  const ratio = total ? Math.min(1, received / total) : 0
  const pct = total ? Math.min(100, Math.round((received / total) * 100)) : 0
  const size = total ? ` · ${formatPair(received, total)}` : ''
  return { text: `${title} ${pct}%${size}`, ratio }
}
