export const STORE_CONVERSATION_GUEST_COOKIE =
  "ewatrade.store_conversation_guest"

export const STORE_CONVERSATION_GUEST_COOKIE_OPTIONS = {
  httpOnly: true,
  maxAge: 180 * 24 * 60 * 60,
  path: "/",
  sameSite: "lax" as const,
  secure: true,
}

export function requestIsSameOrigin(request: Request) {
  const origin = request.headers.get("origin")
  if (!origin) return false

  try {
    const originUrl = new URL(origin)
    const requestUrl = new URL(request.url)
    const forwardedProtocol = request.headers
      .get("x-forwarded-proto")
      ?.split(",", 1)[0]
      ?.trim()
      .toLowerCase()
    const requestProtocol = forwardedProtocol
      ? `${forwardedProtocol}:`
      : requestUrl.protocol
    const requestHost = request.headers.get("host")?.trim() || requestUrl.host

    return (
      originUrl.protocol === requestProtocol && originUrl.host === requestHost
    )
  } catch {
    return false
  }
}
