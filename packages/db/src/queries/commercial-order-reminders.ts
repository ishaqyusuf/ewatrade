import type { PrismaClient } from "../../generated/prisma/client"

export const defaultCommercialOrderReminderSettings = {
  dayBeforeEnabled: true,
  enabled: true,
  sameDayEnabled: true,
} as const

export async function getCommercialOrderReminderSettings(
  db: PrismaClient,
  input: { storeId: string; tenantId: string },
) {
  const store = await db.store.findFirst({
    select: {
      commercialOrderReminderSettings: {
        select: {
          dayBeforeEnabled: true,
          enabled: true,
          sameDayEnabled: true,
          updatedAt: true,
        },
      },
      id: true,
    },
    where: { id: input.storeId, tenantId: input.tenantId },
  })
  if (!store) return null

  return {
    ...(store.commercialOrderReminderSettings ??
      defaultCommercialOrderReminderSettings),
    storeId: store.id,
    updatedAt: store.commercialOrderReminderSettings?.updatedAt ?? null,
  }
}

export async function updateCommercialOrderReminderSettings(
  db: PrismaClient,
  input: {
    actorUserId: string
    dayBeforeEnabled: boolean
    enabled: boolean
    sameDayEnabled: boolean
    storeId: string
    tenantId: string
  },
) {
  const store = await db.store.findFirst({
    select: { id: true },
    where: { id: input.storeId, tenantId: input.tenantId },
  })
  if (!store) return null

  const settings = await db.commercialOrderReminderSettings.upsert({
    create: {
      dayBeforeEnabled: input.dayBeforeEnabled,
      enabled: input.enabled,
      sameDayEnabled: input.sameDayEnabled,
      storeId: input.storeId,
      tenantId: input.tenantId,
      updatedByUserId: input.actorUserId,
    },
    update: {
      dayBeforeEnabled: input.dayBeforeEnabled,
      enabled: input.enabled,
      sameDayEnabled: input.sameDayEnabled,
      updatedByUserId: input.actorUserId,
    },
    where: { storeId: input.storeId },
  })

  return {
    dayBeforeEnabled: settings.dayBeforeEnabled,
    enabled: settings.enabled,
    sameDayEnabled: settings.sameDayEnabled,
    storeId: settings.storeId,
    updatedAt: settings.updatedAt,
  }
}
