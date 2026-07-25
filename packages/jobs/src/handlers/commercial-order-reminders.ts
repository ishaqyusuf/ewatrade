import { prisma } from "@ewatrade/db/client"
import {
  CommercialOrderReminderDeliveryStatus,
  MembershipRole,
  MembershipStatus,
  OrderStatus,
  CommercialOrderReminderTiming as ReminderTimingEnum,
  SellableOfferingKind,
} from "@ewatrade/db/enums"
import {
  createCommercialOrderFulfillmentReminderDispatch,
  planNotificationDeliveries,
} from "@ewatrade/notifications"
import { EmailService } from "@ewatrade/notifications/services/email-service"

export type CommercialOrderReminderTiming = "day_before" | "same_day"

function localDayNumber(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(value)
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  )
  return Math.floor(
    Date.UTC(values.year ?? 0, (values.month ?? 1) - 1, values.day ?? 1) /
      86_400_000,
  )
}

export function commercialOrderReminderTiming(input: {
  deliveryDueAt: Date
  now: Date
  timeZone: string
}): CommercialOrderReminderTiming | null {
  const daysUntilDelivery =
    localDayNumber(input.deliveryDueAt, input.timeZone) -
    localDayNumber(input.now, input.timeZone)
  if (daysUntilDelivery === 0) return "same_day"
  if (daysUntilDelivery === 1) return "day_before"
  return null
}

export function isCommercialOrderReminderRecipientRole(role: string) {
  const normalized = role.trim().toUpperCase()
  return (
    normalized === "OWNER" || normalized === "ADMIN" || normalized === "MANAGER"
  )
}

function timingEnum(timing: CommercialOrderReminderTiming) {
  return timing === "same_day"
    ? ReminderTimingEnum.SAME_DAY
    : ReminderTimingEnum.DAY_BEFORE
}

function deliveryDueLabel(deliveryDueAt: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone,
  }).format(deliveryDueAt)
}

export async function commercialOrderRemindersHandler(
  input: { now?: Date } = {},
) {
  const now = input.now ?? new Date()
  const candidates = await prisma.commercialOrder.findMany({
    include: {
      store: {
        include: { commercialOrderReminderSettings: true },
      },
      tenant: {
        include: {
          users: {
            include: { user: true },
            where: {
              role: {
                in: [
                  MembershipRole.OWNER,
                  MembershipRole.ADMIN,
                  MembershipRole.MANAGER,
                ],
              },
              status: MembershipStatus.ACTIVE,
            },
          },
        },
      },
    },
    where: {
      deliveryDueAt: {
        gte: new Date(now.getTime() - 24 * 60 * 60 * 1_000),
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

  let failed = 0
  let sent = 0
  let skipped = 0

  for (const order of candidates) {
    if (!order.deliveryDueAt) continue
    const timing = commercialOrderReminderTiming({
      deliveryDueAt: order.deliveryDueAt,
      now,
      timeZone: order.tenant.timezone,
    })
    const settings = order.store.commercialOrderReminderSettings
    const enabled =
      (settings?.enabled ?? true) &&
      (timing === "same_day"
        ? (settings?.sameDayEnabled ?? true)
        : timing === "day_before"
          ? (settings?.dayBeforeEnabled ?? true)
          : false)
    if (!timing || !enabled) {
      skipped += 1
      continue
    }

    for (const membership of order.tenant.users) {
      const recipientEmail = membership.user.email.trim().toLowerCase()
      if (!recipientEmail) continue
      const reminder = await prisma.commercialOrderReminderDelivery.upsert({
        create: {
          orderId: order.id,
          recipientEmail,
          recipientName:
            membership.user.displayName ||
            membership.user.name ||
            membership.user.firstName ||
            null,
          storeId: order.storeId,
          tenantId: order.tenantId,
          timing: timingEnum(timing),
        },
        update: {},
        where: {
          orderId_timing_recipientEmail: {
            orderId: order.id,
            recipientEmail,
            timing: timingEnum(timing),
          },
        },
      })
      if (reminder.status === CommercialOrderReminderDeliveryStatus.SENT) {
        skipped += 1
        continue
      }

      const claim = await prisma.commercialOrderReminderDelivery.updateMany({
        data: {
          attemptCount: { increment: 1 },
          errorMessage: null,
          lastAttemptAt: now,
          status: CommercialOrderReminderDeliveryStatus.PENDING,
        },
        where: {
          id: reminder.id,
          OR: [
            { lastAttemptAt: null },
            {
              lastAttemptAt: {
                lt: new Date(now.getTime() - 15 * 60 * 1_000),
              },
            },
          ],
          status: {
            not: CommercialOrderReminderDeliveryStatus.SENT,
          },
        },
      })
      if (claim.count === 0) {
        skipped += 1
        continue
      }
      const dispatch = createCommercialOrderFulfillmentReminderDispatch(
        {
          businessName: order.tenant.name,
          customerName: order.customerName,
          deliveryDueLabel: deliveryDueLabel(
            order.deliveryDueAt,
            order.tenant.timezone,
          ),
          orderId: order.id,
          orderNumber: order.orderNumber,
          storeName: order.store.name,
          timing,
        },
        {
          displayName: reminder.recipientName ?? undefined,
          email: recipientEmail,
        },
      )
      const result = await new EmailService().sendBulk(
        planNotificationDeliveries(dispatch).dispatches,
      )
      if (result.failed > 0 || result.sent === 0) {
        failed += 1
        await prisma.commercialOrderReminderDelivery.update({
          data: {
            errorMessage:
              result.deliveries.find((delivery) => delivery.error)?.error ??
              "No reminder email was delivered.",
            status: CommercialOrderReminderDeliveryStatus.FAILED,
          },
          where: { id: reminder.id },
        })
      } else {
        sent += 1
        await prisma.commercialOrderReminderDelivery.update({
          data: {
            sentAt: now,
            status: CommercialOrderReminderDeliveryStatus.SENT,
          },
          where: { id: reminder.id },
        })
      }
    }
  }

  return { candidates: candidates.length, failed, sent, skipped }
}
