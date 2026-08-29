import { createHash, randomBytes, randomUUID } from "node:crypto"
import { resolveTxt } from "node:dns/promises"

import {
  type EwaTradeRole,
  canManageTenant,
  normalizeRole,
} from "@ewatrade/auth/roles"
import {
  attachDomainCheckout,
  createDomainOrder,
  createDomainQuote,
  createExternalDomainConnection,
  getDomainOrder,
  getDomainRegistrantProfile,
  listDomainConnections,
  updateDomainConnectionStatus,
  upsertDomainRegistrantProfile,
} from "@ewatrade/db/queries"
import {
  PaystackClient,
  VercelDomainClient,
  calculateDomainRetailPrice,
  createDomainProvider,
  encryptRegistrant,
  getDomainPricingConfig,
  maskEmail,
  normalizeDomainName,
  providerNameForDomain,
} from "@ewatrade/domains"
import { runProviderOperation } from "@ewatrade/errors"
import { enqueueDomainConnectionVerification } from "@ewatrade/jobs"
import { TRPCError } from "@trpc/server"

import { buildDomainCheckoutCallbackUrl } from "../../domains/callback-url"
import {
  connectExternalDomainSchema,
  createDomainCheckoutSchema,
  domainAvailabilitySchema,
  domainListSchema,
  domainOrderSchema,
  domainRegistrantSchema,
  verifyDomainConnectionSchema,
} from "../../schemas/domains"
import { createTRPCRouter, protectedProcedure } from "../init"

const QUOTE_TTL_MINUTES = 15

function assertCanManageDomains(role: string) {
  const normalizedRole = normalizeRole(role) as EwaTradeRole | null

  if (!normalizedRole || !canManageTenant(normalizedRole)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to manage domains.",
    })
  }
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim()

  if (!value) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `${name} is not configured.`,
    })
  }

  return value
}

function callbackUrl(surface: "dashboard" | "mobile", domainOrderId: string) {
  const baseUrl =
    surface === "mobile"
      ? (process.env.DOMAIN_MOBILE_CALLBACK_URL?.trim() ??
        "ewatrade://domain-management-modal")
      : requireEnv("DOMAIN_DASHBOARD_CALLBACK_URL")
  return buildDomainCheckoutCallbackUrl({
    baseUrl,
    domainOrderId,
    surface,
  })
}

function storefrontProjectId() {
  return requireEnv("VERCEL_STOREFRONT_PROJECT_ID")
}

