import {
  BUSINESS_OPERATING_MODEL_KEYS,
  OPERATING_CURRENCY_CODES,
} from "@ewatrade/utils"
import { isBusinessTypeKey } from "@ewatrade/utils/business-types"
import { isValidStoreLink } from "@ewatrade/utils/store-link"
import { z } from "zod"

const draftBusiness = z
  .object({
    id: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{1,80}$/)
      .optional(),
    offerTouched: z.boolean().optional(),
    name: z.string().trim().max(120),
    slug: z.string().max(40),
    typeKeys: z
      .array(
        z
          .string()
          .refine(isBusinessTypeKey, "Choose a supported business type"),
      )
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

const business = draftBusiness
  .superRefine((v, ctx) => {
    if (!v.name.trim())
      ctx.addIssue({
        code: "custom",
        path: ["name"],
        message: "Enter a business name",
      })
    if (!isValidStoreLink(v.slug))
      ctx.addIssue({
        code: "custom",
        path: ["slug"],
        message: "Choose a valid store link",
      })
    if (!v.typeKeys.length)
      ctx.addIssue({
        code: "custom",
        path: ["typeKeys"],
        message: "Choose a business type",
      })
  })
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
const navigation = {
  step: z.enum(["type", "group", "store"]).optional(),
  storeIndex: z.number().int().min(0).max(41).optional(),
  groupedFor: z.string().max(2000).optional(),
  selectedTypeKeys: z
    .array(z.string().refine(isBusinessTypeKey))
    .max(42)
    .optional(),
  otherType: z.string().max(60).optional(),
}
export const ownerSignupDraftSchema = z
  .object({
    ...navigation,
    planId: z.enum(["starter", "growth", "pro"]),
    businesses: z.array(draftBusiness).max(42),
  })
  .strict()

export const ownerSignupCompletionSchema = z
  .object({
    ...navigation,
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
