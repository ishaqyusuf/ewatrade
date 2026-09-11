const TRUSTED_QA_CLIENT_IP_HEADERS = new Set(["cf-connecting-ip", "x-real-ip"])

function isPlausibleIpAddress(value: string) {
  const hasControlCharacter = [...value].some((character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  })
  return (
    value.length <= 64 &&
    !hasControlCharacter &&
    !/[\s,]/.test(value) &&
    (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value) || value.includes(":"))
  )
}

/** Reads a client IP only from an explicitly configured, proxy-sanitized header. */
export function getTrustedQaNetworkSource(input: {
  env: Record<string, string | undefined>
  getHeader(name: string): string | null | undefined
}) {
  const headerName =
    input.env.QA_ACCELERATOR_TRUSTED_CLIENT_IP_HEADER?.trim().toLowerCase()
  if (!headerName || !TRUSTED_QA_CLIENT_IP_HEADERS.has(headerName)) return null

  const value = input.getHeader(headerName)?.trim()
  return value && isPlausibleIpAddress(value) ? value : null
}
