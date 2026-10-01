type PreviewMobileTarget = {
  apiUrl?: string
  expectedApiUrl?: string
  legalOrigin?: string
  productionApiUrl?: string
  baseUrl?: string
  webUrl?: string
  chatUrl?: string
  productionBaseUrl?: string
  productionWebUrl?: string
  productionChatUrl?: string
}

export function validatePreviewMobileTarget(target: PreviewMobileTarget): void {
  const api = parseSafeHttpsOrigin(target.apiUrl)
  const expectedApi = parseSafeHttpsOrigin(target.expectedApiUrl)
  const productionApi = parseSafeHttpsOrigin(target.productionApiUrl)
  if (
    !api ||
    !expectedApi ||
    !productionApi ||
    api !== expectedApi ||
    api === productionApi
  ) {
    throw new Error(
      "Preview mobile API must explicitly match the isolated root Preview API_URL and differ from Production.",
    )
  }
  if (!parseSafeHttpsOrigin(target.legalOrigin)) {
    throw new Error(
      "Preview mobile legal origin must be an explicit HTTPS origin.",
    )
  }
  for (const [name, preview, production] of [
    ["base", target.baseUrl, target.productionBaseUrl],
    ["web", target.webUrl, target.productionWebUrl],
    ["chat", target.chatUrl, target.productionChatUrl],
  ]) {
    const previewOrigin = parseSafeHttpsOrigin(preview)
    const productionOrigin = parseSafeHttpsOrigin(production)
    if (
      !previewOrigin ||
      !productionOrigin ||
      previewOrigin === productionOrigin
    ) {
      throw new Error(
        `Preview mobile ${name} origin must be explicit HTTPS and differ from Production.`,
      )
    }
  }
}

function parseSafeHttpsOrigin(value: string | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      return null
    return url.origin
  } catch {
    return null
  }
}
