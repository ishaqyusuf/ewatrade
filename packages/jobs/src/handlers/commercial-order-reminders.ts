import { prisma } from "@ewatrade/db/client"
import {
  CommercialOrderReminderDeliveryStatus,
  MembershipRole,
  MembershipStatus,
  OrderStatus,
  CommercialOrderReminderTiming as ReminderTimingEnum,
  SellableOfferingKind,
  StaffStoreAssignmentStatus,
  StoreStaffRole,
} from "@ewatrade/db/enums"
import { resolveRetailOpsPlanId } from "@ewatrade/db/queries"
import {
  findRetailOpsPlan,
  planHasFeature,
} from "@ewatrade/db/subscription-plans"
import {
  createCommercialOrderFulfillmentReminderDispatch,
  createCommercialOrderReminderDigestDispatch,
  planNotificationDeliveries,
} from "@ewatrade/notifications"
import { EmailService } from "@ewatrade/notifications/services/email-service"

import {
  COMMERCIAL_ORDER_OVERDUE_LOOKBACK_DAYS,
  type CommercialOrderReminderTiming,
  type DigestOrder,
  type DigestRecipient,
  type PlannedDigest,
  commercialOrderDigestSections,
  isCommercialOrderDigestWindow,
  localDateKey,
  planCommercialOrderReminderDigests,
  reminderCoverageKey,
} from "./commercial-order-reminder-digest"

export {
  type CommercialOrderReminderTiming,
  commercialOrderReminderTiming,
} from "./commercial-order-reminder-digest"

export function isCommercialOrderReminderRecipientRole(role: string) {
  const normalized = role.trim().toUpperCase()
  return (
    normalized === "OWNER" || normalized === "ADMIN" || normalized === "MANAGER"
  )
}

/** Order reminder emails are a paid-plan feature; Free businesses get none. */
export function tenantSendsOrderReminders(tenant: {
  metadata: unknown
  subscription?: {
    plan: { key: string }
    provider?: string
    status?: string
    billingSubscriptionId?: string | null
    currentPeriodEndsAt?: Date | null
  } | null
}) {
  const plan = findRetailOpsPlan(
    resolveRetailOpsPlanId({
      metadata: tenant.metadata,
      subscription: tenant.subscription,
    }),
  )
  return !!plan && planHasFeature(plan, "orderReminders")
}

const CLAIM_LEASE_MS = 15 * 60 * 1_000

const timingEnum = {
  day_before: ReminderTimingEnum.DAY_BEFORE,
  overdue: ReminderTimingEnum.OVERDUE,
  same_day: ReminderTimingEnum.SAME_DAY,
} as const satisfies Record<CommercialOrderReminderTiming, ReminderTimingEnum>

const timingFromEnum: Record<
  ReminderTimingEnum,
  CommercialOrderReminderTiming
> = {
  [ReminderTimingEnum.DAY_BEFORE]: "day_before",
  [ReminderTimingEnum.OVERDUE]: "overdue",
  [ReminderTimingEnum.SAME_DAY]: "same_day",
}

function dashboardUrl() {
  const value =
    process.env.NEXT_PUBLIC_DASHBOARD_URL?.trim() ||
    process.env.DASHBOARD_URL?.trim()
  return value ? value.replace(/\/$/, "") : null
}

function deliveryDueLabel(deliveryDueAt: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone,
  }).format(deliveryDueAt)
}

type TenantContext = {
  id: string
  name: string
  timezone: string
}

async function loadRecipients(tenantId: string): Promise<DigestRecipient[]> {
  const memberships = await prisma.membership.findMany({
    include: {
      staffStoreAssignments: {
        select: { storeId: true },
        where: {
          role: StoreStaffRole.MANAGER,
          status: StaffStoreAssignmentStatus.ACTIVE,
        },
      },
      user: true,
    },
    where: {
      status: MembershipStatus.ACTIVE,
      tenantId,
      OR: [
        {
          role: {
            in: [
              MembershipRole.OWNER,
              MembershipRole.ADMIN,
              MembershipRole.MANAGER,
            ],
          },
        },
        {
          staffStoreAssignments: {
            some: {
              role: StoreStaffRole.MANAGER,
              status: StaffStoreAssignmentStatus.ACTIVE,
            },
          },
        },
      ],
    },
  })
  return memberships.map((membership) => ({
    accessMode: membership.staffAccessMode,
    email: membership.user.email,
    managedStoreIds: membership.staffStoreAssignments.map(
      (assignment) => assignment.storeId,
    ),
    name:
      membership.user.displayName ||
      membership.user.name ||
      membership.user.firstName ||
      null,
    role: membership.role,
  }))
}

