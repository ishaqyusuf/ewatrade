import {
  BUSINESS_OPERATING_MODEL_KEYS,
  OPERATING_CURRENCY_CODES,
} from "@ewatrade/utils"
import { isBusinessTypeKey } from "@ewatrade/utils/business-types"
import { isValidStoreLink } from "@ewatrade/utils/store-link"
import { z } from "zod"

const business = z
  .object({
    name: z.string().trim().min(1).max(120),
    slug: z.string().refine(isValidStoreLink, "Choose a valid store link"),
    typeKeys: z
      .array(
        z
          .string()
          .refine(isBusinessTypeKey, "Choose a supported business type"),
      )
      .min(1)
      .max(42),
    otherType: z.string().trim().max(60).optional(),
    operatingModel: z.enum(BUSINESS_OPERATING_MODEL_KEYS),
    countryCode: z.string().regex(/^[A-Z]{2}$/),
    currencyCode: z.enum(OPERATING_CURRENCY_CODES),
    description: z.string().trim().max(280).optional(),
    addressLine1: z.string().trim().max(200).optional(),
    city: z.string().trim().max(120).optional(),
    region: z.string().trim().max(120).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      v.typeKeys.includes("other") &&
      (!v.otherType || v.otherType.length < 2)
    )
      ctx.addIssue({
        code: "custom",
        path: ["otherType"],
        message: "Describe your business type in at least 2 characters",
      })
    if (new Set(v.typeKeys).size !== v.typeKeys.length)
      ctx.addIssue({
        code: "custom",
        path: ["typeKeys"],
        message: "Choose each type once",
      })
  })
export const ownerSignupDraftSchema = z
  .object({
    planId: z.enum(["starter", "growth", "pro"]),
    businesses: z.array(business).min(1).max(42),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (new Set(v.businesses.map((b) => b.slug)).size !== v.businesses.length)
      ctx.addIssue({
        code: "custom",
        path: ["businesses"],
        message: "Each business needs its own store link",
      })
    const types = v.businesses.flatMap((b) => b.typeKeys)
    if (new Set(types).size !== types.length)
      ctx.addIssue({
        code: "custom",
        path: ["businesses"],
        message: "Place each type in one business",
      })
  })
