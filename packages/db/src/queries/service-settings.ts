import type { PrismaClient } from "../../generated/prisma/client"
import {
  ServiceNotificationChannel,
  ServiceSurchargeType,
} from "../../generated/prisma/enums"
import { CatalogError } from "./catalog"

export type ServiceSettingsInput = {
  autoNotifyReady: boolean
  autoNotifyReminder: boolean
  defaultNotificationChannel?: "sms" | "whatsapp"
  expressEnabled: boolean
  expressLabel: string
  expressSurchargeType: "fixed" | "percentage"
  expressSurchargeValue: number
  expressTurnaroundMinutes?: number
  reminderLeadMinutes: number
}

export const defaultServiceSettings = {
  autoNotifyReady: false,
  autoNotifyReminder: false,
  defaultNotificationChannel: null,
  expressEnabled: false,
  expressLabel: "Express",
  expressSurchargeType: "percentage",
  expressSurchargeValue: 0,
  expressTurnaroundMinutes: null,
  reminderLeadMinutes: 1_440,
} as const

function assertNonNegativeInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new CatalogError(
      "INVALID_SERVICE_TRANSITION",
      `${label} must be a non-negative whole number.`,
    )
  }
}

export function calculateServiceChargeMinor(input: {
  subtotalMinor: number
  surchargeType: "fixed" | "percentage"
  surchargeValue: number
}) {
  assertNonNegativeInteger(input.subtotalMinor, "Service subtotal")
  assertNonNegativeInteger(input.surchargeValue, "Express surcharge")
  const amount =
    input.surchargeType === "fixed"
      ? input.surchargeValue
      : Math.round((input.subtotalMinor * input.surchargeValue) / 10_000)
  if (!Number.isSafeInteger(amount) || amount > 100_000_000) {
    throw new CatalogError(
      "INVALID_SERVICE_TRANSITION",
      "Express surcharge exceeds the supported money range.",
    )
  }
  return amount
}

function serializeSettings(
  settings: {
    autoNotifyReady: boolean
    autoNotifyReminder: boolean
    defaultNotificationChannel: ServiceNotificationChannel | null
    expressEnabled: boolean
    expressLabel: string
    expressSurchargeType: ServiceSurchargeType
    expressSurchargeValue: number
    expressTurnaroundMinutes: number | null
    reminderLeadMinutes: number
    storeId: string
  } | null,
  storeId: string,
) {
  if (!settings) return { ...defaultServiceSettings, storeId }
  return {
    autoNotifyReady: settings.autoNotifyReady,
    autoNotifyReminder: settings.autoNotifyReminder,
    defaultNotificationChannel:
      settings.defaultNotificationChannel ===
      ServiceNotificationChannel.WHATSAPP
        ? ("whatsapp" as const)
        : settings.defaultNotificationChannel === ServiceNotificationChannel.SMS
          ? ("sms" as const)
          : null,
    expressEnabled: settings.expressEnabled,
    expressLabel: settings.expressLabel,
    expressSurchargeType:
      settings.expressSurchargeType === ServiceSurchargeType.FIXED
        ? ("fixed" as const)
        : ("percentage" as const),
    expressSurchargeValue: settings.expressSurchargeValue,
    expressTurnaroundMinutes: settings.expressTurnaroundMinutes,
    reminderLeadMinutes: settings.reminderLeadMinutes,
    storeId: settings.storeId,
  }
}

export async function getServiceStoreSettings(
  db: PrismaClient,
  input: { storeId: string; tenantId: string },
) {
  const store = await db.store.findFirst({
    select: { id: true },
    where: { id: input.storeId, tenantId: input.tenantId },
  })
  if (!store) throw new CatalogError("STORE_NOT_FOUND", "Store not found.")
  const settings = await db.serviceStoreSettings.findUnique({
    where: { storeId: store.id },
  })
  return serializeSettings(settings, store.id)
}

export async function updateServiceStoreSettings(
  db: PrismaClient,
  input: ServiceSettingsInput & {
    actorUserId: string
    storeId: string
    tenantId: string
  },
) {
  const store = await db.store.findFirst({
    select: { id: true },
    where: { id: input.storeId, tenantId: input.tenantId },
  })
  if (!store) throw new CatalogError("STORE_NOT_FOUND", "Store not found.")
  const expressLabel = input.expressLabel.trim()
  if (!expressLabel) {
    throw new CatalogError(
      "INVALID_SERVICE_TRANSITION",
      "Express service needs a label.",
    )
  }
  assertNonNegativeInteger(
    input.expressSurchargeValue,
    "Express surcharge value",
  )
  if (
    input.expressSurchargeType === "percentage" &&
    input.expressSurchargeValue > 100_000
  ) {
    throw new CatalogError(
      "INVALID_SERVICE_TRANSITION",
      "Express percentage cannot exceed 1,000%.",
    )
  }
  if (
    input.expressTurnaroundMinutes !== undefined &&
    (!Number.isSafeInteger(input.expressTurnaroundMinutes) ||
      input.expressTurnaroundMinutes <= 0)
  ) {
    throw new CatalogError(
      "INVALID_SERVICE_TRANSITION",
      "Express turnaround must be a positive number of minutes.",
    )
  }
  if (
    !Number.isSafeInteger(input.reminderLeadMinutes) ||
    input.reminderLeadMinutes < 0
  ) {
    throw new CatalogError(
      "INVALID_SERVICE_TRANSITION",
      "Reminder lead time must be a non-negative number of minutes.",
    )
  }
  const settings = await db.serviceStoreSettings.upsert({
    create: {
      autoNotifyReady: input.autoNotifyReady,
      autoNotifyReminder: input.autoNotifyReminder,
      defaultNotificationChannel:
        input.defaultNotificationChannel === "whatsapp"
          ? ServiceNotificationChannel.WHATSAPP
          : input.defaultNotificationChannel === "sms"
            ? ServiceNotificationChannel.SMS
            : null,
      expressEnabled: input.expressEnabled,
      expressLabel,
      expressSurchargeType:
        input.expressSurchargeType === "fixed"
          ? ServiceSurchargeType.FIXED
          : ServiceSurchargeType.PERCENTAGE,
      expressSurchargeValue: input.expressSurchargeValue,
      expressTurnaroundMinutes: input.expressTurnaroundMinutes,
      reminderLeadMinutes: input.reminderLeadMinutes,
      storeId: store.id,
      tenantId: input.tenantId,
    },
    update: {
      autoNotifyReady: input.autoNotifyReady,
      autoNotifyReminder: input.autoNotifyReminder,
      defaultNotificationChannel:
        input.defaultNotificationChannel === "whatsapp"
          ? ServiceNotificationChannel.WHATSAPP
          : input.defaultNotificationChannel === "sms"
            ? ServiceNotificationChannel.SMS
            : null,
      expressEnabled: input.expressEnabled,
      expressLabel,
      expressSurchargeType:
        input.expressSurchargeType === "fixed"
          ? ServiceSurchargeType.FIXED
          : ServiceSurchargeType.PERCENTAGE,
      expressSurchargeValue: input.expressSurchargeValue,
      expressTurnaroundMinutes: input.expressTurnaroundMinutes,
      reminderLeadMinutes: input.reminderLeadMinutes,
    },
    where: { storeId: store.id },
  })
  return serializeSettings(settings, store.id)
}
