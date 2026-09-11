const localHostnames = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"])

export function resolveMobileServiceUrl({
  configuredPort,
  configuredUrl,
  debuggerHostname,
  defaultPort,
  requiredUrlName,
}: {
  configuredPort?: string
  configuredUrl?: string
  debuggerHostname: string | null
  defaultPort: string
  requiredUrlName: string
}) {
  const explicitUrl = configuredUrl?.trim()
  if (explicitUrl) {
    const normalized = explicitUrl.replace(/\/$/, "")
    if (!debuggerHostname) return normalized

    try {
      const url = new URL(normalized)
      if (!localHostnames.has(url.hostname)) return normalized

      url.hostname = debuggerHostname
      return url.toString().replace(/\/$/, "")
    } catch {
      return normalized
    }
  }

  if (!debuggerHostname) {
    throw new Error(
      `${requiredUrlName} must be set when a local Expo host is unavailable.`,
    )
  }

  return `http://${debuggerHostname}:${configuredPort?.trim() || defaultPort}`
}
