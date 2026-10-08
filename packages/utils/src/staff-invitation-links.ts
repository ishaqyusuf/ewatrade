import {
  configuredQaDomains,
  isQaAcceleratorClientMode,
} from "./qa-accelerator"

export type StaffInvitationEnvironment = {
  DASHBOARD_URL?: string
  NEXT_PUBLIC_DASHBOARD_URL?: string
  APP_ENV?: string
  DEV_PROFILE?: string
  NODE_ENV?: string
  QA_ACCELERATOR_ENABLED?: string
  EMAIL_QA_DOMAIN_ROUTES?: string
}

export function isQaStaffInvitation(
  email: string,
  environment: StaffInvitationEnvironment,
) {
  const profiles = [environment.APP_ENV, environment.DEV_PROFILE]
    .map((value) => value?.trim().toLowerCase())
    .filter(Boolean)
  if (profiles.some((value) => value === "production" || value === "prod"))
    return false
  const mode = profiles[0] ?? environment.NODE_ENV
  const enabled =
    environment.QA_ACCELERATOR_ENABLED === "true" ||
    (environment.QA_ACCELERATOR_ENABLED === undefined && mode !== "preview")
  const domain = email.trim().toLowerCase().split("@").pop() ?? ""
  return (
    enabled &&
    isQaAcceleratorClientMode(mode) &&
    domain.endsWith(".test") &&
    configuredQaDomains(environment.EMAIL_QA_DOMAIN_ROUTES).has(domain)
  )
}

/** Staff invitations always open the public dashboard website. */
export function buildStaffInvitationLinks(
  environment: StaffInvitationEnvironment,
  token: string | null | undefined,
) {
  const appUrl = new URL(
    environment.DASHBOARD_URL ??
      environment.NEXT_PUBLIC_DASHBOARD_URL ??
      "https://dash.ewatrade.com",
  )
  const inviteUrl = new URL(appUrl)
  if (token) {
    inviteUrl.pathname = "/staff-onboarding"
    inviteUrl.search = ""
    inviteUrl.hash = ""
    inviteUrl.searchParams.set("inviteToken", token)
  }
  return { appUrl: appUrl.toString(), inviteUrl: inviteUrl.toString() }
}
