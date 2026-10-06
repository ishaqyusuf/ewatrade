type QaOriginRequest = {
  headers: { get(name: string): string | null }
  nextUrl: { origin: string; protocol: string }
}

function firstHeaderValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim() || null
}

export function getQaWebRequestOrigin(request: QaOriginRequest) {
  const host =
    firstHeaderValue(request.headers.get("x-forwarded-host")) ??
    firstHeaderValue(request.headers.get("host"))
  const protocol =
    firstHeaderValue(request.headers.get("x-forwarded-proto")) ??
    request.nextUrl.protocol.replace(/:$/, "")
  if (!host || !protocol) return request.nextUrl.origin

  try {
    return new URL(`${protocol}://${host}`).origin
  } catch {
    return request.nextUrl.origin
  }
}
