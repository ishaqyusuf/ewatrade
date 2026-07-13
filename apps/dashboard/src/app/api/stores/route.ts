import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { canManageTenant, normalizeRole } from "@ewatrade/auth/roles"
import { prisma } from "@ewatrade/db"
import {
  RetailOpsSubscriptionError,
  createTenantStore,
} from "@ewatrade/db/queries"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { z } from "zod/v4"

const storeOnboardingSchema = z.object({
  businessTemplateKey: z
    .enum(["product_sales", "dry_cleaning_laundry", "other_generic"])
    .optional(),
  businessType: z.string().trim().max(80).optional(),
  countryCode: z.string().trim().max(8).optional(),
  offeringCategory: z.string().trim().max(120).optional(),
  operatingModel: z.string().trim().max(120).optional(),
  orderChannels: z.array(z.string().trim().min(1).max(80)).max(8).optional(),
  otherBusinessDescription: z.string().trim().max(240).optional(),
  productCategory: z.string().trim().max(120).optional(),
  requestedCapabilities: z
    .array(z.string().trim().min(1).max(120))
    .max(12)
    .optional(),
  salesMethod: z.string().trim().max(80).optional(),
  serviceCategory: z.string().trim().max(120).optional(),
  staffInvolvement: z.string().trim().max(120).optional(),
  teamSize: z.string().trim().max(80).optional(),
})

const createStoreSchema = z.object({
  name: z.string().min(1).max(120),
  currencyCode: z.string().length(3).default("NGN"),
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
      currencyCode,
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
