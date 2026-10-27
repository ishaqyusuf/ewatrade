/** Only newly minted, random payment handles use this namespace; legacy IDs are not bearer codes. */
export const MANUAL_PAYMENT_SHORT_ID_PREFIX = "mpl_"

/** Sixteen random bytes encoded as base64url: 128 bits, without padding. */
export function isManualPaymentShortCode(value: string) {
  return /^[A-Za-z0-9_-]{22}$/.test(value)
}

export function manualPaymentLinkId(code: string) {
  return isManualPaymentShortCode(code)
    ? `${MANUAL_PAYMENT_SHORT_ID_PREFIX}${code}`
    : null
}

export function manualPaymentShortCode(id: string) {
  if (!id.startsWith(MANUAL_PAYMENT_SHORT_ID_PREFIX)) return null
  const code = id.slice(MANUAL_PAYMENT_SHORT_ID_PREFIX.length)
  return isManualPaymentShortCode(code) ? code : null
}

export function manualPaymentLinkPath(token: string) {
  return isManualPaymentShortCode(token)
    ? `/p/${token}`
    : `/pay/${encodeURIComponent(token)}`
}
