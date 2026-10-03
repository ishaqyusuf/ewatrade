export const EWATRADE_TRIGGER_TARGETS: Readonly<{
  organizationId: string
  organizationSlug: string
  production: Readonly<{
    projectRef: string
    projectSlug: string
    providerEnvironment: "prod"
  }>
  preview: Readonly<{
    projectRef: string
    projectSlug: string
    providerEnvironment: "prod"
  }>
}>
