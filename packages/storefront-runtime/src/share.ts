type ShareRequest = { title: string; url: string }
type ShareAdapter = {
  share?: (request: ShareRequest) => Promise<void>
  copy?: (url: string) => Promise<void>
}

export async function shareStorefrontLink(
  request: ShareRequest,
  adapter: ShareAdapter,
) {
  if (adapter.share) {
    try {
      await adapter.share(request)
      return "shared" as const
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError")
        return "cancelled" as const
    }
  }
  if (adapter.copy) {
    try {
      await adapter.copy(request.url)
      return "copied" as const
    } catch {
      /* A visible URL remains available when clipboard permission is denied. */
    }
  }
  return "unavailable" as const
}
