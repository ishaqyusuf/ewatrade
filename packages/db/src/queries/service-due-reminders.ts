import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  ServiceNotificationChannel,
  ServiceNotificationIntentStatus,
} from "../../generated/prisma/enums"

export async function cancelOutstandingDueReminders(
  db: Prisma.TransactionClient | PrismaClient,
  serviceJobId: string,
) {
  await db.serviceNotificationIntent.updateMany({
    data: { status: ServiceNotificationIntentStatus.CANCELLED },
    where: {
      serviceJobId,
      status: {
        in: [
          ServiceNotificationIntentStatus.PENDING,
          ServiceNotificationIntentStatus.READY,
        ],
      },
      templatePurpose: "due_reminder",
    },
  })
}

export async function replaceDueReminder(
  db: Prisma.TransactionClient,
  input: {
    actorUserId: string
    channel: ServiceNotificationChannel | null
    customerPhone: string | null
    orderNumber: string
    promisedAt: Date
    serviceJobId: string
    storeId: string
    tenantId: string
  },
) {
  await cancelOutstandingDueReminders(db, input.serviceJobId)
  if (!input.customerPhone) return null
  const settings = await db.serviceStoreSettings.findUnique({
    where: { storeId: input.storeId },
  })
  const channel = input.channel ?? settings?.defaultNotificationChannel
  if (
    !settings?.autoNotifyReminder ||
    !input.customerPhone ||
    (channel !== ServiceNotificationChannel.SMS &&
      channel !== ServiceNotificationChannel.WHATSAPP)
  ) {
    return null
  }
  const tenant = await db.tenant.findUnique({
    select: { timezone: true },
    where: { id: input.tenantId },
  })
  const scheduledFor = new Date(
    input.promisedAt.getTime() - settings.reminderLeadMinutes * 60_000,
  )
  const renderedMessage = `Reminder: order ${input.orderNumber} is expected to be ready by ${input.promisedAt.toLocaleString(
    "en-NG",
    {
      timeZone: tenant?.timezone ?? "Africa/Lagos",
    },
  )}.`
  return db.serviceNotificationIntent.upsert({
    create: {
      audienceKey: input.orderNumber,
      businessEventKey: `${input.serviceJobId}:due-reminder:${input.promisedAt.toISOString()}`,
      channel,
      createdByUserId: input.actorUserId,
      customerPhone: input.customerPhone,
      renderedMessage,
      scheduledFor,
      serviceJobId: input.serviceJobId,
      status:
        scheduledFor.getTime() <= Date.now()
          ? ServiceNotificationIntentStatus.READY
          : ServiceNotificationIntentStatus.PENDING,
      storeId: input.storeId,
      templatePurpose: "due_reminder",
      tenantId: input.tenantId,
    },
    update: {
      channel,
      customerPhone: input.customerPhone,
      renderedMessage,
      scheduledFor,
      status:
        scheduledFor.getTime() <= Date.now()
          ? ServiceNotificationIntentStatus.READY
          : ServiceNotificationIntentStatus.PENDING,
    },
    where: {
      tenantId_businessEventKey_audienceKey_templatePurpose: {
        audienceKey: input.orderNumber,
        businessEventKey: `${input.serviceJobId}:due-reminder:${input.promisedAt.toISOString()}`,
        templatePurpose: "due_reminder",
        tenantId: input.tenantId,
      },
    },
  })
}
