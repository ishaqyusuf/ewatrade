import { COUNTRIES, DEFAULT_COUNTRY_CODE } from "@ewatrade/utils/countries"

/**
 * The country pickers start on: the signed business country first, then a
 * locally created business's country (code or name), else the shared default.
 */
export function businessCountryCode(
  ...candidates: Array<string | null | undefined>
) {
  for (const candidate of candidates) {
    const value = candidate?.trim()
    if (!value) continue
    const match = COUNTRIES.find(
      (country) =>
        country.code === value.toUpperCase() || country.name === value,
    )
    if (match) return match.code
  }
  return DEFAULT_COUNTRY_CODE
}
