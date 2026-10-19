import type { MobileProfile } from "@/lib/session-store"
import { readRecordOriginSchema } from "@ewatrade/assistant/general/read-record-target"
import type { ServiceRequestPageTarget } from "@ewatrade/assistant/general/service-request-read"
import { z } from "zod"

type Profile = Partial<
  Pick<
    MobileProfile,
    | "id"
    | "businessId"
    | "storeId"
    | "role"
    | "staffAccessMode"
    | "catalogEditor"
    | "status"
  >
>
export type NativeServiceRequestScope = {
  actorUserId: string
  tenantId: string
  storeId: string
  key: string
}

/** UI scope partition only; protected canonical readers independently authorize. */
export function nativeServiceRequestScope(
  profile: Profile | null | undefined,
  origin: unknown,
): NativeServiceRequestScope | null {
  const parsed = readRecordOriginSchema.safeParse(origin)
  if (
    !parsed.success ||
    !profile?.id ||
    !profile.businessId ||
    !profile.storeId ||
    (profile.status !== undefined && profile.status !== "ACTIVE") ||
    !(
      profile.role === "OWNER" ||
      profile.role === "ADMIN" ||
      (profile.role === "MANAGER" && profile.staffAccessMode === "LEGACY")
    ) ||
    parsed.data.tenantId !== profile.businessId ||
    parsed.data.storeId !== profile.storeId
  )
    return null
  return {
    actorUserId: profile.id,
    tenantId: profile.businessId,
    storeId: profile.storeId,
    key: JSON.stringify([
      profile.id,
      profile.businessId,
      profile.storeId,
      profile.role,
      profile.staffAccessMode,
      profile.catalogEditor,
      profile.status,
    ]),
  }
}

const id = z.string().min(1).max(128)
const at = z.string().datetime()
const requestStatus = z.enum([
  "SUBMITTED",
  "NEEDS_INFORMATION",
  "QUOTED",
  "DECLINED",
  "WITHDRAWN",
  "CONVERTED",
])
const form = z.object({ id, label: z.string() }).strict()
const scopeFields = { actorUserId: id, tenantId: id, storeId: id, asOf: at }
const requestTarget = z
  .object({
    kind: z.literal("service_request"),
    requestId: id,
    origin: readRecordOriginSchema,
  })
  .strict()
const pageSchema = z
  .object({
    ...scopeFields,
    coverage: z.literal("service_requests_only"),
    totalMatching: z.string().regex(/^(0|[1-9]\d{0,19})$/),
    nextCursor: z.string().min(1).max(4096).nullable(),
    items: z
      .array(
        z
          .object({
            id,
            revision: z.number().int().positive(),
            status: requestStatus,
            customerName: z.string(),
            requestedAt: at.nullable(),
            createdAt: at,
            form,
            lineCount: z.number().int().nonnegative(),
            originalTarget: requestTarget,
          })
          .strict(),
      )
      .max(10),
  })
  .strict()
const originalSchema = z
  .object({
    ...scopeFields,
    request: z
      .object({
        id,
        revision: z.number().int().positive(),
        status: requestStatus,
        createdAt: at,
        updatedAt: at,
        requestedAt: at.nullable(),
        details: z.string().nullable(),
        staffResponse: z.string().nullable(),
        customer: z
          .object({
            name: z.string(),
            phone: z.string().nullable(),
            email: z.string().nullable(),
          })
          .strict(),
        channelOrigin: z.enum(["WEB", "STAFF", "WHATSAPP"]),
        contactOptIn: z.boolean(),
        consentVersion: z.string().nullable(),
      })
      .strict(),
    form,
    lines: z
      .array(
        z
          .object({
            id,
            offeringId: id,
            offeringName: z.string(),
            variantName: z.string(),
            optionSelections: z
              .array(
                z
                  .object({
                    group: z.string().max(500),
                    value: z.string().max(500),
                  })
                  .strict(),
              )
              .max(100),
            quantity: z
              .string()
              .regex(/^\d{1,32}(?:\.\d{1,6})?$/)
              .refine((value) => /[1-9]/.test(value)),
            details: z.string().nullable(),
          })
          .strict(),
      )
      .max(100),
    currentQuote: z
      .object({
        quoteId: id,
        versionId: id,
        version: z.number().int().positive(),
        status: z.enum([
          "DRAFT",
          "ISSUED",
          "ACCEPTED",
          "DECLINED",
          "EXPIRED",
          "SUPERSEDED",
          "REVOKED",
        ]),
        currencyCode: z.string().regex(/^[A-Z]{3}$/),
        totalMinor: z.number().int().nonnegative(),
        expiresAt: at.nullable(),
        acceptedOrderId: id.nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict()
function matches(
  raw: { actorUserId: string; tenantId: string; storeId: string },
  scope: NativeServiceRequestScope,
) {
  return (
    raw.actorUserId === scope.actorUserId &&
    raw.tenantId === scope.tenantId &&
    raw.storeId === scope.storeId
  )
}

/** No foreign/corrupt/partial page is shown as a complete current read. */
export function nativeServiceRequestPage(
  raw: unknown,
  scope: NativeServiceRequestScope,
  target: ServiceRequestPageTarget,
) {
  const parsed = pageSchema.safeParse(raw)
  if (!parsed.success || !matches(parsed.data, scope)) return null
  const page = parsed.data
  if (
    target.origin.tenantId !== scope.tenantId ||
    target.origin.storeId !== scope.storeId ||
    page.items.length > target.filters.limit ||
    BigInt(page.totalMatching) < BigInt(page.items.length) ||
    new Set(page.items.map((row) => row.id)).size !== page.items.length ||
    page.items.some(
      (row) =>
        row.originalTarget.requestId !== row.id ||
        row.originalTarget.origin.tenantId !== scope.tenantId ||
        row.originalTarget.origin.storeId !== scope.storeId ||
        (target.filters.status !== undefined &&
          row.status !== target.filters.status.toUpperCase()),
    )
  )
    return null
  return page
}

/** Shape + exact source scope before any full saved contact/detail reaches content. */
export function nativeServiceRequestOriginal(
  raw: unknown,
  scope: NativeServiceRequestScope,
  requestId: string,
) {
  const parsed = originalSchema.safeParse(raw)
  return parsed.success &&
    matches(parsed.data, scope) &&
    parsed.data.request.id === requestId
    ? parsed.data
    : null
}
