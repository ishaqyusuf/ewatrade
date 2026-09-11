import { issueServiceCommerceCustomerActionToken } from "@ewatrade/communications"
import {
  acknowledgeMobileStoreConversationProgress,
  bootstrapMobileStoreConversation,
  claimMobileStoreConversationTransfer,
  createPrescriptionHostedCheckoutRepository,
  createStoreConversationPrivacyRequest,
  dismissGuestStoreConversationAccountInvitation,
  executeAccountStoreConversationActionMessage,
  executeMobileStoreConversationActionMessage,
  getAccountStoreConversationMessagesAfter,
  getAccountStoreConversationTimeline,
  getMobileStoreConversationMessagesAfter,
  getMobileStoreConversationTimeline,
  getStoreConversationPrivacyRequest,
  issueStoreConversationWhatsAppBridge,
  linkGuestStoreConversationsToAccount,
  listGuestStoreConversationAccountCandidates,
  listMobileStoreConversations,
  listStoreConversationAccountConversations,
  listStoreConversationAccountDevices,
  previewAccountStoreConversationActionMessage,
  previewMobileStoreConversationActionMessage,
  projectStoreConversationWhatsAppBridgeIssue,
  redeemMobileStoreConversationTransfer,
  revokeStoreConversationAccountDevice,
  rotateStoreConversationGuestCredential,
  selectMobileStoreConversationRequest,
  sendAccountStoreConversationText,
  sendMobileStoreConversationText,
} from "@ewatrade/db/queries"
import { enqueueStoreConversationPrivacyRequest } from "@ewatrade/jobs"
import {
  createPrescriptionHostedCheckoutHandoff,
  getConfiguredHostedPaymentProvider,
} from "@ewatrade/payments"
import {
  storeConversationAccountCandidateListInputSchema,
  storeConversationAccountDeviceListInputSchema,
  storeConversationAccountDeviceRevokeInputSchema,
  storeConversationAccountInvitationDismissInputSchema,
  storeConversationAccountLinkInputSchema,
  storeConversationAccountPrivacyRequestInputSchema,
  storeConversationAttachmentCapabilityInputSchema,
  storeConversationCustomerVoiceNoteGrantInputSchema,
  storeConversationGuestCredentialRotationInputSchema,
  storeConversationGuestPrivacyRequestInputSchema,
  storeConversationMobileBootstrapInputSchema,
  storeConversationMobileListInputSchema,
  storeConversationMobileMessagesAfterInputSchema,
  storeConversationMobileReadAcknowledgementInputSchema,
  storeConversationMobileSendTextInputSchema,
  storeConversationMobileTimelineInputSchema,
  storeConversationPrivacyRequestStatusInputSchema,
  storeConversationQuoteActionExecuteInputSchema,
  storeConversationQuoteActionPreviewInputSchema,
  storeConversationSelectRequestInputSchema,
  storeConversationTransferClaimInputSchema,
  storeConversationTransferRedeemInputSchema,
  storeConversationWhatsAppBridgeIssueInputSchema,
} from "@ewatrade/service-commerce"
import {
  completeStoreConversationActionHandoff,
  storeConversationWhatsAppBridgeTokenDigest,
} from "@ewatrade/service-commerce/server"
import { TRPCError } from "@trpc/server"
import {
  StoreConversationAttachmentViewerUnavailableError,
  issueGuestStoreConversationVoiceNoteGrant,
} from "../../../service-commerce/conversation-attachment-viewer"
import {
  StoreConversationAttachmentTransportError,
  resolveStoreConversationAttachmentCapability,
} from "../../../service-commerce/conversation-attachments"

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

