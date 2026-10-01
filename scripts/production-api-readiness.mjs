export function parseApiOrigin(value, label, failures) {
  if (typeof value !== "string" || !value.trim()) {
    failures.push(`${label} is missing.`)
    return null
  }
  try {
    const parsed = new URL(value.trim())
    if (
      parsed.protocol !== "https:" ||
      ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) ||
      [".localhost", ".local", ".test"].some((suffix) =>
        parsed.hostname.endsWith(suffix),
      ) ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      failures.push(`${label} must be a public bare HTTPS origin.`)
      return null
    }
    return parsed.origin
  } catch {
    failures.push(`${label} must be a valid HTTPS origin.`)
    return null
  }
}

export function validateProductionApiHostConfiguration(rootEnv) {
  const failures = []
  const rootApi = parseApiOrigin(rootEnv.API_URL, "root API_URL", failures)
  const publicApi = parseApiOrigin(
    rootEnv.NEXT_PUBLIC_API_URL,
    "root NEXT_PUBLIC_API_URL",
    failures,
  )
  const healthUrl = parseApiOrigin(
    rootEnv.VERCEL_API_HEALTH_URL,
    "root VERCEL_API_HEALTH_URL",
    failures,
  )
  if (rootApi && publicApi && rootApi !== publicApi)
    failures.push("root API_URL and NEXT_PUBLIC_API_URL must match.")
  if (rootApi && healthUrl && rootApi !== healthUrl)
    failures.push("root VERCEL_API_HEALTH_URL must match API_URL.")
  return { origin: failures.length === 0 ? rootApi : null, failures }
}

export function validateProductionApiConfiguration(rootEnv, mobileEnv) {
  const failures = []
  const rootApi = parseApiOrigin(rootEnv.API_URL, "root API_URL", failures)
  const publicApi = parseApiOrigin(
    rootEnv.NEXT_PUBLIC_API_URL,
    "root NEXT_PUBLIC_API_URL",
    failures,
  )
  const mobileApi = parseApiOrigin(
    mobileEnv.EXPO_PUBLIC_API_URL,
    "mobile EXPO_PUBLIC_API_URL",
    failures,
  )
  if (rootApi && publicApi && rootApi !== publicApi)
    failures.push("root API_URL and NEXT_PUBLIC_API_URL must match.")
  if (rootApi && mobileApi && rootApi !== mobileApi)
    failures.push("mobile EXPO_PUBLIC_API_URL must match root API_URL.")
  return { origin: failures.length === 0 ? rootApi : null, failures }
}

export async function probeProductionApi(origin, fetchImpl = fetch) {
  const failures = []
  const endpoints = [
    {
      path: "/health",
      isExpected: (body) =>
        body?.status === "ok" &&
        Number.isSafeInteger(body?.database?.accounts) &&
        body.database.accounts >= 0,
    },
    { path: "/api/auth/get-session", isExpected: () => true },
    {
      path: "/api/trpc/auth.legalPublication",
      isExpected: (body) =>
        typeof body?.result?.data?.json?.effective === "boolean" &&
        typeof body.result.data.json.signupAvailable === "boolean",
    },
  ]
  for (const endpoint of endpoints) {
    let response
    try {
      response = await fetchImpl(`${origin}${endpoint.path}`, {
        redirect: "manual",
        cache: "no-store",
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      })
    } catch {
      failures.push(`${endpoint.path} could not be reached.`)
      continue
    }
    if (
      response.status !== 200 ||
      !response.headers
        .get("content-type")
        ?.toLowerCase()
        .includes("application/json")
    ) {
      failures.push(
        `${endpoint.path} did not return API JSON 200 without a redirect.`,
      )
      continue
    }
    try {
      const body = await response.json()
      if (!endpoint.isExpected(body))
        failures.push(`${endpoint.path} returned unexpected API JSON.`)
    } catch {
      failures.push(`${endpoint.path} returned invalid JSON.`)
    }
  }
  return failures
}
