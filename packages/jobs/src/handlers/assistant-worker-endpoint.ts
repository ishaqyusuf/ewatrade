type Environment = Record<string, string | undefined>

export type AssistantWorkerEndpoint = {
  url: URL
  key: string
  protectionBypass?: string
}

const OWNED_PREVIEW_HOST =
  /^ewatrade(?:-api)?-[a-z0-9]+-ishaqyusufs-projects\.vercel\.app$/

/** Fixed machine routes; deployment protection access is limited to one selected Preview. */
export function assistantWorkerEndpoint(
  route: "channel-turn" | "channel-delivery",
  env: Environment = process.env,
): AssistantWorkerEndpoint {
  const origin = env.API_URL?.trim()
  const key = env.INTERNAL_API_KEY?.trim()
  if (!origin || !key) throw Error("Assistant worker endpoint unavailable.")
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    throw Error("Assistant worker endpoint invalid.")
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(
        env.APP_ENV === "local" &&
        url.protocol === "http:" &&
        url.hostname.endsWith(".localhost")
      ))
  )
    throw Error("Assistant worker endpoint invalid.")

  const protectionBypass = env.ASSISTANT_API_PROTECTION_BYPASS_SECRET?.trim()
  const host = env.ASSISTANT_API_PROTECTION_BYPASS_HOST?.trim()
  if (
    (protectionBypass || host) &&
    (!protectionBypass ||
      !host ||
      env.APP_ENV !== "preview" ||
      url.protocol !== "https:" ||
      url.port !== "" ||
      url.pathname !== "/" ||
      host !== url.hostname ||
      !OWNED_PREVIEW_HOST.test(host) ||
      /[\r\n]/.test(protectionBypass))
  )
    throw Error("Assistant worker protection configuration invalid.")

  return {
    url: new URL(`/api/internal/assistant/${route}`, url),
    key,
    ...(protectionBypass ? { protectionBypass } : {}),
  }
}

export function assistantWorkerHeaders(endpoint: AssistantWorkerEndpoint) {
  return {
    "Content-Type": "application/json",
    "x-internal-key": endpoint.key,
    ...(endpoint.protectionBypass
      ? { "x-vercel-protection-bypass": endpoint.protectionBypass }
      : {}),
  }
}