export const serviceCommerceCustomerConversationsRouter = createTRPCRouter({
  accountCreateStoreConversationPrivacyRequest: authenticatedProcedure
    .input(storeConversationAccountPrivacyRequestInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const request = await createStoreConversationPrivacyRequest(
          ctx.db,
          input,
          { accountUserId: ctx.session.user.id, kind: "account" },
        )
        await enqueueStoreConversationPrivacyRequest(request.id)
        return request
      } catch (error) {
        mapCustomerConversationError(error)
      }
    }),

  accountStoreConversationPrivacyRequest: authenticatedProcedure
    .input(storeConversationPrivacyRequestStatusInputSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await getStoreConversationPrivacyRequest(ctx.db, input, {
          accountUserId: ctx.session.user.id,
          kind: "account",
        })
      } catch (error) {
        mapCustomerConversationError(error)
      }
    }),

  accountIssueStoreConversationWhatsAppBridge: authenticatedProcedure
    .input(storeConversationWhatsAppBridgeIssueInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await issueStoreConversationWhatsAppBridge(ctx.db, {
          bridgeTokenDigest: storeConversationWhatsAppBridgeTokenDigest(
            input.bridgeToken,
          ),
          clientOperationId: input.clientOperationId,
          conversationId: input.conversationId,
          principal: {
            accountUserId: ctx.session.user.id,
            kind: "account",
          },
          publicToken: input.publicToken,
        })
        return projectStoreConversationWhatsAppBridgeIssue({
          bridgeToken: input.bridgeToken,
          displayNumber: result.displayNumber,
          expiresAt: result.expiresAt,
          replayed: result.replayed,
        })
      } catch (error) {
        mapCustomerConversationError(error)
      }
    }),

  accountStoreConversationMessagesAfter: authenticatedProcedure
    .input(storeConversationMobileMessagesAfterInputSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await getAccountStoreConversationMessagesAfter(
          ctx.db,
          { ...input, accountUserId: ctx.session.user.id },
          { issueCapabilityToken: issueServiceCommerceCustomerActionToken },
        )
      } catch (error) {
        mapCustomerConversationError(error)
      }
    }),

  accountExecuteStoreConversationAction: authenticatedProcedure
    .input(storeConversationQuoteActionExecuteInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await executeAccountStoreConversationActionMessage(
          ctx.db,
          { ...input, accountUserId: ctx.session.user.id },
        )
        return await completeStoreConversationActionHandoff(
          {
            capabilityToken: input.capabilityToken,
            clientOperationId: input.clientOperationId,
            result,
          },
          {
            createPrescriptionCheckout: (checkoutInput) =>
              createPrescriptionHostedCheckoutHandoff(checkoutInput, {
                ...createPrescriptionHostedCheckoutRepository(ctx.db),
                provider: getConfiguredHostedPaymentProvider(),
              }),
          },
        )
      } catch (error) {
        mapCustomerConversationError(error)
      }
    }),

  accountPreviewStoreConversationAction: authenticatedProcedure
    .input(storeConversationQuoteActionPreviewInputSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await previewAccountStoreConversationActionMessage(
          ctx.db,
          { ...input, accountUserId: ctx.session.user.id },
          { issueCapabilityToken: issueServiceCommerceCustomerActionToken },
        )
      } catch (error) {
        mapCustomerConversationError(error)
      }
    }),

  accountSendStoreConversationText: authenticatedProcedure
    .input(storeConversationMobileSendTextInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await sendAccountStoreConversationText(ctx.db, {
          ...input,
          accountUserId: ctx.session.user.id,
          channel: "mobile",
        })
      } catch (error) {
        mapCustomerConversationError(error)
      }
    }),

  accountStoreConversationTimeline: authenticatedProcedure
    .input(storeConversationMobileTimelineInputSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await getAccountStoreConversationTimeline(
          ctx.db,
          { ...input, accountUserId: ctx.session.user.id },
          { issueCapabilityToken: issueServiceCommerceCustomerActionToken },
        )
      } catch (error) {
        mapCustomerConversationError(error)
      }
    }),

  accountStoreConversations: authenticatedProcedure
    .input(storeConversationAccountCandidateListInputSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await listStoreConversationAccountConversations(ctx.db, {
          ...input,
          accountUserId: ctx.session.user.id,
        })
      } catch (error) {
        mapCustomerConversationError(error)
      }
    }),

  dismissMobileStoreConversationAccountInvitation: publicProcedure
    .input(storeConversationAccountInvitationDismissInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await dismissGuestStoreConversationAccountInvitation(ctx.db, {
          ...input,
          credentialToken: customerCredential(
            ctx.customerConversationCredential,
          ),
          installationToken: customerInstallation(
            ctx.customerConversationInstallation,
          ),
          purpose: "MOBILE_DEVICE",
        })
      } catch (error) {
        mapCustomerConversationError(error)
      }
    }),

  linkMobileStoreConversationsToAccount: authenticatedProcedure
    .input(storeConversationAccountLinkInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await linkGuestStoreConversationsToAccount(ctx.db, {
          ...input,
          accountUserId: ctx.session.user.id,
          credentialToken: customerCredential(
            ctx.customerConversationCredential,
          ),
          installationToken: customerInstallation(
            ctx.customerConversationInstallation,
          ),
          purpose: "MOBILE_DEVICE",
        })
      } catch (error) {
        mapCustomerConversationError(error)
      }
    }),

  mobileStoreConversationAccountCandidates: authenticatedProcedure
    .input(storeConversationAccountCandidateListInputSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await listGuestStoreConversationAccountCandidates(ctx.db, {
          ...input,
          accountUserId: ctx.session.user.id,
          credentialToken: customerCredential(
            ctx.customerConversationCredential,
          ),
          installationToken: customerInstallation(
            ctx.customerConversationInstallation,
          ),
          purpose: "MOBILE_DEVICE",
        })
      } catch (error) {
        mapCustomerConversationError(error)
      }
    }),

  mobileStoreConversationAccountDevices: authenticatedProcedure
    .input(storeConversationAccountDeviceListInputSchema)
    .query(async ({ ctx }) => {
      try {
        const credentialToken = customerCredential(
          ctx.customerConversationCredential,
          { optional: true },
        )
        const installationToken = ctx.customerConversationInstallation
          ? customerInstallation(ctx.customerConversationInstallation)
          : undefined
        return await listStoreConversationAccountDevices(ctx.db, {
          accountUserId: ctx.session.user.id,
          currentGuest:
            credentialToken && installationToken
              ? {
                  credentialToken,
                  installationToken,
                  purpose: "MOBILE_DEVICE",
                }
              : undefined,
        })
      } catch (error) {
        mapCustomerConversationError(error)
      }
    }),

  revokeMobileStoreConversationAccountDevice: authenticatedProcedure
    .input(storeConversationAccountDeviceRevokeInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await revokeStoreConversationAccountDevice(ctx.db, {
          ...input,
          accountUserId: ctx.session.user.id,
        })
      } catch (error) {
        mapCustomerConversationError(error)
      }
    }),

  executeMobileStoreConversationAction: publicProcedure
    .input(storeConversationQuoteActionExecuteInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await executeMobileStoreConversationActionMessage(
          ctx.db,
          {
            ...input,
            credentialToken: customerCredential(
              ctx.customerConversationCredential,
            ),
            installationToken: customerInstallation(
              ctx.customerConversationInstallation,
            ),
          },
        )
        return await completeStoreConversationActionHandoff(
          {
            capabilityToken: input.capabilityToken,
            clientOperationId: input.clientOperationId,
            result,
          },
          {
            createPrescriptionCheckout: (checkoutInput) =>
              createPrescriptionHostedCheckoutHandoff(checkoutInput, {
                ...createPrescriptionHostedCheckoutRepository(ctx.db),
                provider: getConfiguredHostedPaymentProvider(),
              }),
          },
        )
      } catch (error) {
        mapCustomerConversationError(error)
      }
    }),

  previewMobileStoreConversationAction: publicProcedure
    .input(storeConversationQuoteActionPreviewInputSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await previewMobileStoreConversationActionMessage(
          ctx.db,
          {
            ...input,
            credentialToken: customerCredential(
              ctx.customerConversationCredential,
            ),
            installationToken: customerInstallation(
              ctx.customerConversationInstallation,
            ),
          },
          {
            issueCapabilityToken: issueServiceCommerceCustomerActionToken,
          },
        )
      } catch (error) {
        mapCustomerConversationError(error)
      }
    }),

  acknowledgeMobileStoreConversationProgress: publicProcedure
    .input(storeConversationMobileReadAcknowledgementInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await acknowledgeMobileStoreConversationProgress(ctx.db, {
          ...input,
          credentialToken: customerCredential(
            ctx.customerConversationCredential,
          ),
          installationToken: customerInstallation(
            ctx.customerConversationInstallation,
          ),
        })
      } catch (error) {
        mapCustomerConversationError(error)
      }
    }),

  authorizeMobileStoreConversationVoiceNote: publicProcedure
    .input(storeConversationCustomerVoiceNoteGrantInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await issueGuestStoreConversationVoiceNoteGrant(ctx.db, {
          ...input,
          channel: "mobile",
          credentialToken: customerCredential(
            ctx.customerConversationCredential,
          ),
          installationToken: customerInstallation(
            ctx.customerConversationInstallation,
          ),
        })
      } catch (error) {
        if (
          error instanceof StoreConversationAttachmentViewerUnavailableError
        ) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message,
          })
        }
        mapCustomerConversationError(error)
      }
    }),

  mobileStoreConversationAttachmentCapability: publicProcedure
    .input(storeConversationAttachmentCapabilityInputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const target = input.target
          ? input.target
          : input.request
            ? { kind: "existing_request" as const, request: input.request }
            : (() => {
                throw new TRPCError({
                  code: "BAD_REQUEST",
                  message: "Choose a Request for this attachment.",
                })
              })()
        return await resolveStoreConversationAttachmentCapability({
          channel: "mobile",
          conversationId: input.conversationId,
          credentialToken: customerCredential(
            ctx.customerConversationCredential,
          ),
          installationToken: customerInstallation(
            ctx.customerConversationInstallation,
          ),
          publicToken: input.publicToken,
          target,
        })
      } catch (error) {
        if (error instanceof StoreConversationAttachmentTransportError) {
          throw new TRPCError({
            code:
              error.code === "GUEST_CREDENTIAL_EXPIRED"
                ? "UNAUTHORIZED"
                : error.code === "FORBIDDEN"
                  ? "FORBIDDEN"
                  : error.code === "NOT_FOUND"
                    ? "NOT_FOUND"
                    : error.code === "INVALID_INPUT"
                      ? "BAD_REQUEST"
                      : "PRECONDITION_FAILED",
            message: error.message,
          })
        }
        throw error
      }
    }),

  mobileIssueStoreConversationWhatsAppBridge: publicProcedure
    .input(storeConversationWhatsAppBridgeIssueInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const credentialToken = customerCredential(
          ctx.customerConversationCredential,
        )
        const installationToken = customerInstallation(
          ctx.customerConversationInstallation,
        )
        const result = await issueStoreConversationWhatsAppBridge(ctx.db, {
          bridgeTokenDigest: storeConversationWhatsAppBridgeTokenDigest(
            input.bridgeToken,
          ),
          clientOperationId: input.clientOperationId,
          conversationId: input.conversationId,
          principal: {
            credentialToken,
            installationToken,
            kind: "guest",
            purpose: "MOBILE_DEVICE",
          },
          publicToken: input.publicToken,
        })
        return projectStoreConversationWhatsAppBridgeIssue({
          bridgeToken: input.bridgeToken,
          displayNumber: result.displayNumber,
          expiresAt: result.expiresAt,
          replayed: result.replayed,
        })
      } catch (error) {
        mapCustomerConversationError(error)
      }
    }),

  claimStoreConversationTransfer: publicProcedure
    .input(
      storeConversationTransferClaimInputSchema.omit({
        installationToken: true,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await claimMobileStoreConversationTransfer(ctx.db, {
          ...input,
          installationToken: customerInstallation(
            ctx.customerConversationInstallation,
          ),
        })
      } catch (error) {
        mapCustomerConversationError(error)
      }
    }),

  mobileBootstrapStoreConversation: publicProcedure
    .input(storeConversationMobileBootstrapInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await bootstrapMobileStoreConversation(ctx.db, {
          ...input,
          credentialToken: customerCredential(
            ctx.customerConversationCredential,
            { optional: true },
          ),
          installationToken: customerInstallation(
            ctx.customerConversationInstallation,
          ),
        })
      } catch (error) {
        mapCustomerConversationError(error)
      }
    }),

  mobileCreateStoreConversationPrivacyRequest: publicProcedure
    .input(storeConversationGuestPrivacyRequestInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const request = await createStoreConversationPrivacyRequest(
          ctx.db,
          input,
          {
            challenge: input.challenge,
            credentialToken: customerCredential(
              ctx.customerConversationCredential,
            ),
            installationToken: customerInstallation(
              ctx.customerConversationInstallation,
            ),
            kind: "guest",
            purpose: "MOBILE_DEVICE",
          },
        )
        await enqueueStoreConversationPrivacyRequest(request.id)
        return request
      } catch (error) {
        mapCustomerConversationError(error)
      }
    }),

  mobileStoreConversationPrivacyRequest: publicProcedure
    .input(storeConversationPrivacyRequestStatusInputSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await getStoreConversationPrivacyRequest(ctx.db, input, {
          credentialToken: customerCredential(
            ctx.customerConversationCredential,
          ),
          installationToken: customerInstallation(
            ctx.customerConversationInstallation,
          ),
          kind: "guest",
          purpose: "MOBILE_DEVICE",
        })
      } catch (error) {
        mapCustomerConversationError(error)
      }
    }),

  mobileRotateStoreConversationCredential: publicProcedure
    .input(storeConversationGuestCredentialRotationInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await rotateStoreConversationGuestCredential(ctx.db, {
          ...input,
          credentialToken: customerCredential(
            ctx.customerConversationCredential,
          ),
          installationToken: customerInstallation(
            ctx.customerConversationInstallation,
          ),
          purpose: "MOBILE_DEVICE",
        })
      } catch (error) {
        mapCustomerConversationError(error)
      }
    }),

  mobileSelectStoreConversationRequest: publicProcedure
    .input(storeConversationSelectRequestInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await selectMobileStoreConversationRequest(ctx.db, {
          ...input,
          credentialToken: customerCredential(
            ctx.customerConversationCredential,
          ),
          installationToken: customerInstallation(
            ctx.customerConversationInstallation,
          ),
        })
      } catch (error) {
        mapCustomerConversationError(error)
      }
    }),

  mobileSendStoreConversationText: publicProcedure
    .input(storeConversationMobileSendTextInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await sendMobileStoreConversationText(ctx.db, {
          ...input,
          credentialToken: customerCredential(
            ctx.customerConversationCredential,
          ),
          installationToken: customerInstallation(
            ctx.customerConversationInstallation,
          ),
        })
      } catch (error) {
        mapCustomerConversationError(error)
      }
    }),

  mobileStoreConversationTimeline: publicProcedure
    .input(storeConversationMobileTimelineInputSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await getMobileStoreConversationTimeline(
          ctx.db,
          {
            ...input,
            credentialToken: customerCredential(
              ctx.customerConversationCredential,
            ),
            installationToken: customerInstallation(
              ctx.customerConversationInstallation,
            ),
          },
          { issueCapabilityToken: issueServiceCommerceCustomerActionToken },
        )
      } catch (error) {
        mapCustomerConversationError(error)
      }
    }),

  mobileStoreConversationMessagesAfter: publicProcedure
    .input(storeConversationMobileMessagesAfterInputSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await getMobileStoreConversationMessagesAfter(
          ctx.db,
          {
            ...input,
            credentialToken: customerCredential(
              ctx.customerConversationCredential,
            ),
            installationToken: customerInstallation(
              ctx.customerConversationInstallation,
            ),
          },
          { issueCapabilityToken: issueServiceCommerceCustomerActionToken },
        )
      } catch (error) {
        mapCustomerConversationError(error)
      }
    }),

  mobileStoreConversations: publicProcedure
    .input(storeConversationMobileListInputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const { direction: _direction, ...pageInput } = input
        return await listMobileStoreConversations(ctx.db, {
          ...pageInput,
          credentialToken: customerCredential(
            ctx.customerConversationCredential,
          ),
          installationToken: customerInstallation(
            ctx.customerConversationInstallation,
          ),
        })
      } catch (error) {
        mapCustomerConversationError(error)
      }
    }),

  redeemStoreConversationTransfer: publicProcedure
    .input(
      storeConversationTransferRedeemInputSchema.omit({
        installationToken: true,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await redeemMobileStoreConversationTransfer(ctx.db, {
          ...input,
          installationToken: customerInstallation(
            ctx.customerConversationInstallation,
          ),
        })
      } catch (error) {
        mapCustomerConversationError(error)
      }
    }),
})
