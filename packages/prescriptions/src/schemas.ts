import { z } from "zod"

export const PRESCRIPTION_OPERATING_DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const

export const PRESCRIPTION_REQUEST_STATUSES = [
  "attendant_verification",
  "converted",
  "declined",
  "expired",
  "media_review",
  "needs_clarification",
  "needs_clearer_media",
  "pharmacist_review",
  "quoted",
  "ready_to_quote",
  "received",
  "transcribing",
  "withdrawn",
] as const

export const prescriptionRequestStatusSchema = z.enum(
  PRESCRIPTION_REQUEST_STATUSES,
)
export type PrescriptionRequestStatus = z.infer<
  typeof prescriptionRequestStatusSchema
>

const optionalTrimmedString = (schema: z.ZodString) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    schema.optional(),
  )

const optionalOperatingTimeSchema = z
  .union([
    z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour HH:mm time."),
    z.literal(""),
  ])
  .optional()
  .transform((value) => value || undefined)

export const prescriptionOperatingHoursSchema = z
  .object({
    closesAt: optionalOperatingTimeSchema,
    day: z.enum(PRESCRIPTION_OPERATING_DAYS),
    isClosed: z.boolean(),
    opensAt: optionalOperatingTimeSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.isClosed) {
      if (value.opensAt || value.closesAt) {
        ctx.addIssue({
          code: "custom",
          message: "Closed days cannot include opening or closing times.",
        })
      }
      return
    }
    if (!value.opensAt || !value.closesAt || value.opensAt >= value.closesAt) {
      ctx.addIssue({
        code: "custom",
        message: "Enter valid opening and closing times.",
      })
    }
  })

export const prescriptionStoreSettingsFields = {
  consentVersion: z.string().trim().min(1).max(80),
  contactPolicy: z.string().trim().min(1).max(4_000),
  deliveryEnabled: z.boolean(),
  operatingHours: z
    .array(prescriptionOperatingHoursSchema)
    .min(1)
    .max(PRESCRIPTION_OPERATING_DAYS.length)
    .superRefine((hours, ctx) => {
      if (new Set(hours.map((entry) => entry.day)).size !== hours.length) {
        ctx.addIssue({
          code: "custom",
          message: "Operating hours can include each day only once.",
        })
      }
    }),
  pickupEnabled: z.boolean(),
  servicePolicy: z.string().trim().min(1).max(4_000),
} as const

export const prescriptionStoreSettingsFormSchema = z
  .object(prescriptionStoreSettingsFields)
  .strict()
  .refine(
    (value) =>
      value.operatingHours.length === PRESCRIPTION_OPERATING_DAYS.length,
    {
      message: "Configure operating hours for all seven days.",
      path: ["operatingHours"],
    },
  )
  .refine((value) => value.pickupEnabled || value.deliveryEnabled, {
    message: "Enable pickup, delivery, or both.",
    path: ["pickupEnabled"],
  })

export const prescriptionRoleAssignmentFields = {
  credentialReference: z.string().trim().max(320).optional(),
  credentialVerified: z.boolean(),
  role: z.enum(["attendant", "pharmacist"]),
  userId: z.string().trim().min(1, "Select a team member."),
} as const

export const prescriptionRoleAssignmentFormSchema = z
  .object(prescriptionRoleAssignmentFields)
  .strict()
  .superRefine((value, ctx) => {
    if (value.role !== "pharmacist") return
    if (!value.credentialReference) {
      ctx.addIssue({
        code: "custom",
        message: "Enter the pharmacist credential reference.",
        path: ["credentialReference"],
      })
    }
    if (!value.credentialVerified) {
      ctx.addIssue({
        code: "custom",
        message: "Confirm the credential has been verified.",
        path: ["credentialVerified"],
      })
    }
  })

export const prescriptionStaffIntakeFields = {
  consentAccepted: z.literal(true, {
    error: "Confirm the customer's consent.",
  }),
  consentVersion: z.string().trim().min(1).max(80),
  customerEmail: optionalTrimmedString(z.string().trim().email().max(320)),
  customerName: optionalTrimmedString(z.string().trim().min(1).max(160)),
  customerPhone: optionalTrimmedString(z.string().trim().min(7).max(40)),
  fulfilmentPreference: z.enum(["delivery", "pickup", "unspecified"]),
  source: z.enum(["staff_phone", "staff_walk_in"]),
} as const

export const prescriptionStaffIntakeFormSchema = z
  .object({
    ...prescriptionStaffIntakeFields,
    manualIntakeText: z.string().trim().max(8_000),
  })
  .strict()
  .refine((input) => input.customerPhone || input.customerEmail, {
    message: "Add a phone number or email address.",
    path: ["customerPhone"],
  })

export type PrescriptionRoleAssignmentFormValues = z.input<
  typeof prescriptionRoleAssignmentFormSchema
>
export type PrescriptionStaffIntakeFormValues = z.input<
  typeof prescriptionStaffIntakeFormSchema
>
export type PrescriptionStoreSettingsFormValues = z.input<
  typeof prescriptionStoreSettingsFormSchema
>