/** Claims the day's digest row; returns the attempt number or null. */
async function claimDigest(input: {
  localDate: string
  now: Date
  orderCount: number
  recipient: DigestRecipient
  tenantId: string
}) {
  const digest = await prisma.commercialOrderReminderDigest.upsert({
    create: {
      localDate: input.localDate,
      orderCount: input.orderCount,
      recipientEmail: input.recipient.email,
      recipientName: input.recipient.name,
      tenantId: input.tenantId,
    },
    update: {},
    where: {
      tenantId_localDate_recipientEmail: {
        localDate: input.localDate,
        recipientEmail: input.recipient.email,
        tenantId: input.tenantId,
      },
    },
  })
  if (digest.status === CommercialOrderReminderDeliveryStatus.SENT) return null

  const claim = await prisma.commercialOrderReminderDigest.updateMany({
    data: {
      attemptCount: { increment: 1 },
      errorMessage: null,
      lastAttemptAt: input.now,
      orderCount: input.orderCount,
      status: CommercialOrderReminderDeliveryStatus.PENDING,
    },
    where: {
      id: digest.id,
      OR: [
        { lastAttemptAt: null },
        {
          lastAttemptAt: { lt: new Date(input.now.getTime() - CLAIM_LEASE_MS) },
        },
      ],
      status: { not: CommercialOrderReminderDeliveryStatus.SENT },
    },
  })
  if (claim.count === 0) return null
  return { attempt: digest.attemptCount + 1, digestId: digest.id }
}

async function sendDigest(input: {
  attempt: number
  digest: PlannedDigest
  digestId: string
  tenant: TenantContext
}) {
  const { digest, tenant } = input
  const recipient = {
    displayName: digest.recipient.name ?? undefined,
    email: digest.recipient.email,
  }
  const [only] = digest.entries
  const dispatch =
    digest.entries.length === 1 && only && only.timing !== "overdue"
      ? createCommercialOrderFulfillmentReminderDispatch(
          {
            businessName: tenant.name,
            customerName: only.order.customerName,
            deliveryDueLabel: deliveryDueLabel(
              only.order.deliveryDueAt,
              tenant.timezone,
            ),
            orderId: only.order.id,
            orderNumber: only.order.orderNumber,
            storeName: only.order.storeName,
            timing: only.timing,
          },
          recipient,
        )
      : createCommercialOrderReminderDigestDispatch(
          {
            attempt: input.attempt,
            businessName: tenant.name,
            digestId: input.digestId,
            ordersUrl: dashboardUrl() ? `${dashboardUrl()}/sales` : null,
            sections: commercialOrderDigestSections({
              dashboardUrl: dashboardUrl(),
              entries: digest.entries,
              timeZone: tenant.timezone,
            }),
          },
          recipient,
        )
  return new EmailService().sendBulk(
    planNotificationDeliveries(dispatch).dispatches,
  )
}

async function recordDigestOutcome(input: {
  digest: PlannedDigest
  digestId: string
  error: string | null
  now: Date
  tenantId: string
}) {
  const status = input.error
    ? CommercialOrderReminderDeliveryStatus.FAILED
    : CommercialOrderReminderDeliveryStatus.SENT
  const sentAt = input.error ? null : input.now
  const recipientEmail = input.digest.recipient.email
  await prisma.$transaction([
    prisma.commercialOrderReminderDigest.update({
      data: { errorMessage: input.error, sentAt, status },
      where: { id: input.digestId },
    }),
    ...input.digest.entries.map(({ order, timing }) =>
      prisma.commercialOrderReminderDelivery.upsert({
        create: {
          attemptCount: 1,
          digestId: input.digestId,
          errorMessage: input.error,
          lastAttemptAt: input.now,
          orderId: order.id,
          recipientEmail,
          recipientName: input.digest.recipient.name,
          sentAt,
          status,
          storeId: order.storeId,
          tenantId: input.tenantId,
          timing: timingEnum[timing],
        },
        update: {
          attemptCount: { increment: 1 },
          digestId: input.digestId,
          errorMessage: input.error,
          lastAttemptAt: input.now,
          sentAt,
          status,
        },
        where: {
          orderId_timing_recipientEmail: {
            orderId: order.id,
            recipientEmail,
            timing: timingEnum[timing],
          },
        },
      }),
    ),
  ])
}

/**
 * Hourly. Inside each Tenant's local morning window, sends every manager one
 * email listing Orders overdue, due today and due tomorrow, instead of one
 * email per Order. At most one digest per recipient per local day.
 */
