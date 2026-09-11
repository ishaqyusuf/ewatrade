import { z } from "zod"

export const STORE_CONVERSATION_CUSTOMER_WORDING = [
  "temporarily_unavailable",
  "outside_service_hours",
] as const

export const STORE_CONVERSATION_PUBLIC_AVAILABILITY_REASONS = [
  "outside_service_hours",
  "store_temporarily_unavailable",
  "team_unavailable",
  "service_unavailable",
  "chat_unavailable",
] as const

export const STORE_CONVERSATION_AVAILABILITY_RECOVERY = [
  "view_history",
  "wait_until_reopen",
  "notify_when_available",
] as const

export const storeConversationServiceIntervalSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    endMinute: z.number().int().min(1).max(1_440),
    startMinute: z.number().int().min(0).max(1_439),
  })
  .strict()
  .refine((interval) => interval.startMinute < interval.endMinute, {
    message: "Service-hour intervals must end after they start.",
  })

export const storeConversationWeeklyHoursSchema = z
  .array(storeConversationServiceIntervalSchema)
  .max(28)
  .superRefine((intervals, context) => {
    for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek += 1) {
      const day = intervals
        .filter((interval) => interval.dayOfWeek === dayOfWeek)
        .sort((left, right) => left.startMinute - right.startMinute)
      for (let index = 1; index < day.length; index += 1) {
        const previous = day[index - 1]
        const current = day[index]
        if (previous && current && current.startMinute < previous.endMinute) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Service-hour intervals cannot overlap.",
            path: [intervals.indexOf(current)],
          })
        }
      }
    }
  })

export const storeConversationTimezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((timezone) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format()
      return true
    } catch {
      return false
    }
  }, "Choose a valid IANA timezone.")

const operationIdSchema = z.string().trim().min(8).max(160)
const storeIdSchema = z.string().trim().min(1).max(191)
const internalReasonSchema = z.string().trim().min(3).max(240)

export const storeConversationUnreadNotificationGraceSecondsSchema = z
  .number()
  .int()
  .min(30)
  .max(60)

export const storeConversationAvailabilityScheduleCommandSchema = z
  .object({
    clientOperationId: operationIdSchema,
    expectedRevision: z.number().int().nonnegative(),
    reason: internalReasonSchema,
    storeId: storeIdSchema,
    timezone: storeConversationTimezoneSchema,
    unreadNotificationGraceSeconds:
      storeConversationUnreadNotificationGraceSecondsSchema,
    weeklyHours: storeConversationWeeklyHoursSchema,
  })
  .strict()

export const storeConversationManualPauseCommandSchema = z
  .object({
    clientOperationId: operationIdSchema,
    customerWording: z.enum(STORE_CONVERSATION_CUSTOMER_WORDING),
    expectedRevision: z.number().int().nonnegative(),
    paused: z.boolean(),
    reason: internalReasonSchema,
    storeId: storeIdSchema,
  })
  .strict()

export const storeConversationAvailabilitySettingsInputSchema = z
  .object({ storeId: storeIdSchema })
  .strict()

export type StoreConversationServiceInterval = z.infer<
  typeof storeConversationServiceIntervalSchema
>
export type StoreConversationCustomerWording =
  (typeof STORE_CONVERSATION_CUSTOMER_WORDING)[number]
export type StoreConversationPublicAvailabilityReason =
  (typeof STORE_CONVERSATION_PUBLIC_AVAILABILITY_REASONS)[number]
export type StoreConversationAvailabilityRecovery =
  (typeof STORE_CONVERSATION_AVAILABILITY_RECOVERY)[number]
