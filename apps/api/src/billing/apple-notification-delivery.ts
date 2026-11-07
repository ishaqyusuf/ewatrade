/** One-way relay of Apple's original signed envelope to the registered Preview
 * endpoint. No caller-controlled destination, redirect, credential or payload log. */
export async function forwardAppleSandboxNotification(
  signedPayload: string,
  config: Record<string, string | undefined> = process.env,
  send: (url: string, init: RequestInit) => Promise<Response> = (url, init) =>
    fetch(url, init),
) {
  if (
    config.APP_ENV !== "production" ||
    !["prod", "production"].includes(config.DEV_PROFILE ?? "") ||
    config.STORE_BILLING_ENVIRONMENT !== "production" ||
    config.APP_STORE_SANDBOX_FORWARD_ENABLED !== "true"
  )
    throw new Error("Apple Sandbox delivery is not configured.")
  const response = await send(
    "https://preview-api.ewatrade.com/webhooks/store/apple",
    {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signedPayload }),
    },
  )
  if (response.status !== 200 || !response.body)
    throw new Error("Apple Sandbox delivery was not acknowledged.")
  const reader = response.body.getReader()
  try {
    let body = ""
    let bytes = 0
    const decoder = new TextDecoder()
    while (true) {
      const part = await reader.read()
      if (part.done) break
      bytes += part.value.byteLength
      if (bytes > 1_024)
        throw new Error("Invalid Apple Sandbox acknowledgement.")
      body += decoder.decode(part.value, { stream: true })
    }
    body += decoder.decode()
    const result: unknown = JSON.parse(body)
    if (
      !result ||
      typeof result !== "object" ||
      !("received" in result) ||
      result.received !== true
    )
      throw new Error("Apple Sandbox delivery was not acknowledged.")
  } finally {
    await reader.cancel()
    reader.releaseLock()
  }
}
