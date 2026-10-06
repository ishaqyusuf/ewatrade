export function createQaSignupPhone(identityPhone: string) {
  const countryCode = "NG"
  // Synthetic QA digits; this is not a verified or contactable phone number.
  const phone = `8000000${identityPhone.slice(-3)}`
  return { countryCode, phone }
}
