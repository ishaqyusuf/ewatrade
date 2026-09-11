import {
  protectCommunicationsEndpoint,
  protectCommunicationsRecipient,
} from "@ewatrade/communications"
import {
  acknowledgeStoreConversationAccountProgress,
  confirmGuestStoreConversationNotificationContact,
  getStoreConversationAccountNotificationPreference,
  listGuestStoreConversationNotificationContacts,
  registerAccountStoreConversationPushEndpoint,
  registerGuestStoreConversationPushEndpoint,
  requestGuestStoreConversationNotificationVerification,
  revokeAccountStoreConversationPushEndpoint,
  revokeGuestStoreConversationNotificationContact,
  revokeGuestStoreConversationPushEndpoint,
  subscribeAccountStoreConversationReopening,
  subscribeGuestStoreConversationReopening,
  updateStoreConversationAccountNotificationPreference,
} from "@ewatrade/db/queries"
import { enqueueStoreConversationNotificationVerification } from "@ewatrade/jobs"
import {
  type StoreConversationPushEndpointInput,
  storeConversationAccountNotificationPreferenceInputSchema,
  storeConversationMobileReadAcknowledgementInputSchema,
  storeConversationNotificationContactConfirmInputSchema,
  storeConversationNotificationContactListInputSchema,
  storeConversationNotificationContactRequestInputSchema,
  storeConversationNotificationContactRevokeInputSchema,
  storeConversationNotifyWhenAvailableInputSchema,
  storeConversationPushEndpointInputSchema,
  storeConversationPushEndpointRevokeInputSchema,
} from "@ewatrade/service-commerce"
import {
  digestStoreConversationNotificationVerificationCode,
  digestStoreConversationPushEndpoint,
  prepareStoreConversationNotificationVerification,
  serializeStoreConversationPushEndpoint,
} from "@ewatrade/service-commerce/server"

import {
  authenticatedProcedure,
  createTRPCRouter,
  publicProcedure,
} from "../../init"
import {
  customerCredential,
  customerInstallation,
  mapCustomerConversationError,
} from "./customer-conversation-auth"

function mobileDevice(installationToken: string) {
  return { installationToken, purpose: "MOBILE_DEVICE" as const }
}

function protectPushEndpoint(input: StoreConversationPushEndpointInput) {
  const serialized = serializeStoreConversationPushEndpoint(
    input.kind === "native_expo"
      ? { expoPushToken: input.expoPushToken, kind: input.kind }
      : {
          auth: input.auth,
          endpoint: input.endpoint,
          kind: input.kind,
          p256dh: input.p256dh,
        },
  )
  return {
    endpointCiphertext: protectCommunicationsEndpoint(serialized),
    endpointDigest: digestStoreConversationPushEndpoint(serialized),
  }
}

