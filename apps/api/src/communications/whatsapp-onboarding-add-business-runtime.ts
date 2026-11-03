import type { PrismaClient } from "@ewatrade/db"
import {
  createAssistantWhatsAppOnboardingBusiness,
  readAssistantWhatsAppAddBusinessAccount,
} from "@ewatrade/db/assistant-whatsapp"
import {
  OwnerBusinessAgeError,
  RetailOpsSubscriptionError,
} from "@ewatrade/db/queries"
import { createBusinessSchema } from "../schemas/tenant"
import type { WhatsAppAddBusinessAdapter } from "./whatsapp-onboarding-add-business"

const unavailable =
  "We could not create the business. Nothing was changed. Try again later, or add it in the EwaTrade app."

/**
 * Production Add business adapter. Input passes the app's own create-business
 * schema, then the canonical owner-business command runs for the linked account
 * after fresh email proof, under this sender's current onboarding lease.
 */
export function whatsAppAddBusinessProductionAdapter(
  db: PrismaClient,
  address: { phoneNumberId: string; senderId: string },
  lease: { token: string; nonce: string },
  now: () => Date,
): WhatsAppAddBusinessAdapter {
  return {
    account: () => readAssistantWhatsAppAddBusinessAccount(db, address, now()),
    create: async ({ userId, sessionId, business, operationId }) => {
      const parsed = createBusinessSchema.safeParse({
        addressLine1: business.addressLine1,
        businessName: business.businessName,
        city: business.city,
        countryCode: business.countryCode ?? undefined,
        currencyCode: business.currencyCode,
        onboarding: business.countryCode
          ? { countryCode: business.countryCode }
          : {},
        supportPhone: business.phone,
      })
      if (!parsed.success)
        return {
          kind: "rejected",
          message:
            "Some business details are not valid. Nothing was created. Send ADD BUSINESS to start again.",
        }
      try {
        const choice = await createAssistantWhatsAppOnboardingBusiness(
          db,
          {
            userId,
            sessionId,
            ...address,
            operationId,
            onboardingLease: lease,
            business: {
              addressLine1: parsed.data.addressLine1,
              businessName: parsed.data.businessName,
              city: parsed.data.city,
              countryCode: parsed.data.countryCode ?? null,
              currencyCode: parsed.data.currencyCode,
              phone: parsed.data.supportPhone,
              onboarding: { countryCode: parsed.data.onboarding.countryCode },
            },
          },
          now(),
        )
        return { kind: "created", choice }
      } catch (error) {
        if (error instanceof RetailOpsSubscriptionError)
          return {
            kind: "rejected",
            message: `${error.publicMessage} Nothing was created.`,
          }
        if (error instanceof OwnerBusinessAgeError)
          return {
            kind: "rejected",
            message:
              "Choose an eligible age range in the EwaTrade app before creating a business. Nothing was created.",
          }
        return { kind: "rejected", message: unavailable }
      }
    },
  }
}
