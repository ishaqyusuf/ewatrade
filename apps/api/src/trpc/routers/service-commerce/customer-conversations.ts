import {
  StoreConversationError,
  bootstrapMobileStoreConversation,
  claimMobileStoreConversationTransfer,
  getMobileStoreConversationTimeline,
  listMobileStoreConversations,
  redeemMobileStoreConversationTransfer,
  selectMobileStoreConversationRequest,
  sendMobileStoreConversationText,
} from "@ewatrade/db/queries"
import {
  storeConversationMobileBootstrapInputSchema,
  storeConversationMobileListInputSchema,
  storeConversationMobileSendTextInputSchema,
  storeConversationMobileTimelineInputSchema,
  storeConversationSelectRequestInputSchema,
  storeConversationTransferClaimInputSchema,
  storeConversationTransferRedeemInputSchema,
} from "@ewatrade/service-commerce"
import { TRPCError } from "@trpc/server"
import { z } from "zod"

import { createTRPCRouter, publicProcedure } from "../../init"

const credentialSchema = z.string().trim().min(32).max(512)
const installationSchema = z.string().trim().min(32).max(191)

function customerCredential(
  value: string | null | undefined,
  options: { optional: true },
): string | null
function customerCredential(
  value: string | null | undefined,
  options?: { optional?: false },
): string
function customerCredential(
  value: string | null | undefined,
  options?: { optional?: boolean },
): string | null {
  if (options?.optional && !value) return null
  const parsed = credentialSchema.safeParse(value)
  if (!parsed.success) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Open the Store link to continue.",
    })
  }
  return parsed.data
}

function customerInstallation(value: string | null | undefined) {
  const parsed = installationSchema.safeParse(value)
  if (!parsed.success) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "This app installation could not be verified.",
    })
  }
  return parsed.data
}

function mapCustomerConversationError(error: unknown): never {
  if (error instanceof StoreConversationError) {
    throw new TRPCError({
      code:
        error.code === "GUEST_CREDENTIAL_EXPIRED"
          ? "UNAUTHORIZED"
          : error.code === "FORBIDDEN"
            ? "FORBIDDEN"
            : error.code === "NOT_FOUND"
              ? "NOT_FOUND"
              : error.code === "NOT_READY"
                ? "PRECONDITION_FAILED"
                : "CONFLICT",
      message: error.message,
    })
  }
  throw error
}

export const serviceCommerceCustomerConversationsRouter = createTRPCRouter({
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
        return await getMobileStoreConversationTimeline(ctx.db, {
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

  mobileStoreConversations: publicProcedure
    .input(storeConversationMobileListInputSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await listMobileStoreConversations(ctx.db, {
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
