import type { Prisma } from "../../generated/prisma/client"
import { CatalogRecordStatus } from "../../generated/prisma/enums"
import { saleEligibleCatalogItem } from "./product-usage"

type CatalogLine = {
  offeringId: string
  progressiveAvailabilityAttestationId?: string
}

/** Lazy, transaction-local batches; eligibility and validation stay per input line. */
export function commercialOrderOfferingResolver(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; storeId: string; lines: CatalogLine[] },
) {
  const idsByMode = new Map<boolean, Set<string>>()
  for (const line of input.lines) {
    const progressive = Boolean(line.progressiveAvailabilityAttestationId)
    const ids = idsByMode.get(progressive) ?? new Set<string>()
    ids.add(line.offeringId)
    idsByMode.set(progressive, ids)
  }
  const load = async (progressive: boolean) => {
    const offerings = await tx.sellableOffering.findMany({
      include: {
        catalogItem: { select: { id: true, name: true } },
        productUnitOffering: { include: { inventoryUnit: true } },
        serviceOffering: true,
        storeAvailability: { where: { storeId: input.storeId } },
        variant: {
          include: {
            selections: { include: { group: true, value: true } },
          },
        },
      },
      where: {
        id: { in: [...(idsByMode.get(progressive) ?? [])] },
        catalogItem: saleEligibleCatalogItem,
        status: progressive
          ? { in: [CatalogRecordStatus.ACTIVE, CatalogRecordStatus.DRAFT] }
          : CatalogRecordStatus.ACTIVE,
        tenantId: input.tenantId,
      },
    })
    return new Map(offerings.map((offering) => [offering.id, offering]))
  }
  const batches = new Map<boolean, ReturnType<typeof load>>()
  return async (line: CatalogLine) => {
    const progressive = Boolean(line.progressiveAvailabilityAttestationId)
    let batch = batches.get(progressive)
    if (!batch) {
      batch = load(progressive)
      batches.set(progressive, batch)
    }
    return (await batch).get(line.offeringId) ?? null
  }
}
