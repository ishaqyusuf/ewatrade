import { EWATRADE_TRIGGER_TARGETS } from "./release-trigger-target.mjs"

export { EWATRADE_TRIGGER_TARGETS }

/** Production alias retained for existing production-only release consumers. */
export const EWATRADE_TRIGGER_TARGET = {
  organizationId: EWATRADE_TRIGGER_TARGETS.organizationId,
  organizationSlug: EWATRADE_TRIGGER_TARGETS.organizationSlug,
  projectRef: EWATRADE_TRIGGER_TARGETS.production.projectRef,
  projectSlug: EWATRADE_TRIGGER_TARGETS.production.projectSlug,
} as const
