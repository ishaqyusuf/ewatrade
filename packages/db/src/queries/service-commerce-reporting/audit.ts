import type { ServiceCommerceReportDrilldownSection } from "@ewatrade/service-commerce"

import type { PrismaClient } from "../../../generated/prisma/client"
import {
  MembershipStatus,
  ServiceCommerceReportReadDenialReason,
  ServiceCommerceReportReadKind,
  ServiceCommerceReportReadOutcome,
  ServiceCommerceReportReadSource,
  ServiceCommerceReportDrilldownSection as StoredDrilldownSection,
} from "../../../generated/prisma/enums"

const reportManagers = new Set(["OWNER", "ADMIN", "MANAGER"])

const storedDrilldownSections = {
  catalog: StoredDrilldownSection.CATALOG,
  costs: StoredDrilldownSection.COSTS,
  lifecycle: StoredDrilldownSection.LIFECYCLE,
  media: StoredDrilldownSection.MEDIA,
  reliability: StoredDrilldownSection.RELIABILITY,
} satisfies Record<
  ServiceCommerceReportDrilldownSection,
  StoredDrilldownSection
>

type ReportReadAccessInput = {
  actorUserId: string
  category?: ServiceCommerceReportDrilldownSection
  end: Date
  kind: "report" | "drilldown"
  start: Date
  storeId?: string
  tenantId: string
}

function kindFor(input: ReportReadAccessInput) {
  return input.kind === "report"
    ? ServiceCommerceReportReadKind.REPORT
    : ServiceCommerceReportReadKind.DRILLDOWN
}

function purposeFor(input: ReportReadAccessInput) {
  return input.kind === "report"
    ? "service_commerce_report_read"
    : "service_commerce_report_drilldown_read"
}

async function appendReportReadAudit(
  db: PrismaClient,
  input: ReportReadAccessInput & {
    denialReason?: ServiceCommerceReportReadDenialReason
    outcome: ServiceCommerceReportReadOutcome
    validatedStoreId?: string
  },
) {
  await db.serviceCommerceReportReadAuditEvent.create({
    data: {
      actorUserId: input.actorUserId,
      denialReason: input.denialReason,
      drilldownSection: input.category
        ? storedDrilldownSections[input.category]
        : undefined,
      kind: kindFor(input),
      outcome: input.outcome,
      purpose: purposeFor(input),
      reportEnd: input.end,
      reportStart: input.start,
      source: ServiceCommerceReportReadSource.SERVICE_COMMERCE_REPORTING,
      storeId: input.validatedStoreId,
      tenantId: input.tenantId,
    },
  })
}

/**
 * Reauthorizes every sensitive aggregate read at the repository boundary and
 * appends safe audit evidence before any report rows are queried or returned.
 * A caller-supplied Store id is never persisted until it is proven to belong
 * to the authenticated Tenant.
 */
export async function authorizeServiceCommerceReportRead(
  db: PrismaClient,
  input: ReportReadAccessInput,
) {
  const membership = await db.membership.findFirst({
    select: { id: true, role: true },
    where: {
      acceptedAt: { not: null },
      status: MembershipStatus.ACTIVE,
      tenantId: input.tenantId,
      userId: input.actorUserId,
    },
  })
  if (!membership || !reportManagers.has(membership.role)) {
    await appendReportReadAudit(db, {
      ...input,
      denialReason: ServiceCommerceReportReadDenialReason.ACCESS_FORBIDDEN,
      outcome: ServiceCommerceReportReadOutcome.DENIED,
    })
    throw new Error("REPORT_ACCESS_FORBIDDEN")
  }

  let validatedStoreId: string | undefined
  if (input.storeId) {
    const store = await db.store.findFirst({
      select: { id: true },
      where: { id: input.storeId, tenantId: input.tenantId },
    })
    if (!store) {
      await appendReportReadAudit(db, {
        ...input,
        denialReason: ServiceCommerceReportReadDenialReason.STORE_NOT_FOUND,
        outcome: ServiceCommerceReportReadOutcome.DENIED,
      })
      throw new Error("REPORT_STORE_NOT_FOUND")
    }
    validatedStoreId = store.id
  }

  await appendReportReadAudit(db, {
    ...input,
    outcome: ServiceCommerceReportReadOutcome.ALLOWED,
    validatedStoreId,
  })
  return { storeId: validatedStoreId }
}
