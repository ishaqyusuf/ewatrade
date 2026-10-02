import { getEmailDomain, parseQaDomainRoutes } from "@ewatrade/email"

export type EarlyAccessQaPreview = {
  emailSent?: boolean
  stage?: "approval" | "verification"
  accessUrl: string
  emailHtml: string
  expiresAt: string
}

type PreviewEnvironment = {
  EMAIL_QA_DOMAIN_ROUTES?: string
}

export function shouldPreviewEarlyAccess(input: {
  email: string
  env?: PreviewEnvironment
}) {
  const env = input.env ?? process.env
  const domain = getEmailDomain(input.email)
  if (!domain.endsWith(".test")) return false

  try {
    return parseQaDomainRoutes(env.EMAIL_QA_DOMAIN_ROUTES).has(domain)
  } catch {
    return false
  }
}
