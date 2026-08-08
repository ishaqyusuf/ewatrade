import { protectCommunicationsActionId } from "@ewatrade/communications"
import {
  PrescriptionFulfillmentError,
  PrescriptionPaymentError,
  PrescriptionRequestError,
  acceptPrescriptionDeliveryQuote,
  acceptPrescriptionPickupQuote,
  attachPrescriptionHostedCheckout,
  createPrescriptionCommunicationIntent,
  createPrescriptionQuickAction,
  getPublicPrescriptionChannel,
  getPublicPrescriptionPaymentStatus,
  getPublicPrescriptionQuote,
  getPublicPrescriptionRequestStatus,
  preparePrescriptionHostedCheckout,
  replacePrescriptionMedia,
  revisePrescriptionQuoteForDelivery,
  submitPublicPrescriptionRequest,
} from "@ewatrade/db/queries"
import {
  enqueuePrescriptionCommunicationDispatch,
  enqueuePrescriptionMediaSafety,
} from "@ewatrade/jobs"
import { getConfiguredHostedPaymentProvider } from "@ewatrade/payments"
import { TRPCError } from "@trpc/server"

import { storePrescriptionMediaUpload } from "../../domains/prescription-media"
import {
  prescriptionDeliverySelectionSchema,
  prescriptionMediaUploadSchema,
  prescriptionPaymentCheckoutSchema,
  prescriptionPaymentStatusSchema,
  prescriptionPublicChannelSchema,
  prescriptionPublicIntakeSchema,
  prescriptionPublicQuoteAcceptSchema,
  prescriptionPublicQuoteSchema,
  prescriptionReuploadSchema,
  prescriptionStatusSchema,
} from "../../schemas/prescriptions"
import { createTRPCRouter, publicProcedure } from "../init"

function publicFailure() {
  return new TRPCError({
    code: "NOT_FOUND",
    message: "This public prescription action is unavailable.",
  })
}

async function runPublic<T>(action: () => Promise<T>) {
  try {
    return await action()
  } catch (error) {
    if (
      error instanceof PrescriptionRequestError ||
      error instanceof PrescriptionPaymentError ||
      error instanceof PrescriptionFulfillmentError
    )
      throw publicFailure()
    throw error
  }
}

async function acceptQuoteWithReviewPay(
  db: Parameters<typeof acceptPrescriptionPickupQuote>[0],
  input: Parameters<typeof acceptPrescriptionPickupQuote>[1],
  fulfilment: "delivery" | "pickup",
) {
  const result = await (fulfilment === "pickup"
    ? acceptPrescriptionPickupQuote(db, input)
    : acceptPrescriptionDeliveryQuote(db, input))
  if (result.notification) {
    const action = await createPrescriptionQuickAction(db, {
      action: "review_and_pay",
      entityId: input.acceptanceToken,
      entityType: "quote_access",
      expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
      storeId: result.notification.storeId,
      tenantId: result.notification.tenantId,
    })
    const intent = await createPrescriptionCommunicationIntent(db, {
      deduplicationKey: `review-pay:${result.orderId}`,
      orderId: result.orderId,
      payload: {
        actions: [
          {
            protectedId: protectCommunicationsActionId(action.actionId),
            title: "Review & pay",
          },
        ],
      },
      recipientReference: result.notification.customerPhone,
      storeId: result.notification.storeId,
      tenantId: result.notification.tenantId,
      type: "quote_ready",
    })
    await enqueuePrescriptionCommunicationDispatch(intent.id)
  }
  return { orderId: result.orderId }
}

