import { ServiceRequestFormStatus } from "../../generated/prisma/enums"
import {
  projectPublicServiceRequestForm,
  publicServiceRequestFormInclude,
} from "./service-public-projection"
import type { DbClient } from "./types"

/** A merchant's active intake form is independent of conversation channel mode. */
export async function getStorefrontServiceForm(
  db: DbClient,
  scope: { tenantId: string; storeId: string },
) {
  const now = new Date()
  const form = await db.serviceRequestForm.findFirst({
    where: {
      ...scope,
      status: ServiceRequestFormStatus.ACTIVE,
      AND: [
        { OR: [{ activeFrom: null }, { activeFrom: { lte: now } }] },
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      ],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: {
      ...publicServiceRequestFormInclude,
      offerings: {
        ...publicServiceRequestFormInclude.offerings,
        take: 100,
        orderBy: { id: "asc" },
        where: {
          offering: {
            tenantId: scope.tenantId,
            kind: "SERVICE",
            status: "ACTIVE",
            archivedAt: null,
            catalogItem: {
              systemRole: null,
              tenantId: scope.tenantId,
              kind: "SERVICE",
              status: "ACTIVE",
              archivedAt: null,
            },
            variant: { status: "ACTIVE", archivedAt: null },
            storeAvailability: {
              some: { storeId: scope.storeId, isAvailable: true },
            },
          },
        },
      },
    },
  })
  if (!form) return null
  const items = new Map(
    form.offerings.map((row) => [row.offeringId, row.offering.catalogItemId]),
  )
  const projection = projectPublicServiceRequestForm(form)
  return {
    ...projection,
    offerings: projection.offerings.flatMap((offering) => {
      const catalogItemId = items.get(offering.id)
      return catalogItemId ? [{ ...offering, catalogItemId }] : []
    }),
  }
}

/** Advisory navigation only; the destination and command recheck publication and scope. */
export async function getStorefrontServiceRequestEntry(
  db: DbClient,
  scope: { tenantId: string; storeId: string },
) {
  const form = await getStorefrontServiceForm(db, scope)
  return form?.offerings.length
    ? {
        formId: form.formId,
        offeringIds: form.offerings.map((offering) => offering.id),
      }
    : null
}
