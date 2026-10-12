import { CommerceQuoteSourceType } from "../../generated/prisma/enums"
import { ServiceIntakeReviewError } from "./service-intake-review"

/** Commercial service authority never grants access to the clinical workflow. */
export function assertNonClinicalServiceWorkOrder(order: {
  acceptedCommerceQuoteVersion: { quote: { sourceType: string } } | null
  prescriptionPickupFulfillment: { id: string } | null
  prescriptionDeliveryAddress: { id: string } | null
  _count: { prescriptionPaymentIntents: number }
}) {
  if (
    order.acceptedCommerceQuoteVersion?.quote.sourceType ===
      CommerceQuoteSourceType.PRESCRIPTION_REQUEST ||
    order.prescriptionPickupFulfillment ||
    order.prescriptionDeliveryAddress ||
    order._count.prescriptionPaymentIntents > 0
  )
    throw new ServiceIntakeReviewError(
      "CONFLICT",
      "Clinical service records require their separate native workflow.",
    )
}
