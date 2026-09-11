import { createHash } from "node:crypto"

import {
  type ServiceCommerceCustomerActionExecutionResult,
  serviceCommerceCustomerActionExecutionResultSchema,
} from "./schemas/action"

type PrescriptionCheckoutInput = {
  acceptanceToken: string
  clientPaymentId: string
  statusToken: string
}

type PrescriptionCheckoutResult = {
  checkoutUrl: string
  statusToken: string
}

export class StoreConversationActionHandoffError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "StoreConversationActionHandoffError"
  }
}

function checkoutIdentity(
  prefix: string,
  value: string,
  encoding: "hex" | "base64url",
) {
  return `${prefix}:${createHash("sha256").update(value).digest(encoding)}`
}

export async function completeStoreConversationActionHandoff(
  input: {
    capabilityToken: string
    clientOperationId: string
    result: ServiceCommerceCustomerActionExecutionResult
  },
  dependencies: {
    createPrescriptionCheckout: (
      input: PrescriptionCheckoutInput,
    ) => Promise<PrescriptionCheckoutResult>
  },
): Promise<ServiceCommerceCustomerActionExecutionResult> {
  if (input.result.kind !== "checkout") return input.result
  if (input.result.sourceKind !== "prescription") {
    throw new Error("This checkout action is not implemented safely.")
  }
  let checkout: PrescriptionCheckoutResult
  try {
    checkout = await dependencies.createPrescriptionCheckout({
      acceptanceToken: input.capabilityToken,
      clientPaymentId: checkoutIdentity(
        "store-conversation-payment",
        input.clientOperationId,
        "hex",
      ),
      statusToken: checkoutIdentity(
        "store-conversation-payment-status",
        input.capabilityToken,
        "base64url",
      ),
    })
  } catch {
    throw new StoreConversationActionHandoffError(
      "Checkout is temporarily unavailable. Try again.",
    )
  }
  return serviceCommerceCustomerActionExecutionResultSchema.parse({
    ...input.result,
    checkoutUrl: checkout.checkoutUrl,
  })
}
