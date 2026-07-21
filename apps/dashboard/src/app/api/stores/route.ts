import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { canManageTenant, normalizeRole } from "@ewatrade/auth/roles"
import { prisma } from "@ewatrade/db"
import {
  RetailOpsSubscriptionError,
  createTenantStore,
} from "@ewatrade/db/queries"
import {
  BUSINESS_OPERATING_MODEL_KEYS,
  BUSINESS_ORDER_CHANNEL_KEYS,
  BUSINESS_PROFILE_SCHEMA_VERSION,
  BUSINESS_TEAM_SIZE_KEYS,
  OPERATING_CURRENCY_CODES,
  isBusinessProfileKey,
} from "@ewatrade/utils"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { z } from "zod/v4"

const storeOnboardingSchema = z
  .object({
    businessProfileKey: z
      .string()
      .trim()
      .max(120)
      .refine(isBusinessProfileKey, "Select a supported business category")
      .optional(),
    businessProfileVersion: z
      .literal(BUSINESS_PROFILE_SCHEMA_VERSION)
      .optional(),
    countryCode: z.string().trim().max(8).optional(),
    operatingModel: z.enum(BUSINESS_OPERATING_MODEL_KEYS).optional(),
    otherBusinessDescription: z.string().trim().max(240).optional(),
    orderChannels: z
      .array(z.enum(BUSINESS_ORDER_CHANNEL_KEYS))
      .max(5)
      .optional(),
    salesMethod: z.string().trim().max(80).optional(),
    staffInvolvement: z.string().trim().max(120).optional(),
    teamSize: z.enum(BUSINESS_TEAM_SIZE_KEYS).optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.businessProfileKey === "other-mixed-business" &&
      !value.otherBusinessDescription?.trim()
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Tell us what your business does",
        path: ["otherBusinessDescription"],
      })
    }
  })

const createStoreSchema = z.object({
  name: z.string().min(1).max(120),
  currencyCode: z
    .preprocess(
      (value) =>
        typeof value === "string" ? value.trim().toUpperCase() : value,
      z.enum(OPERATING_CURRENCY_CODES),
    )
    .optional(),
  onboarding: storeOnboardingSchema.optional(),
  supportEmail: z.email().optional(),
  supportPhone: z.string().optional(),
})

export async function POST(request: NextRequest) {
  const session = await getServerSession()
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await getActiveTenant(session.user.id)
  if (!ctx)
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

  const normalizedRole = normalizeRole(ctx.membership.role)

  if (!normalizedRole || !canManageTenant(normalizedRole)) {
    return NextResponse.json(
      { error: "You do not have permission to manage business stores." },
      { status: 403 },
    )
  }

  const body = await request.json().catch(() => null)
  const parsed = createStoreSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const { name, currencyCode, onboarding, supportEmail, supportPhone } =
    parsed.data

  try {
    const store = await createTenantStore(prisma, {
      createdByUserId: session.user.id,
      tenantId: ctx.tenant.id,
      name,
      currencyCode: currencyCode ?? ctx.tenant.currencyCode ?? "NGN",
      onboarding: onboarding
        ? { ...onboarding, source: "dashboard_first_store_setup" }
        : undefined,
      supportEmail: supportEmail ?? null,
      supportPhone: supportPhone ?? null,
    })

    return NextResponse.json({ success: true, store }, { status: 201 })
  } catch (error) {
    if (error instanceof RetailOpsSubscriptionError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }

    throw error
  }
}
