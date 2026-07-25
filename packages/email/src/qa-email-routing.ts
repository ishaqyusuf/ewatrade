export type QaEmailRoutingEnvironment = {
  EMAIL_QA_DOMAIN_ROUTES?: string
}

export type QaEmailDomainRoutes = ReadonlyMap<string, string>

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const domainLabelPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

export function getEmailDomain(email: string) {
  return email.trim().toLowerCase().split("@").pop() ?? ""
}

function normalizeQaDomain(value: string) {
  const domain = value.trim().toLowerCase().replace(/\.$/, "")
  const labels = domain.split(".")

  if (
    !domain.endsWith(".test") ||
    labels.length < 2 ||
    labels.some((label) => !domainLabelPattern.test(label))
  ) {
    throw new Error(
      `EMAIL_QA_DOMAIN_ROUTES key "${value}" must be a valid reserved .test domain.`,
    )
  }

  return domain
}

function parseQaDestination(value: unknown, domain: string) {
  if (typeof value !== "string" || !emailPattern.test(value.trim())) {
    throw new Error(
      `EMAIL_QA_DOMAIN_ROUTES destination for "${domain}" must be one valid email address.`,
    )
  }

  const destination = value.trim()
  const destinationDomain = getEmailDomain(destination)

  if (
    destinationDomain.endsWith(".test") ||
    destinationDomain.endsWith(".invalid") ||
    destinationDomain === "localhost" ||
    destinationDomain.endsWith(".localhost")
  ) {
    throw new Error(
      `EMAIL_QA_DOMAIN_ROUTES destination for "${domain}" must be a deliverable tester inbox.`,
    )
  }

  return destination
}

export function parseQaDomainRoutes(
  value: string | null | undefined,
): QaEmailDomainRoutes {
  const routes = new Map<string, string>()
  const trimmedValue = value?.trim()

  if (!trimmedValue) return routes

  let parsedValue: unknown

  try {
    parsedValue = JSON.parse(trimmedValue)
  } catch {
    throw new Error("EMAIL_QA_DOMAIN_ROUTES must be a valid JSON object.")
  }

  if (
    !parsedValue ||
    typeof parsedValue !== "object" ||
    Array.isArray(parsedValue)
  ) {
    throw new Error("EMAIL_QA_DOMAIN_ROUTES must be a JSON object.")
  }

  for (const [rawDomain, rawDestination] of Object.entries(parsedValue)) {
    const domain = normalizeQaDomain(rawDomain)

    if (routes.has(domain)) {
      throw new Error(
        `EMAIL_QA_DOMAIN_ROUTES contains duplicate domain "${domain}".`,
      )
    }

    routes.set(domain, parseQaDestination(rawDestination, domain))
  }

  return routes
}
