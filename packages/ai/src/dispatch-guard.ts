export type LiveAiAuthorization = () => Promise<void>

/** Every SDK dispatch/retry rereads server authority; no completed result cache. */
export function authorizedLiveAiFetch(
  authorize: LiveAiAuthorization,
  fetchImpl: typeof fetch = globalThis.fetch,
): typeof fetch {
  return Object.assign(async (...args: Parameters<typeof fetch>) => {
    await authorize()
    return fetchImpl(...args)
  }, fetchImpl)
}
