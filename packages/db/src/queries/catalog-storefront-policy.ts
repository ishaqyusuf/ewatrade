import { createHash } from "node:crypto"
import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import { lockCatalogCommandInTransaction } from "./catalog-command-locks"
import { CatalogError } from "./catalog-errors"
import {
  type CatalogPhotoActorScope,
  authorizeCatalogPhotoScope,
} from "./catalog-photos"

export type CatalogStorefrontPolicyValue = {
  unavailable: boolean
  allowBookAhead: boolean
  /** Shown on the platform-hosted catalog once the Store is listed; products only. */
  platformListed: boolean
  revision: number
}

export const defaultCatalogStorefrontPolicy: CatalogStorefrontPolicyValue = {
  unavailable: false,
  allowBookAhead: false,
  platformListed: false,
  revision: 0,
}

export async function readCatalogStorefrontPolicy(
  db: PrismaClient,
  scope: CatalogPhotoActorScope & { catalogItemId: string },
) {
  return db.$transaction(
    async (tx) => {
      await authorizeCatalogPhotoScope(tx, scope)
      const item = await tx.catalogItem.findFirst({
        where: {
          id: scope.catalogItemId,
          tenantId: scope.tenantId,
          archivedAt: null,
          systemRole: null,
        },
        select: {
          id: true,
          offerings: {
            where: {
              status: "ACTIVE",
              archivedAt: null,
              kind: "SERVICE",
              storeAvailability: {
                some: { storeId: scope.storeId, isAvailable: true },
              },
            },
            select: { serviceOffering: { select: { bookingPolicy: true } } },
          },
        },
      })
      if (!item)
        throw new CatalogError(
          "CATALOG_ITEM_NOT_FOUND",
          "Catalog item not found.",
        )
      const policy = await tx.catalogStorefrontPolicy.findUnique({
        where: {
          tenantId_storeId_catalogItemId: {
            tenantId: scope.tenantId,
            storeId: scope.storeId,
            catalogItemId: scope.catalogItemId,
          },
        },
        select: {
          unavailable: true,
          allowBookAhead: true,
          platformListed: true,
          revision: true,
        },
      })
      return (
        policy ?? {
          ...defaultCatalogStorefrontPolicy,
          allowBookAhead: item.offerings.some(
            (offering) =>
              offering.serviceOffering?.bookingPolicy &&
              offering.serviceOffering.bookingPolicy !== "NOT_BOOKABLE",
          ),
        }
      )
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
}

/** CAS and durable command receipt keep concurrent edits and uncertain retries distinct. */
export async function setCatalogStorefrontPolicy(
  db: PrismaClient,
  input: CatalogPhotoActorScope & {
    catalogItemId: string
    unavailable: boolean
    allowBookAhead: boolean
    /** Omitted keeps the current listing, so older clients never unlist. */
    platformListed?: boolean
    expectedRevision: number
    clientOperationId: string
  },
) {
  const payloadHash = createHash("sha256")
    .update(
      JSON.stringify([
        input.actorUserId,
        input.storeId,
        input.catalogItemId,
        input.unavailable,
        input.allowBookAhead,
        input.expectedRevision,
        // Appended only when sent, so existing receipts keep their hashes.
        ...(input.platformListed === undefined ? [] : [input.platformListed]),
      ]),
    )
    .digest("hex")
  return db.$transaction(
    async (tx) => {
      await authorizeCatalogPhotoScope(tx, input)
      await lockCatalogCommandInTransaction(tx, input)
      const rows = await tx.$queryRaw<
        Array<{ id: string; kind: string }>
      >(Prisma.sql`
      SELECT "id", "kind" FROM "CatalogItem" WHERE "id"=${input.catalogItemId}
        AND "tenantId"=${input.tenantId} AND "archivedAt" IS NULL
        AND "systemRole" IS NULL AND "status" <> 'ARCHIVED' FOR UPDATE
    `)
      if (!rows.length)
        throw new CatalogError(
          "CATALOG_ITEM_NOT_FOUND",
          "Catalog item not found.",
        )
      if (input.platformListed && rows[0]?.kind !== "PRODUCT")
        throw new CatalogError(
          "INVALID_CATALOG_ITEM",
          "Only products can be listed on the public catalog.",
        )
      const previous = await tx.catalogCommandReceipt.findUnique({
        where: {
          tenantId_clientOperationId: {
            tenantId: input.tenantId,
            clientOperationId: input.clientOperationId,
          },
        },
      })
      if (previous) {
        if (
          previous.commandType !== "STOREFRONT_POLICY" ||
          previous.payloadHash !== payloadHash
        )
          throw new CatalogError(
            "INVALID_CATALOG_ITEM",
            "This save identity belongs to another change.",
          )
        const stored = await tx.catalogStorefrontPolicy.findUnique({
          where: {
            tenantId_storeId_catalogItemId: {
              tenantId: input.tenantId,
              storeId: input.storeId,
              catalogItemId: input.catalogItemId,
            },
          },
          select: { platformListed: true },
        })
        return {
          unavailable: input.unavailable,
          allowBookAhead: input.allowBookAhead,
          platformListed:
            input.platformListed ?? stored?.platformListed ?? false,
          revision: input.expectedRevision + 1,
          replayed: true,
        }
      }
      const where = {
        tenantId_storeId_catalogItemId: {
          tenantId: input.tenantId,
          storeId: input.storeId,
          catalogItemId: input.catalogItemId,
        },
      }
      const current = await tx.catalogStorefrontPolicy.findUnique({ where })
      if ((current?.revision ?? 0) !== input.expectedRevision)
        throw new CatalogError(
          "INVALID_CATALOG_ITEM",
          "Storefront settings changed. Reload before saving.",
        )
      const policy = await tx.catalogStorefrontPolicy.upsert({
        where,
        create: {
          ...where.tenantId_storeId_catalogItemId,
          unavailable: input.unavailable,
          allowBookAhead: input.allowBookAhead,
          platformListed: input.platformListed ?? false,
        },
        update: {
          unavailable: input.unavailable,
          allowBookAhead: input.allowBookAhead,
          ...(input.platformListed === undefined
            ? {}
            : { platformListed: input.platformListed }),
          revision: { increment: 1 },
        },
        select: {
          unavailable: true,
          allowBookAhead: true,
          platformListed: true,
          revision: true,
        },
      })
      await tx.catalogCommandReceipt.create({
        data: {
          tenantId: input.tenantId,
          clientOperationId: input.clientOperationId,
          commandType: "STOREFRONT_POLICY",
          payloadHash,
          catalogItemId: input.catalogItemId,
          storeId: input.storeId,
        },
      })
      return { ...policy, replayed: false }
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
}