export const prescriptionAccessRouter = createTRPCRouter({
  selectDelivery: publicProcedure
    .input(prescriptionDeliverySelectionSchema)
    .mutation(({ ctx, input }) =>
      runPublic(() => revisePrescriptionQuoteForDelivery(ctx.db, input)),
    ),

  acceptDeliveryQuote: publicProcedure
    .input(prescriptionPublicQuoteAcceptSchema)
    .mutation(({ ctx, input }) =>
      runPublic(() => acceptQuoteWithReviewPay(ctx.db, input, "delivery")),
    ),
  createCheckout: publicProcedure
    .input(prescriptionPaymentCheckoutSchema)
    .mutation(({ ctx, input }) =>
      runPublic(async () => {
        const provider = getConfiguredHostedPaymentProvider()
        const prepared = await preparePrescriptionHostedCheckout(ctx.db, {
          ...input,
          provider: provider.key,
        })
        if (prepared.replay) {
          const previous = await ctx.db.prescriptionPaymentIntent.findUnique({
            where: { id: prepared.intentId },
          })
          if (previous?.checkoutUrl) {
            return {
              checkoutUrl: previous.checkoutUrl,
              statusToken: prepared.statusToken,
            }
          }
        }
        const storefrontUrl =
          process.env.STOREFRONT_URL?.replace(/\/$/, "") ??
          "http://ewatrade-storefront.localhost"
        const checkout = await provider.createCheckout({
          amountMinor: prepared.amountMinor,
          callbackUrl: `${storefrontUrl}/prescription-payment/${prepared.statusToken}`,
          currencyCode: prepared.currencyCode,
          customerEmail: prepared.customerEmail,
          metadata: { paymentIntentId: prepared.intentId },
          reference: prepared.providerReference,
        })
        if (checkout.providerReference !== prepared.providerReference) {
          throw new Error("Payment provider returned an unexpected reference.")
        }
        await attachPrescriptionHostedCheckout(ctx.db, {
          checkoutUrl: checkout.checkoutUrl,
          expiresAt: checkout.expiresAt,
          intentId: prepared.intentId,
          providerReference: prepared.providerReference,
        })
        return {
          checkoutUrl: checkout.checkoutUrl,
          statusToken: prepared.statusToken,
        }
      }),
    ),

  paymentStatus: publicProcedure
    .input(prescriptionPaymentStatusSchema)
    .query(({ ctx, input }) =>
      runPublic(() => getPublicPrescriptionPaymentStatus(ctx.db, input)),
    ),
  uploadMedia: publicProcedure
    .input(prescriptionMediaUploadSchema)
    .mutation(async ({ ctx, input }) => {
      if (!input.publicToken || input.storeId) throw publicFailure()
      const publicToken = input.publicToken
      const channel = await runPublic(() =>
        getPublicPrescriptionChannel(ctx.db, {
          publicToken,
        }),
      )
      return storePrescriptionMediaUpload({
        ...input,
        scopeId: channel.channelId,
      })
    }),

  channel: publicProcedure
    .input(prescriptionPublicChannelSchema)
    .query(({ ctx, input }) =>
      runPublic(() => getPublicPrescriptionChannel(ctx.db, input)),
    ),

  quote: publicProcedure
    .input(prescriptionPublicQuoteSchema)
    .query(({ ctx, input }) =>
      runPublic(() => getPublicPrescriptionQuote(ctx.db, input)),
    ),

  acceptPickupQuote: publicProcedure
    .input(prescriptionPublicQuoteAcceptSchema)
    .mutation(({ ctx, input }) =>
      runPublic(() => acceptQuoteWithReviewPay(ctx.db, input, "pickup")),
    ),

  reupload: publicProcedure
    .input(prescriptionReuploadSchema)
    .mutation(({ ctx, input }) =>
      runPublic(async () => {
        const result = await replacePrescriptionMedia(ctx.db, input)
        await enqueuePrescriptionMediaSafety(result.requestId)
        return result
      }),
    ),

  status: publicProcedure
    .input(prescriptionStatusSchema)
    .query(({ ctx, input }) =>
      runPublic(() => getPublicPrescriptionRequestStatus(ctx.db, input)),
    ),

  submit: publicProcedure
    .input(prescriptionPublicIntakeSchema)
    .mutation(({ ctx, input }) =>
      runPublic(async () => {
        const result = await submitPublicPrescriptionRequest(ctx.db, {
          clientRequestId: input.clientRequestId,
          consentAcceptedAt: new Date(),
          consentVersion: input.consentVersion,
          customerEmail: input.customerEmail,
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          fulfilmentPreference: input.fulfilmentPreference,
          media: input.media,
          publicToken: input.publicToken,
        })
        if (result.created) {
          await enqueuePrescriptionMediaSafety(result.requestId)
        }
        return result
      }),
    ),
})
