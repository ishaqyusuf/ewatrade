import { assistantResponseMessageId } from "@ewatrade/assistant/channels/conversation-links"

export function assistantResponseNativePath(messageId: string) {
  return `/assistant-response?messageId=${assistantResponseMessageId.parse(messageId)}`
}

export function resolveAssistantResponseLink(
  value: string,
  dashboardUrl?: string,
  appScheme = "ewatrade",
) {
  if (
    value.startsWith("//") ||
    value.includes("\\") ||
    [...value].some((point) => (point.codePointAt(0) ?? 0) <= 32)
  )
    return null
  try {
    const base = dashboardUrl ? new URL(dashboardUrl) : null
    const url = new URL(value, "https://relative.invalid")
    let pathname = url.pathname
    if (url.username || url.password || url.hash || url.search) return null
    if (
      url.protocol === `${appScheme}:` &&
      [
        "ewatrade",
        "ewatrade-preview",
        "ewatrade-dev",
        "ewatrade-play-preview",
      ].includes(appScheme)
    ) {
      if (url.hostname !== "open" || url.port) return null
      pathname = `/open${url.pathname}`
    } else if (
      url.origin === "https://relative.invalid" &&
      value.startsWith("/") &&
      !value.startsWith("//")
    ) {
      // Expo may supply the already matched relative app-link path.
    } else if (
      url.protocol === "https:" &&
      base &&
      url.origin === base.origin
    ) {
      const prefix = base.pathname.replace(/\/$/, "")
      if (!pathname.startsWith(`${prefix}/open/`)) return null
      pathname = pathname.slice(prefix.length)
    } else return null
    const id = /^\/open\/assistant-response\/([A-Za-z0-9_-]{1,128})\/?$/.exec(
      pathname,
    )?.[1]
    return id ? assistantResponseNativePath(id) : null
  } catch {
    return null
  }
}

/** Only this exact local continuation joins the existing customer login destinations. */
export function assistantResponseLoginDestination(value: unknown) {
  if (typeof value !== "string") return undefined
  const match = /^\/assistant-response\?messageId=([A-Za-z0-9_-]{1,128})$/.exec(
    value,
  )
  return match ? assistantResponseNativePath(match[1] ?? "") : undefined
}
