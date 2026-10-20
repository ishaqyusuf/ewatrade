import {
  QaAccessError,
  authorizeQaDomain,
  exchangeQaTesterCredential,
  listQaAccessProfiles,
  listQaPhoneEntries,
  revalidateQaClientAuthorization,
  revokeQaClientAuthorization,
  selectQaAccessProfile,
} from "@ewatrade/db/queries"
import {
  QA_ACCELERATOR_CONTRACT_VERSION,
  getQaAcceleratorAvailability,
  isConfiguredQaDomain,
} from "@ewatrade/utils/qa-accelerator"
import {
  getQaPolicyEnvironment,
  qaPolicyTarget,
} from "@ewatrade/utils/qa-policy-server"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../init"

const authorizationTokenSchema = z.string().trim().min(32).max(160)
const clientIdSchema = z.string().trim().min(8).max(160)

function getSecret() {
  const secret = process.env.QA_ACCELERATOR_SECRET?.trim()
  if (!secret || secret.length < 32) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "QA access is unavailable.",
    })
  }
  return secret
}

async function requireAvailability(clientContractVersion?: number) {
  const availability = getQaAcceleratorAvailability({
    clientContractVersion,
    env: await getQaPolicyEnvironment(),
    platform: "mobile",
  })
  if (!availability.available) {
    throw new TRPCError({
      code:
        availability.category === "upgrade_required"
          ? "PRECONDITION_FAILED"
          : "NOT_FOUND",
      message:
        availability.category === "environment_not_allowed"
          ? "Not found."
          : availability.category === "upgrade_required"
            ? "This preview build must be updated before QA access can continue."
            : "QA access is unavailable.",
    })
  }
  return availability
}

function mapQaAccessError(error: unknown): never {
  if (error instanceof QaAccessError) {
    throw new TRPCError({
      code: error.category === "locked" ? "TOO_MANY_REQUESTS" : "UNAUTHORIZED",
      message:
        error.category === "locked"
          ? "QA access is temporarily locked. Wait before trying again."
          : "QA access could not be authorized.",
    })
  }
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: "QA access could not be authorized.",
  })
}

/** A malformed domain is a bad request, not a server error. */
async function isAcceptedQaDomain(qaDomain: string) {
  try {
    return isConfiguredQaDomain(qaDomain, {
      EMAIL_QA_DOMAIN_ROUTES: (await getQaPolicyEnvironment())
        .EMAIL_QA_DOMAIN_ROUTES,
    })
  } catch {
    return false
  }
}

