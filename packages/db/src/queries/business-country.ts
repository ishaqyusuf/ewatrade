/**
 * The business's country for defaults such as phone and address pickers: the
 * country set on the business, else its oldest Store's. Null when neither
 * holds a two-letter code, so callers can keep their own fallback.
 */
export function canonicalBusinessCountryCode(
  tenantCountryCode: string | null | undefined,
  stores: ReadonlyArray<{ countryCode: string | null }>,
) {
  for (const candidate of [
    tenantCountryCode,
    ...stores.map((store) => store.countryCode),
  ]) {
    const code = candidate?.trim()
    if (code && /^[A-Za-z]{2}$/.test(code)) return code.toUpperCase()
  }
  return null
}