export const domainsRouter = createTRPCRouter({
  list: protectedProcedure
    .input(domainListSchema)
    .query(async ({ ctx, input }) => {
      assertCanManageDomains(ctx.tenantContext.membership.role)
      return listDomainConnections(ctx.db, {
        query: input.query,
        statuses: input.statuses,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  registrantProfile: protectedProcedure.query(async ({ ctx }) => {
    assertCanManageDomains(ctx.tenantContext.membership.role)
    const profile = await getDomainRegistrantProfile(ctx.db, {
      tenantId: ctx.tenantContext.tenant.id,
    })

    return profile
      ? {
          consentVersion: profile.consentVersion,
          consentedAt: profile.consentedAt.toISOString(),
          countryCode: profile.countryCode,
          displayName: profile.displayName,
          id: profile.id,
          maskedEmail: profile.maskedEmail,
          updatedAt: profile.updatedAt.toISOString(),
        }
      : null
  }),

  saveRegistrantProfile: protectedProcedure
    .input(domainRegistrantSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageDomains(ctx.tenantContext.membership.role)
      const consentedAt = new Date()
      const displayName = `${input.firstName} ${input.lastName}`.trim()
      const encryptedPayload = encryptRegistrant(input)

      const profile = await upsertDomainRegistrantProfile(ctx.db, {
        consentVersion: input.consentVersion,
        consentedAt,
        countryCode: input.countryCode,
        displayName,
        encryptedPayload,
        maskedEmail: maskEmail(input.email),
        tenantId: ctx.tenantContext.tenant.id,
      })

      return {
        ...profile,
        consentedAt: profile.consentedAt.toISOString(),
        updatedAt: profile.updatedAt.toISOString(),
      }
    }),

  checkAvailability: protectedProcedure
    .input(domainAvailabilitySchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageDomains(ctx.tenantContext.membership.role)
      const parsed = normalizeDomainName(input.domain)
      const providerName = providerNameForDomain(parsed.normalizedDomain)
      const provider = createDomainProvider(providerName)
      const availability = await runProviderOperation(
        "registrar",
        "domains.availability.check",
        () => provider.checkAvailability(parsed.normalizedDomain),
      )

      if (!availability.available) {
        return {
          available: false,
          domain: parsed.normalizedDomain,
          provider: providerName,
          quote: null,
        }
      }

      if (availability.registrationPrice.amountMinor <= 0) {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: "The registrar did not return a purchasable price.",
        })
      }

      const registration = calculateDomainRetailPrice(
        availability.registrationPrice,
        getDomainPricingConfig(availability.registrationPrice.currencyCode),
      )
      const renewal = availability.renewalPrice
        ? calculateDomainRetailPrice(
            availability.renewalPrice,
            getDomainPricingConfig(availability.renewalPrice.currencyCode),
          )
        : null
      const expiresAt = new Date()
      expiresAt.setMinutes(expiresAt.getMinutes() + QUOTE_TTL_MINUTES)
      const quote = await createDomainQuote(ctx.db, {
        exchangeRate: registration.exchangeRate,
        expiresAt,
        isPremium: availability.isPremium,
        normalizedDomain: parsed.normalizedDomain,
        provider: providerName,
        providerCostMinor: registration.providerCost.amountMinor,
        providerCurrencyCode: registration.providerCost.currencyCode,
        renewalPriceMinor: renewal?.retailPrice.amountMinor ?? null,
        retailCurrencyCode: registration.retailPrice.currencyCode,
        retailPriceMinor: registration.retailPrice.amountMinor,
        storeId: input.storeId,
        tenantId: ctx.tenantContext.tenant.id,
        tld: parsed.tld,
      })

      return {
        available: true,
        domain: parsed.normalizedDomain,
        provider: providerName,
        quote,
      }
    }),

  createCheckout: protectedProcedure
    .input(createDomainCheckoutSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageDomains(ctx.tenantContext.membership.role)
      const tenantId = ctx.tenantContext.tenant.id
      const paymentReference = `domain_${randomUUID().replaceAll("-", "")}`
      const order = await createDomainOrder(ctx.db, {
        idempotencyKey: input.idempotencyKey,
        paymentReference,
        quoteId: input.quoteId,
        registrantProfileId: input.registrantProfileId,
        tenantId,
        termsAcceptedAt: new Date(),
        termsVersion: input.termsVersion,
      })
      const profile = await getDomainRegistrantProfile(ctx.db, { tenantId })

      if (!profile) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Save the domain owner details before checkout.",
        })
      }

      if (order.provider === "EXTERNAL") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "External domains do not use registrar checkout.",
        })
      }
      createDomainProvider(order.provider)
      storefrontProjectId()
      requireEnv("VERCEL_API_TOKEN")
      const registrant = (await import("@ewatrade/domains")).decryptRegistrant(
        profile.encryptedPayload,
      )
      const paystack = new PaystackClient({
        secretKey: requireEnv("PAYSTACK_SECRET_KEY"),
      })
      const checkout = await runProviderOperation(
        "payment",
        "domains.checkout.initialize",
        () =>
          paystack.initializeTransaction({
            amountMinor: order.amountMinor,
            callbackUrl: callbackUrl(input.surface, order.id),
            currencyCode: order.currencyCode,
            email: registrant.email,
            metadata: {
              domain: order.normalizedDomain,
              domainOrderId: order.id,
              tenantId,
            },
            reference: order.paymentReference,
          }),
      )

      return attachDomainCheckout(ctx.db, {
        checkoutUrl: checkout.authorizationUrl,
        orderId: order.id,
        paymentReference: order.paymentReference,
        tenantId,
      })
    }),

  order: protectedProcedure
    .input(domainOrderSchema)
    .query(async ({ ctx, input }) => {
      assertCanManageDomains(ctx.tenantContext.membership.role)
      return getDomainOrder(ctx.db, {
        orderId: input.orderId,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  connectExternal: protectedProcedure
    .input(connectExternalDomainSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageDomains(ctx.tenantContext.membership.role)
      const parsed = normalizeDomainName(input.domain)
      const token = randomBytes(24).toString("base64url")
      const tokenHash = createHash("sha256").update(token).digest("hex")
      const connection = await createExternalDomainConnection(ctx.db, {
        hostname: parsed.normalizedDomain,
        ownershipTokenHash: tokenHash,
        ownershipTokenValue: token,
        storeId: input.storeId,
        tenantId: ctx.tenantContext.tenant.id,
        vercelProjectId: storefrontProjectId(),
      })

      return {
        id: connection.id,
        hostname: connection.hostname,
        status: connection.status,
        verification: {
          name: connection.verificationRecordName,
          type: connection.verificationRecordType,
          value: connection.verificationRecordValue,
        },
      }
    }),

  verifyConnection: protectedProcedure
    .input(verifyDomainConnectionSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageDomains(ctx.tenantContext.membership.role)
      const connection = await ctx.db.domainConnection.findFirst({
        where: {
          id: input.connectionId,
          tenantId: ctx.tenantContext.tenant.id,
        },
      })

      if (!connection) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Domain connection not found.",
        })
      }

      if (
        connection.type === "EXTERNAL" &&
        connection.verificationRecordName &&
        connection.verificationRecordValue
      ) {
        const records = await resolveTxt(
          connection.verificationRecordName,
        ).catch(() => [])
        const values = records.map((parts) => parts.join(""))

        if (!values.includes(connection.verificationRecordValue)) {
          return updateDomainConnectionStatus(ctx.db, {
            connectionId: connection.id,
            failureCode: "OWNERSHIP_TXT_NOT_FOUND",
            failureMessage: "The ownership TXT record has not propagated yet.",
            status: "OWNERSHIP_PENDING",
          })
        }
      }

      await updateDomainConnectionStatus(ctx.db, {
        connectionId: connection.id,
        failureCode: null,
        failureMessage: null,
        status: "VERIFYING",
      })
      await enqueueDomainConnectionVerification({
        connectionId: connection.id,
      })

      return { id: connection.id, status: "VERIFYING" as const }
    }),
})
