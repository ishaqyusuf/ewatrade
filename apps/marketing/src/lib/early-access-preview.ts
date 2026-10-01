import { getEmailDomain, parseQaDomainRoutes } from "@ewatrade/email"

export type EarlyAccessDevPreview = {
  accessUrl: string
  emailHtml: string
  expiresAt: string
}

type PreviewEnvironment = {
  APP_ENV?: string
  DEV_PROFILE?: string
  EMAIL_QA_DOMAIN_ROUTES?: string
  NODE_ENV?: string
  VERCEL_ENV?: string
}

export function shouldPreviewEarlyAccess(input: {
  email: string
  requestUrl: string
  env?: PreviewEnvironment
}) {
  const env = input.env ?? process.env
  if (
    env.NODE_ENV !== "development" ||
    env.APP_ENV !== "local" ||
    env.DEV_PROFILE !== "local" ||
    env.VERCEL_ENV
  ) {
    return false
  }

  const domain = getEmailDomain(input.email)
  if (!domain.endsWith(".test")) return false

  try {
    const url = new URL(input.requestUrl)
    return (
      ["http:", "https:"].includes(url.protocol) &&
      url.hostname.endsWith(".localhost") &&
      parseQaDomainRoutes(env.EMAIL_QA_DOMAIN_ROUTES).has(domain)
    )
  } catch {
    return false
  }
}
