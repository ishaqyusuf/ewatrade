import { z } from "zod"

export const businessActivityCategories = [
  "orders",
  "payments",
  "staff",
  "inventory",
  "catalog",
  "services",
  "customers",
  "finance",
  "communications",
  "settings",
  "imports",
] as const

export const businessEventTypes = [
  "order.recorded",
  "order.fulfilled",
  "order.completed",
  "order.amended",
  "order.cancelled",
  "order.replaced",
  "order.note_recorded",
  "order.attachment_recorded",
  "order.approval_requested",
  "order.approval_approved",
  "order.approval_declined",
  "order.approval_withdrawn",
  "order.approval_expired",
  "order.return_recorded",
  "payment.recorded",
  "payment.refund_recorded",
  "payment.reversed",
  "payment.credit_settled",
  "staff.invited",
  "staff.invitation_refreshed",
  "staff.invitation_revoked",
  "staff.invitation_accepted",
  "staff.role_changed",
  "staff.suspended",
  "staff.reactivated",
  "staff.removed",
  "staff.store_access_changed",
  "inventory.operation_recorded",
  "inventory.count_started",
  "inventory.count_completed",
  "catalog.item_created",
  "catalog.item_changed",
  "catalog.item_archived",
  "catalog.item_restored",
  "catalog.price_changed",
  "catalog.publication_changed",
  "customer.created",
  "customer.changed",
  "customer.merged",
  "service.intake_recorded",
  "service.job_created",
  "service.assignment_changed",
  "service.work_recorded",
  "service.fulfilled",
  "service.approved",
  "service.inquiry_changed",
  "service.quote_changed",
  "service.booking_changed",
  "finance.movement_recorded",
  "finance.bill_recorded",
  "finance.payment_recorded",
  "finance.purchase_changed",
  "finance.supplier_entry_recorded",
  "finance.customer_entry_recorded",
  "finance.cash_count_recorded",
  "finance.opening_recorded",
  "finance.correction_recorded",
  "finance.period_closed",
  "communication.manual_message_recorded",
  "communication.delivery_changed",
  "settings.store_changed",
  "settings.storefront_changed",
  "settings.business_changed",
  "settings.team_policy_changed",
  "settings.channel_changed",
  "settings.notification_policy_changed",
  "settings.notification_subscription_changed",
  "import.completed",
  "import.failed",
  "import.reversed",
] as const

export type BusinessEventType = (typeof businessEventTypes)[number]
export type BusinessActivityCategory =
  (typeof businessActivityCategories)[number]
export type BusinessNotificationMethod = "in_app" | "email"
export type BusinessNotificationPreferenceValue = "inherit" | "on" | "off"

export const businessActivityOriginChannels = [
  "dashboard",
  "pos",
  "online",
  "native",
  "assistant",
  "system",
  "import",
  "unknown",
] as const
export const businessActivityOriginSchema = z
  .object({
    channel: z.enum(businessActivityOriginChannels),
  })
  .strict()

const id = z.string().trim().min(1).max(160)
const iso = z.iso.datetime({ offset: true })
const boundedText = z.string().max(1000)
export const businessEventTypeSchema = z.enum(businessEventTypes)
export const businessActivityCategorySchema = z.enum(businessActivityCategories)
export const businessActivityActorKindSchema = z.enum([
  "staff",
  "customer",
  "system",
  "unknown",
])

export const businessActivityTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("order"), id }).strict(),
  z.object({ kind: z.literal("payment"), id, orderId: id }).strict(),
  z.object({ kind: z.literal("staff_member"), id }).strict(),
  z.object({ kind: z.literal("staff_invitation"), id }).strict(),
  z.object({ kind: z.literal("stock_operation"), id }).strict(),
  z.object({ kind: z.literal("stock_count"), id }).strict(),
  z.object({ kind: z.literal("catalog_item"), id }).strict(),
  z.object({ kind: z.literal("customer"), id }).strict(),
  z.object({ kind: z.literal("service_job"), id }).strict(),
  z.object({ kind: z.literal("finance_movement"), id, bookId: id }).strict(),
  z.object({ kind: z.literal("finance_bill"), id, bookId: id }).strict(),
  z.object({ kind: z.literal("finance_entry"), id, bookId: id }).strict(),
])
export type BusinessActivityTarget = z.infer<
  typeof businessActivityTargetSchema
>

export const businessActivityMoneySchema = z
  .object({
    minor: z
      .string()
      .regex(/^(?:0|-?[1-9]\d{0,18})$/)
      .refine((value) => {
        if (!/^(?:0|-?[1-9]\d{0,18})$/.test(value)) return false
        const minor = BigInt(value)
        return (
          minor >= BigInt("-9223372036854775808") &&
          minor <= BigInt("9223372036854775807")
        )
      }, "The amount exceeds the supported minor-unit range."),
    currencyCode: z.enum(["NGN", "USD", "GHS", "KES", "ZAR", "EGP"]),
  })
  .strict()

const statusSchema = z
  .object({
    domain: z.enum([
      "order",
      "payment",
      "staff",
      "stock",
      "service",
      "finance",
    ]),
    value: z.string().min(1).max(80),
  })
  .strict()