export const serviceCommerceCustomerNotificationsRouter = createTRPCRouter({
  accountStoreConversationNotificationPreference: authenticatedProcedure.query(
    async ({ ctx }) => {
      try {
        return await getStoreConversationAccountNotificationPreference(ctx.db, {
          accountUserId: ctx.session.user.id,
        })
      } catch (error) {
        mapCustomerConversationError(error)
      }
    },
  ),

  acknowledgeAccountStoreConversationProgress: authenticatedProcedure
    .input(storeConversationMobileReadAcknowledgementInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await acknowledgeStoreConversationAccountProgress(ctx.db, {
          ...input,
          accountUserId: ctx.session.user.id,
        })
      } catch (error) {
        mapCustomerConversationError(error)
      }
    }),

  confirmMobileStoreConversationNotificationContact: publicProcedure
    .input(storeConversationNotificationContactConfirmInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await confirmGuestStoreConversationNotificationContact(
          ctx.db,
          {
            ...input,
            codeDigest: digestStoreConversationNotificationVerificationCode({
              code: input.code,
              verificationId: input.verificationId,
            }),
            credentialToken: customerCredential(
              ctx.customerConversationCredential,
            ),
          },
          mobileDevice(
            customerInstallation(ctx.customerConversationInstallation),
          ),
        )
      } catch (error) {
        mapCustomerConversationError(error)
      }
    }),

  listMobileStoreConversationNotificationContacts: publicProcedure
    .input(storeConversationNotificationContactListInputSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await listGuestStoreConversationNotificationContacts(
          ctx.db,
          {
            ...input,
            credentialToken: customerCredential(
              ctx.customerConversationCredential,
            ),
          },
          mobileDevice(
            customerInstallation(ctx.customerConversationInstallation),
          ),
        )
      } catch (error) {
        mapCustomerConversationError(error)
      }
    }),

  registerAccountStoreConversationPushEndpoint: authenticatedProcedure
    .input(storeConversationPushEndpointInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await registerAccountStoreConversationPushEndpoint(ctx.db, {
          ...input,
          ...protectPushEndpoint(input),
          accountUserId: ctx.session.user.id,
        })
      } catch (error) {
        mapCustomerConversationError(error)
      }
    }),

  registerMobileStoreConversationPushEndpoint: publicProcedure
    .input(storeConversationPushEndpointInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await registerGuestStoreConversationPushEndpoint(
          ctx.db,
          {
            ...input,
            ...protectPushEndpoint(input),
            credentialToken: customerCredential(
              ctx.customerConversationCredential,
            ),
          },
          mobileDevice(
            customerInstallation(ctx.customerConversationInstallation),
          ),
        )
      } catch (error) {
        mapCustomerConversationError(error)
      }
    }),

  requestMobileStoreConversationNotificationVerification: publicProcedure
    .input(storeConversationNotificationContactRequestInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const verification = prepareStoreConversationNotificationVerification(
          { channel: input.channel, destination: input.destination },
          { protectDestination: protectCommunicationsRecipient },
        )
        const result =
          await requestGuestStoreConversationNotificationVerification(
            ctx.db,
            {
              ...input,
              ...verification,
              credentialToken: customerCredential(
                ctx.customerConversationCredential,
              ),
            },
            mobileDevice(
              customerInstallation(ctx.customerConversationInstallation),
            ),
          )
        await enqueueStoreConversationNotificationVerification(result.dispatch)
        return {
          contact: result.contact,
          expiresAt: result.expiresAt,
          replayed: result.replayed,
          verificationId: result.verificationId,
        }
      } catch (error) {
        mapCustomerConversationError(error)
      }
    }),

  revokeAccountStoreConversationPushEndpoint: authenticatedProcedure
    .input(storeConversationPushEndpointRevokeInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await revokeAccountStoreConversationPushEndpoint(ctx.db, {
          ...input,
          accountUserId: ctx.session.user.id,
        })
      } catch (error) {
        mapCustomerConversationError(error)
      }
    }),

  revokeMobileStoreConversationNotificationContact: publicProcedure
    .input(storeConversationNotificationContactRevokeInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await revokeGuestStoreConversationNotificationContact(
          ctx.db,
          {
            ...input,
            credentialToken: customerCredential(
              ctx.customerConversationCredential,
            ),
          },
          mobileDevice(
            customerInstallation(ctx.customerConversationInstallation),
          ),
        )
      } catch (error) {
        mapCustomerConversationError(error)
      }
    }),

  revokeMobileStoreConversationPushEndpoint: publicProcedure
    .input(storeConversationPushEndpointRevokeInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await revokeGuestStoreConversationPushEndpoint(
          ctx.db,
          {
            ...input,
            credentialToken: customerCredential(
              ctx.customerConversationCredential,
            ),
          },
          mobileDevice(
            customerInstallation(ctx.customerConversationInstallation),
          ),
        )
      } catch (error) {
        mapCustomerConversationError(error)
      }
    }),

  subscribeAccountStoreConversationReopening: authenticatedProcedure
    .input(storeConversationNotifyWhenAvailableInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await subscribeAccountStoreConversationReopening(ctx.db, {
          ...input,
          accountUserId: ctx.session.user.id,
        })
      } catch (error) {
        mapCustomerConversationError(error)
      }
    }),

  subscribeMobileStoreConversationReopening: publicProcedure
    .input(storeConversationNotifyWhenAvailableInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await subscribeGuestStoreConversationReopening(
          ctx.db,
          {
            ...input,
            credentialToken: customerCredential(
              ctx.customerConversationCredential,
            ),
          },
          mobileDevice(
            customerInstallation(ctx.customerConversationInstallation),
          ),
        )
      } catch (error) {
        mapCustomerConversationError(error)
      }
    }),

  updateAccountStoreConversationNotificationPreference: authenticatedProcedure
    .input(storeConversationAccountNotificationPreferenceInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await updateStoreConversationAccountNotificationPreference(
          ctx.db,
          { ...input, accountUserId: ctx.session.user.id },
        )
      } catch (error) {
        mapCustomerConversationError(error)
      }
    }),
})
