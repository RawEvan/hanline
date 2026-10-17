let cacheEpoch = 0

export function invalidateCacheWrites(): void {
  cacheEpoch += 1
}

export function cacheWriteCurrent(epoch: number): boolean {
  return epoch === cacheEpoch
}

export function currentCacheEpoch(): number {
  return cacheEpoch
}

export type CacheDirectory = {
  removeEntry(name: string): Promise<void>
}

export function isMissingFile(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'name' in error && (error as { name?: string }).name === 'NotFoundError')
}

/** Delete saved model files. Missing names are already gone. */
export async function removeCachedFiles(names: string[], root?: CacheDirectory): Promise<void> {
  const directory = root ?? (await navigator.storage?.getDirectory())
  if (!directory) return
  for (const name of names) {
    try {
      await directory.removeEntry(name)
    } catch (error) {
      if (isMissingFile(error)) continue
      throw error
    }
  }
}