export const qaAccessRouter = createTRPCRouter({
  phoneCapability: publicProcedure.query(async () => ({
    enabled: (await getQaPolicyEnvironment()).QA_TOOLS_ENABLED === "true",
  })),
  phoneEntries: publicProcedure
    .input(z.object({ token: authorizationTokenSchema }).strict())
    .query(async ({ ctx, input }) => {
      try {
        return await listQaPhoneEntries(ctx.db, {
          secret: getSecret(),
          token: input.token,
        })
      } catch (error) {
        mapQaAccessError(error)
      }
    }),
  capability: publicProcedure
    .input(
      z
        .object({ contractVersion: z.number().int().positive().optional() })
        .strict()
        .optional(),
    )
    .query(async ({ input }) => {
      const availability = getQaAcceleratorAvailability({
        clientContractVersion: input?.contractVersion,
        env: await getQaPolicyEnvironment(),
        platform: "mobile",
      })
      if (
        !availability.available &&
        availability.category === "environment_not_allowed"
      ) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Not found." })
      }
      return availability
    }),

  fixtureContext: protectedProcedure.query(async ({ ctx }) => {
    const session = await ctx.db.session.findFirst({
      select: {
        createdAt: true,
        qaAuthorization: {
          select: {
            expiresAt: true,
            grant: { select: { qaDomain: true, testerIdentity: true } },
            revokedAt: true,
            status: true,
          },
        },
        qaStoreId: true,
        qaTenantId: true,
      },
      where: { id: requireBrowserIdentity(ctx.session).session.id },
    })
    const authorization = session?.qaAuthorization
    if (
      !session ||
      !authorization ||
      authorization.status !== "ACTIVE" ||
      authorization.revokedAt ||
      authorization.expiresAt <= new Date() ||
      session.qaTenantId !== ctx.tenantId
    ) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "QA fixture context is unavailable.",
      })
    }
    return {
      currencyCode: ctx.tenantContext.tenant.currencyCode,
      qaDomain: authorization.grant.qaDomain,
      seed: session.createdAt.getTime().toString(),
      storeId: session.qaStoreId ?? ctx.tenantContext.activeStore?.id ?? null,
      tenantId: ctx.tenantId,
      testerIdentity: authorization.grant.testerIdentity,
      timezone: ctx.tenantContext.tenant.timezone,
    }
  }),

  exchange: publicProcedure
    .input(
      z
        .object({
          clientId: clientIdSchema,
          contractVersion: z.literal(QA_ACCELERATOR_CONTRACT_VERSION),
          credential: z.string().trim().min(32).max(256).optional(),
          qaDomain: z.string().trim().min(3).max(253),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      if (qaPolicyTarget() !== "production")
        await requireAvailability(input.contractVersion)
      else if (!input.credential)
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "A tester access key is required.",
        })
      if (!(await isAcceptedQaDomain(input.qaDomain))) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This domain isn’t set up for QA on this server.",
        })
      }
      try {
        if (!input.credential)
          return await authorizeQaDomain(ctx.db, {
            clientId: input.clientId,
            clientPlatform: "mobile",
            networkSource: ctx.clientIp,
            qaDomain: input.qaDomain,
          })
        return await exchangeQaTesterCredential(ctx.db, {
          clientId: input.clientId,
          clientPlatform: "mobile",
          credential: input.credential,
          networkSource: ctx.clientIp,
          qaDomain: input.qaDomain,
          secret: getSecret(),
        })
      } catch (error) {
        mapQaAccessError(error)
      }
    }),

  revalidate: publicProcedure
    .input(
      z
        .object({
          contractVersion: z.literal(QA_ACCELERATOR_CONTRACT_VERSION),
          token: authorizationTokenSchema,
        })
        .strict(),
    )
    .query(async ({ ctx, input }) => {
      await requireAvailability(input.contractVersion)
      try {
        return await revalidateQaClientAuthorization(ctx.db, {
          secret: getSecret(),
          token: input.token,
        })
      } catch (error) {
        mapQaAccessError(error)
      }
    }),

  profiles: publicProcedure
    .input(
      z
        .object({
          contractVersion: z.literal(QA_ACCELERATOR_CONTRACT_VERSION),
          token: authorizationTokenSchema,
        })
        .strict(),
    )
    .query(async ({ ctx, input }) => {
      await requireAvailability(input.contractVersion)
      try {
        return await listQaAccessProfiles(ctx.db, {
          secret: getSecret(),
          token: input.token,
        })
      } catch (error) {
        mapQaAccessError(error)
      }
    }),

  selectProfile: publicProcedure
    .input(
      z
        .object({
          contractVersion: z.literal(QA_ACCELERATOR_CONTRACT_VERSION),
          profileReference: z.string().trim().min(32).max(160),
          token: authorizationTokenSchema,
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      await requireAvailability(input.contractVersion)
      try {
        return await selectQaAccessProfile(ctx.db, {
          profileReference: input.profileReference,
          secret: getSecret(),
          token: input.token,
          userAgent: ctx.userAgent,
        })
      } catch (error) {
        mapQaAccessError(error)
      }
    }),

  revoke: publicProcedure
    .input(
      z
        .object({
          contractVersion: z.literal(QA_ACCELERATOR_CONTRACT_VERSION),
          token: authorizationTokenSchema,
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      return revokeQaClientAuthorization(ctx.db, {
        secret: getSecret(),
        token: input.token,
      })
    }),
})
import { requireBrowserIdentity } from "../../assistant/channel-principal"
