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
    expectedAssetIds: z.array(identifier).max(8).optional(),
    optionVariantIds: z.array(identifier.nullable()).max(8).optional(),
    expectedOptionVariantIds: z.array(identifier.nullable()).max(8).optional(),
    expectedIllustrationId: z.string().nullable().optional(),
  })
  .strict()
  .refine(
    (input) =>
      (input.optionVariantIds === undefined ||
        input.optionVariantIds.length === input.assetIds.length) &&
      (input.expectedOptionVariantIds === undefined ||
        input.expectedOptionVariantIds.length ===
          input.expectedAssetIds?.length),
    "Each photo must have one assignment.",
  )
  .refine(
    (input) => !input.illustrationId || input.assetIds.length === 0,
    "Choose an illustration or photos, exclusively.",
  )

export const catalogPhotoGallerySchema = z
  .object({
    storeId: identifier.optional(),
    catalogItemId: identifier.optional(),
    scope: z.enum(["store", "all"]).default("store"),
    query: z.string().trim().max(80).optional(),
    category: z.string().trim().max(40).optional(),
    cursor: z.string().max(200).optional(),
    limit: z.number().int().min(1).max(60).optional(),
    // useInfiniteQuery adds the paging direction to the input.
    direction: z.enum(["forward", "backward"]).optional(),
  })
  .strict()

const galleryTitle = z.string().max(160).nullable().optional()
const galleryCategory = z.string().max(80).nullable().optional()

/** Keeps the actor's finished upload in My images without an Item. */
export const catalogPhotoAddToGallerySchema = z
  .object({
    storeId: identifier.optional(),
    assetId: identifier,
    title: galleryTitle,
    category: galleryCategory,
  })
  .strict()

/** Title and category of an image in My images; omitted fields stay. */
export const catalogGalleryDetailsSchema = z
  .object({
    /** Store of the copy the actor sees (entry.storeId). */
    storeId: identifier.optional(),
    assetId: identifier,
    title: galleryTitle,
    category: galleryCategory,
  })
  .strict()

export const catalogPhotoReuseSchema = z
  .object({
    /** Store of the Item that will show the copy. */
    storeId: identifier.optional(),
    sourceAssetId: identifier,
    sourceStoreId: identifier,
    clientOperationId: z.string().trim().min(8).max(160),
  })
  .strict()
