/**
 * Non-secret Trigger ownership identifiers shared with Node tooling. The
 * organization fields describe Production (Zeroes & One); Preview still lives
 * in the School Clerk organization.
 */
export const EWATRADE_TRIGGER_TARGETS = Object.freeze({
  organizationId: "cmv56r6n3001vmw0i4y43rqtv",
  organizationSlug: "zeroes-one-9521",
  production: Object.freeze({
    projectRef: "proj_ahtovhgtjjkctpakuwjz",
    projectSlug: "ewatrade-kERp",
    providerEnvironment: "prod",
  }),
  preview: Object.freeze({
    projectRef: "proj_hymzhteicvpixaksoyqk",
    projectSlug: "ewatrade-preview--AiL",
    providerEnvironment: "prod",
  }),
})
