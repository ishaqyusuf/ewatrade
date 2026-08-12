import type { Prisma } from "../../generated/prisma/client"
import {
  CatalogRecordStatus,
  OfferingPricingPolicy,
} from "../../generated/prisma/enums"

export const publicServiceRequestFormInclude = {
  offerings: {
    include: {
      offering: {
        include: {
          catalogItem: true,
          serviceOffering: true,
          storeAvailability: true,
          variant: true,
        },
      },
    },
  },
  store: { select: { currencyCode: true, name: true } },
} satisfies Prisma.ServiceRequestFormInclude

type PublicServiceRequestFormRow = Prisma.ServiceRequestFormGetPayload<{
  include: typeof publicServiceRequestFormInclude
}>

export function projectPublicServiceRequestForm(
  form: PublicServiceRequestFormRow,
) {
  return {
    formId: form.id,
    label: form.label,
    offerings: form.offerings.flatMap(({ offering }) => {
      const available = offering.storeAvailability.some(
        (row) => row.storeId === form.storeId && row.isAvailable,
      )
      if (
        !available ||
        offering.status !== CatalogRecordStatus.ACTIVE ||
        !offering.serviceOffering
      ) {
        return []
      }
      return [
        {
          catalogItemName: offering.catalogItem.name,
          fixedPriceMinor: offering.fixedPriceMinor,
          guidance: offering.serviceOffering.guidance,
          id: offering.id,
          name: offering.name,
          pricingPolicy:
            offering.pricingPolicy === OfferingPricingPolicy.FIXED
              ? ("fixed" as const)
              : ("quote_required" as const),
          quantityScale: offering.serviceOffering.quantityScale,
          variantName: offering.variant.name,
        },
      ]
    }),
    store: form.store,
  }
}
