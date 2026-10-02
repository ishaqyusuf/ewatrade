import { randomUUID } from "node:crypto"
import { getEmailDomain, parseQaDomainRoutes } from "@ewatrade/email"
import { withQaWorkspaceSuffix } from "@ewatrade/utils"

export function createSignupWorkspaceSlug(businessName: string) {
  const base =
    businessName
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 20)
      .replace(/-+$/g, "") || "business"
  // Leave room for the QA suffix and retain all eight random characters.
  return `${base}-${randomUUID().replaceAll("-", "").slice(0, 8)}`
}

export function resolveSignupWorkspace(input: {
  slug: string
  email?: string
  env?: { EMAIL_QA_DOMAIN_ROUTES?: string }
}) {
  const routes = parseQaDomainRoutes(
    (input.env ?? process.env).EMAIL_QA_DOMAIN_ROUTES,
  )
  const domain = getEmailDomain(input.email ?? "")
  const qaSourceDomain = routes.has(domain) ? domain : null
  if (domain.endsWith(".test") && !qaSourceDomain) {
    throw new Error("This QA email domain is not configured.")
  }
  return {
    slug: withQaWorkspaceSuffix(input.slug, Boolean(qaSourceDomain)),
    qaSourceDomain,
  }
}
