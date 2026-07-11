import { prisma } from "@ewatrade/db"
import { processRetailOpsBillingProviderEvent } from "@ewatrade/db/queries"
import type { OpenAPIHono } from "@hono/zod-openapi"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import { safeCompare } from "../utils/safe-compare"

const billingProviderSchema = z.enum([
  "app_store",
  "manual",
  "other",
  "play_store",
  "stripe",
])

const billingProviderEventKindSchema = z.enum([
  "checkout_cancelled",
  "checkout_completed",
  "checkout_expired",
  "checkout_failed",
  "checkout_pending",
  "invoice_opened",
  "invoice_paid",
  "invoice_uncollectible",
  "invoice_voided",
  "noop",
  "subscription_activated",
  "subscription_cancelled",
  "subscription_past_due",
  "subscription_updated",
])

const billingCheckoutStatusSchema = z.enum([
  "cancelled",
  "completed",
  "expired",
  "failed",
  "pending",
])

const billingInvoiceStatusSchema = z.enum([
  "draft",
  "open",
  "paid",
  "uncollectible",
  "void",
])

const billingSubscriptionStatusSchema = z.enum([
  "active",
  "cancelled",
  "past_due",
  "trialing",
])

const billingPlanIdSchema = z.enum(["growth", "pro", "starter"])
const optionalDateSchema = z.coerce.date().nullable().optional()
const optionalStringSchema = z.string().trim().min(1).max(500).nullable().optional()

const billingProviderEventSchema = z.object({
  checkout: z
    .object({
      cancelledAt: optionalDateSchema,
      checkoutSessionId: optionalStringSchema,
      checkoutUrl: optionalStringSchema,
      completedAt: optionalDateSchema,
      externalId: optionalStringSchema,
      expiresAt: optionalDateSchema,
      providerSessionId: optionalStringSchema,
      status: billingCheckoutStatusSchema.optional(),
      tenantId: optionalStringSchema,
    })
    .optional(),
  eventId: z.string().trim().min(1).max(240),
  invoice: z
    .object({
      amountDueMinor: z.coerce.number().int().min(0).optional(),
      amountPaidMinor: z.coerce.number().int().min(0).optional(),
      currencyCode: z.string().trim().min(3).max(12).optional(),
      dueAt: optionalDateSchema,
      hostedInvoiceUrl: optionalStringSchema,
      issuedAt: optionalDateSchema,
      paidAt: optionalDateSchema,
      periodEndsAt: optionalDateSchema,
      periodStartsAt: optionalDateSchema,
      planId: billingPlanIdSchema.optional(),
      providerInvoiceId: optionalStringSchema,
      status: billingInvoiceStatusSchema.optional(),
      tenantId: optionalStringSchema,
      voidedAt: optionalDateSchema,
    })
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  payload: z.unknown().optional(),
  provider: billingProviderSchema,
  receivedAt: z.coerce.date().optional(),
  subscription: z
    .object({
      billingCustomerId: optionalStringSchema,
      billingSubscriptionId: optionalStringSchema,
      cancelAtPeriodEnd: z.boolean().optional(),
      cancellationReason: optionalStringSchema,
      cancelledAt: optionalDateSchema,
      currentPeriodEndsAt: optionalDateSchema,
      currentPeriodStartsAt: optionalDateSchema,
      planId: billingPlanIdSchema.optional(),
      status: billingSubscriptionStatusSchema.optional(),
      tenantId: optionalStringSchema,
      trialEndsAt: optionalDateSchema,
      trialStartsAt: optionalDateSchema,
    })
    .optional(),
  tenantId: optionalStringSchema,
  type: billingProviderEventKindSchema,
})

function assertInternalBillingRequest(internalKey: string | undefined) {
  if (safeCompare(internalKey, process.env.INTERNAL_API_KEY)) return

  throw new HTTPException(401, {
    message: "Unauthorized billing provider event request.",
  })
}

async function readJsonBody(request: Request) {
  try {
    return await request.json()
  } catch {
    throw new HTTPException(400, {
      message: "Billing provider event request must be valid JSON.",
    })
  }
}

export function registerBillingProviderEventRoutes(app: OpenAPIHono) {
  app.post("/api/billing/provider-events", async (c) => {
    assertInternalBillingRequest(c.req.header("x-internal-key"))

    const parsed = billingProviderEventSchema.safeParse(
      await readJsonBody(c.req.raw),
    )

    if (!parsed.success) {
      return c.json(
        {
          error: "Invalid billing provider event payload.",
          issues: parsed.error.issues,
        },
        400,
      )
    }

    const result = await processRetailOpsBillingProviderEvent(
      prisma,
      parsed.data,
    )
    const statusCode =
      result.providerEvent.status === "failed" ? 500 : 200

    return c.json(result, statusCode)
  })
}
