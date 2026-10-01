import { isIP } from "node:net"

const TRUSTED_CLIENT_IP_HEADERS = new Set(["cf-connecting-ip", "x-real-ip"])

function isPlausibleIpAddress(value: string) {
  const hasControlCharacter = [...value].some((character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  })
  return (
    value.length <= 64 &&
    !hasControlCharacter &&
    !/[\s,]/.test(value) &&
    isIP(value) !== 0
  )
}

/** Reads a client IP only from an explicitly configured, proxy-sanitized header. */
export function getTrustedQaNetworkSource(input: {
  env: Record<string, string | undefined>
  getHeader(name: string): string | null | undefined
}) {
  return getTrustedClientIp(
    input.env.QA_ACCELERATOR_TRUSTED_CLIENT_IP_HEADER,
    input.getHeader,
  )
}

export function getTrustedPrivacyNetworkSource(input: {
  env: Record<string, string | undefined>
  getHeader(name: string): string | null | undefined
}) {
  return getTrustedClientIp(
    input.env.ACCOUNT_PRIVACY_TRUSTED_CLIENT_IP_HEADER,
    input.getHeader,
  )
}

function getTrustedClientIp(
  configuredHeader: string | undefined,
  getHeader: (name: string) => string | null | undefined,
) {
  const headerName = configuredHeader?.trim().toLowerCase()
  if (!headerName || !TRUSTED_CLIENT_IP_HEADERS.has(headerName)) return null

  const value = getHeader(headerName)?.trim()
  return value && isPlausibleIpAddress(value) ? value : null
}