export async function commercialOrderRemindersHandler(
  input: { now?: Date } = {},
) {
  const now = input.now ?? new Date()
  const candidates = await prisma.commercialOrder.findMany({
    select: {
      customerName: true,
      deliveryDueAt: true,
      id: true,
      orderNumber: true,
      store: {
        select: {
          commercialOrderReminderSettings: {
            select: {
              dayBeforeEnabled: true,
              enabled: true,
              sameDayEnabled: true,
            },
          },
          name: true,
        },
      },
      storeId: true,
      tenant: {
        select: {
          id: true,
          metadata: true,
          name: true,
          subscription: {
            select: {
              plan: { select: { key: true } },
              provider: true,
              status: true,
              billingSubscriptionId: true,
              currentPeriodEndsAt: true,
            },
          },
          timezone: true,
        },
      },
    },
    where: {
      deliveryDueAt: {
        gte: new Date(
          now.getTime() -
            (COMMERCIAL_ORDER_OVERDUE_LOOKBACK_DAYS + 1) * 24 * 60 * 60 * 1_000,
        ),
        lte: new Date(now.getTime() + 48 * 60 * 60 * 1_000),
      },
      lines: {
        some: {
          kind: SellableOfferingKind.PRODUCT_UNIT,
          productFulfillments: { none: {} },
        },
      },
      status: {
        notIn: [
          OrderStatus.COMPLETED,
          OrderStatus.CANCELLED,
          OrderStatus.REFUNDED,
        ],
      },
    },
  })

  const byTenant = new Map<
    string,
    { orders: DigestOrder[]; tenant: (typeof candidates)[number]["tenant"] }
  >()
  for (const order of candidates) {
    if (!order.deliveryDueAt) continue
    const group = byTenant.get(order.tenant.id) ?? {
      orders: [],
      tenant: order.tenant,
    }
    group.orders.push({
      customerName: order.customerName,
      deliveryDueAt: order.deliveryDueAt,
      id: order.id,
      orderNumber: order.orderNumber,
      settings: order.store.commercialOrderReminderSettings,
      storeId: order.storeId,
      storeName: order.store.name,
    })
    byTenant.set(order.tenant.id, group)
  }

  let failed = 0
  let sent = 0
  let skipped = 0

  for (const { orders, tenant } of byTenant.values()) {
    if (
      !isCommercialOrderDigestWindow(now, tenant.timezone) ||
      !tenantSendsOrderReminders(tenant)
    ) {
      skipped += 1
      continue
    }
    const localDate = localDateKey(now, tenant.timezone)
    const [recipients, sentDigests, coverage] = await Promise.all([
      loadRecipients(tenant.id),
      prisma.commercialOrderReminderDigest.findMany({
        select: { recipientEmail: true },
        where: {
          localDate,
          status: CommercialOrderReminderDeliveryStatus.SENT,
          tenantId: tenant.id,
        },
      }),
      prisma.commercialOrderReminderDelivery.findMany({
        select: { orderId: true, recipientEmail: true, timing: true },
        where: {
          orderId: { in: orders.map((order) => order.id) },
          status: CommercialOrderReminderDeliveryStatus.SENT,
        },
      }),
    ])
    const alreadySent = new Set(
      sentDigests.map((digest) => digest.recipientEmail),
    )
    const digests = planCommercialOrderReminderDigests({
      coveredKeys: new Set(
        coverage.map((row) =>
          reminderCoverageKey({
            email: row.recipientEmail,
            orderId: row.orderId,
            timing: timingFromEnum[row.timing],
          }),
        ),
      ),
      now,
      orders,
      recipients: recipients.filter(
        (recipient) => !alreadySent.has(recipient.email.trim().toLowerCase()),
      ),
      timeZone: tenant.timezone,
    })

    for (const digest of digests) {
      const claim = await claimDigest({
        localDate,
        now,
        orderCount: digest.entries.length,
        recipient: digest.recipient,
        tenantId: tenant.id,
      })
      if (!claim) {
        skipped += 1
        continue
      }
      const result = await sendDigest({
        attempt: claim.attempt,
        digest,
        digestId: claim.digestId,
        tenant,
      })
      const error =
        result.failed > 0 || result.sent === 0
          ? (result.deliveries.find((delivery) => delivery.error)?.error ??
            "No reminder email was delivered.")
          : null
      await recordDigestOutcome({
        digest,
        digestId: claim.digestId,
        error,
        now,
        tenantId: tenant.id,
      })
      if (error) failed += 1
      else sent += 1
    }
  }

  return { candidates: candidates.length, failed, sent, skipped }
}
