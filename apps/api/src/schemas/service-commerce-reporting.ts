import {
  SERVICE_COMMERCE_REPORT_MAX_WINDOW_MILLISECONDS,
  serviceCommerceReportDrilldownSectionSchema,
} from "@ewatrade/service-commerce"
import { z } from "zod"

const idSchema = z.string().trim().min(1).max(191)

const reportWindowFields = {
  end: z.coerce.date(),
  start: z.coerce.date(),
  storeId: idSchema.optional(),
}

function validateReportWindow(
  value: { end: Date; start: Date },
  context: z.RefinementCtx,
) {
  if (value.end <= value.start) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Report end must be after report start.",
      path: ["end"],
    })
  }
  if (
    value.end.getTime() - value.start.getTime() >
    SERVICE_COMMERCE_REPORT_MAX_WINDOW_MILLISECONDS
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Report windows cannot exceed 366 days.",
      path: ["end"],
    })
  }
}

/**
 * Tenant and actor scope are intentionally absent: protected procedures derive
 * both from the authenticated tenant context before reaching the repository.
 */
export const serviceCommerceReportSchema = z
  .object(reportWindowFields)
  .strict()
  .superRefine(validateReportWindow)

export const serviceCommerceReportDrilldownSchema = z
  .object({
    category: serviceCommerceReportDrilldownSectionSchema,
    ...reportWindowFields,
  })
  .strict()
  .superRefine(validateReportWindow)
