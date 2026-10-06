/** Read-only, fixed-origin transport. Provider errors/bodies never enter diagnostics. */
export function providerGetClient(
  provider: "vercel" | "trigger",
  token: string,
  request: typeof fetch = fetch,
) {
  const origin =
    provider === "vercel" ? "https://api.vercel.com" : "https://api.trigger.dev"
  if (!token || /[\r\n]/.test(token))
    throw new Error("Provider read credential is unavailable.")
  return async (
    path: string,
    query: Record<string, string> = {},
  ): Promise<unknown> => {
    if (
      !(
        provider === "vercel"
          ? /^\/v[0-9]+\/[A-Za-z0-9_./%-]+$/
          : /^\/api\/v[0-9]+\/[A-Za-z0-9_./%-]+$/
      ).test(path) ||
      path.includes("..") ||
      path.includes("%")
    )
      throw new Error("Provider read path is invalid.")
    const url = new URL(path, origin)
    for (const [key, value] of Object.entries(query))
      url.searchParams.set(key, value)
    let response: Response
    try {
      response = await request(url, {
        method: "GET",
        redirect: "error",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(15_000),
      })
    } catch {
      throw new Error(`${provider}: authenticated read failed.`)
    }
    if (!response.ok) {
      await response.body?.cancel()
      throw new Error(
        `${provider}: authenticated read returned HTTP ${response.status}.`,
      )
    }
    const limit = 5 * 1024 * 1024
    const reader = response.body?.getReader()
    if (!reader) throw new Error(`${provider}: empty provider response.`)
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        const result = await reader.read()
        if (result.done) break
        size += result.value.byteLength
        if (size > limit) {
          await reader.cancel()
          throw new Error("oversized")
        }
        chunks.push(result.value)
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8"))
    } catch {
      throw new Error(`${provider}: invalid or oversized provider response.`)
    } finally {
      reader.releaseLock()
    }
  }
}

export type ProviderGet = ReturnType<typeof providerGetClient>
export function providerRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Provider record is missing or malformed.")
  return value as Record<string, unknown>
}