export const businessActivityViewSchema = z
  .object({
    key: id,
    type: businessEventTypeSchema,
    category: businessActivityCategorySchema,
    occurredAt: iso,
    recordedAt: iso,
    origin: businessActivityOriginSchema.nullable().default(null),
    actor: z
      .object({
        kind: businessActivityActorKindSchema,
        membershipId: id.nullable(),
        name: z.string().max(240).nullable(),
        coverage: z.enum(["recorded", "unavailable", "unknown"]),
      })
      .strict()
      .superRefine((actor, ctx) => {
        if (
          (actor.coverage !== "recorded" || actor.kind === "unknown") &&
          (actor.membershipId !== null || actor.name !== null)
        )
          ctx.addIssue({
            code: "custom",
            message: "Unknown or unavailable actors cannot expose identities.",
          })
      }),
    subject: z
      .object({
        kind: z.string().min(1).max(80),
        id,
        label: boundedText.nullable(),
      })
      .strict()
      .nullable(),
    store: z
      .object({ id, name: z.string().max(240).nullable() })
      .strict()
      .nullable(),
    summary: boundedText,
    detail: boundedText.nullable(),
    amount: businessActivityMoneySchema.nullable(),
    statusAtEvent: statusSchema.nullable(),
    currentStatus: statusSchema.nullable(),
    target: businessActivityTargetSchema.nullable(),
    canOpen: z.boolean(),
    coverage: z.enum(["snapshot", "legacy_fact", "partial"]),
  })
  .strict()
  .superRefine((event, ctx) => {
    if (event.canOpen && !event.target)
      ctx.addIssue({
        code: "custom",
        path: ["target"],
        message: "An openable event requires a canonical target.",
      })
  })
export type BusinessActivityView = z.infer<typeof businessActivityViewSchema>

export const businessActivityListInput = z
  .object({
    q: z.string().trim().min(1).max(160).optional(),
    categories: z
      .array(businessActivityCategorySchema)
      .min(1)
      .max(11)
      .optional(),
    types: z.array(businessEventTypeSchema).min(1).max(100).optional(),
    actorMembershipId: id.optional(),
    actorKind: businessActivityActorKindSchema.optional(),
    subjectMembershipId: id.optional(),
    storeIds: z.array(id).min(1).max(100).optional(),
    target: businessActivityTargetSchema.optional(),
    from: iso,
    to: iso,
    sort: z.enum(["newest", "oldest"]).default("newest"),
    cursor: z.string().min(1).max(4096).optional(),
    // tRPC infiniteQueryOptions adds this independently of the row sort.
    direction: z.literal("forward").optional(),
    limit: z.number().int().min(1).max(100).default(25),
  })
  .strict()
  .superRefine((input, ctx) => {
    const span = Date.parse(input.to) - Date.parse(input.from)
    if (span <= 0 || span > 92 * 24 * 60 * 60 * 1000)
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message:
          "Choose a positive period of at most 92 days; end is exclusive.",
      })
    if (
      input.actorMembershipId &&
      input.actorKind &&
      input.actorKind !== "staff"
    )
      ctx.addIssue({
        code: "custom",
        path: ["actorKind"],
        message:
          "A staff membership filter applies only to recorded staff actors.",
      })
  })
export type BusinessActivityListInput = z.input<
  typeof businessActivityListInput
>

export type BusinessActivityCoverage = {
  complete: boolean
  detail: string
  unavailableTypes: BusinessEventType[]
  legacyBefore: string | null
}
export type BusinessActivityPage = {
  items: BusinessActivityView[]
  nextCursor: string | null
  snapshotAt: string
  total: number | null
  coverage: BusinessActivityCoverage
}
export type BusinessActivityDetail = {
  event: BusinessActivityView
  changes: Array<{ label: string; before: string | null; after: string | null }>
  relatedEvents: Array<{ key: string; type: BusinessEventType; label: string }>
}
export type BusinessActivityActorChoice = {
  membershipId: string
  name: string
  role: string | null
  isFormer: boolean
}
export type BusinessEventCatalogItem = {
  type: BusinessEventType
  category: BusinessActivityCategory
  label: string
  description: string
  supports: { inApp: boolean; email: boolean }
  availability: "recorded" | "legacy" | "planned"
}
export type BusinessActivityFilterOptions = {
  types: BusinessEventCatalogItem[]
  stores: Array<{ id: string; name: string }>
  actors: BusinessActivityActorChoice[]
  actorNextCursor: string | null
  timeZone: string
  scope: "business" | "stores" | "own"
  canManageNotifications: boolean
}

export type BusinessNotificationState = "unread" | "read" | "archived"
export type BusinessNotificationReceiptView = {
  id: string
  event: BusinessActivityView
  state: BusinessNotificationState
  readAt: string | null
  archivedAt: string | null
}
export type BusinessNotificationPage = {
  items: BusinessNotificationReceiptView[]
  nextCursor: string | null
  snapshotAt: string
  unreadCount: number
}
export type BusinessNotificationMethods = { inApp: boolean; email: boolean }
export type BusinessNotificationScope =
  | { kind: "business" }
  | { kind: "accessible_stores" }
  | { kind: "stores"; storeIds: string[] }
export type BusinessNotificationPolicyView = {
  type: BusinessEventType
  allowed: BusinessNotificationMethods
  defaults: BusinessNotificationMethods
  recipientRoles: string[]
  revision: number
}
export type BusinessNotificationSubscriptionView = {
  id: string
  membershipId: string
  type: BusinessEventType
  enabled: boolean
  scope: BusinessNotificationScope
  allowed: BusinessNotificationMethods
  effective: BusinessNotificationMethods
  effectiveStoreIds: string[]
  blockedReason:
    | "needs_finance_access"
    | "needs_staff_management"
    | "outside_store_scope"
    | "inactive_membership"
    | "unsupported_type"
    | "policy_disabled"
    | "subscription_disabled"
    | "preference_disabled"
    | null
  revision: number
}
export type BusinessNotificationPreferenceView = {
  type: BusinessEventType
  supports: BusinessNotificationMethods
  allowed: BusinessNotificationMethods
  preference: {
    inApp: BusinessNotificationPreferenceValue
    email: BusinessNotificationPreferenceValue
  }
  effective: BusinessNotificationMethods
}
