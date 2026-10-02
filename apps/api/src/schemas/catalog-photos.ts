import {
  CATALOG_PHOTO_CONTENT_TYPES,
  CATALOG_PHOTO_MAX_BYTES,
} from "@ewatrade/catalog/photo-contracts"
import { findCatalogIllustration } from "@ewatrade/utils/catalog-illustrations"
import { z } from "zod"

const identifier = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/)

export const catalogPhotoIntentSchema = z
  .object({
    clientOperationId: z.string().trim().min(8).max(160),
    contentDigest: z.string().regex(/^[a-f0-9]{64}$/),
    contentType: z.enum(CATALOG_PHOTO_CONTENT_TYPES),
    sizeBytes: z.number().int().min(1).max(CATALOG_PHOTO_MAX_BYTES),
    storeId: identifier.optional(),
  })
  .strict()

export const catalogPhotoMetadataSchema = z
  .object({
    assetId: identifier,
    storeId: identifier.optional(),
  })
  .strict()

export const catalogPhotoReplacementSchema = z
  .object({
    catalogItemId: identifier,
    storeId: identifier.optional(),
    clientOperationId: z.string().min(8).max(160),
    illustrationId: z
      .string()
      .refine(
        (id) => Boolean(findCatalogIllustration(id)),
        "Unknown catalog illustration.",
      )
      .nullable()
      .optional(),
    assetIds: z
      .array(identifier)
      .max(8)
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "Choose distinct photos.",
      ),
  })
  .strict()
  .refine(
    (input) => !input.illustrationId || input.assetIds.length === 0,
    "Choose an illustration or photos, exclusively.",
  )
