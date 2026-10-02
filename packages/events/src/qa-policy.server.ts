/** Input must come from the authenticated session and authorized workspace. */
export function isQaAnalyticsPrincipal(
  input: {
    email?: string | null
    qaSession?: boolean
    dataClassification?: string | null
  },
  routes = process.env.EMAIL_QA_DOMAIN_ROUTES,
): boolean {
  if (input.qaSession || input.dataClassification?.toLowerCase() === "qa")
    return true
  if (!input.email || !routes?.trim()) return false
  const configured: unknown = JSON.parse(routes)
  if (
    !configured ||
    typeof configured !== "object" ||
    Array.isArray(configured)
  )
    throw new Error("EMAIL_QA_DOMAIN_ROUTES must be an object")
  const domain = input.email.trim().toLowerCase().split("@").pop()
  return Object.keys(configured).some((key) => {
    const normalized = key.trim().toLowerCase().replace(/\.$/, "")
    return normalized.endsWith(".test") && normalized === domain
  })
}
