import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  CatalogItemKind,
  ServiceFulfillmentMode,
  ServiceJobEventType,
  ServiceJobStatus,
  ServiceNotificationChannel,
  ServiceNotificationIntentStatus,
  ServiceNotificationIntentType,
  ServiceRequestStatus,
} from "../../generated/prisma/enums"
import { getLegacyServiceOperationsSnapshot } from "./business-templates"

export type LegacyServiceOperationsMigrationSummary = {
  dryRun: boolean
  migrated: {
    jobs: number
    notificationIntents: number
    requestLinks: number
    requests: number
    serviceItems: number
  }
  scannedStores: number
  skippedStores: number
}

function asMetadata(value: Record<string, unknown>): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 42) || "service"
  )
}

function legacySku(itemId: string, variantId: string) {
  return `legacy-service-${itemId}-${variantId}`
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .slice(0, 64)
}

function mapLegacyJobStatus(status: string) {
  switch (status) {
    case "completed":
      return ServiceJobStatus.COMPLETED
    case "cancelled":
      return ServiceJobStatus.CANCELLED
    case "ready":
    case "pickup_pending":
    case "delivery_pending":
      return ServiceJobStatus.READY
    case "in_progress":
    case "delayed":
      return ServiceJobStatus.IN_PROGRESS
    default:
      return ServiceJobStatus.RECEIVED
  }
}

function mapLegacyOrderStatus(status: string) {
  switch (status) {
    case "completed":
      return "COMPLETED" as const
    case "cancelled":
      return "CANCELLED" as const
    case "ready":
    case "pickup_pending":
      return "READY_FOR_PICKUP" as const
    case "delivery_pending":
      return "OUT_FOR_DELIVERY" as const
    case "in_progress":
    case "delayed":
      return "FULFILLING" as const
    default:
      return "CONFIRMED" as const
  }
}

function mapLegacyRequestStatus(status: string) {
  switch (status) {
    case "confirmed":
      return ServiceRequestStatus.CONFIRMED
    case "converted":
      return ServiceRequestStatus.CONVERTED
    case "rejected":
      return ServiceRequestStatus.REJECTED
    case "cancelled":
      return ServiceRequestStatus.CANCELLED
    default:
      return ServiceRequestStatus.PENDING
  }
}

async function createUniqueLegacySlug(
  db: PrismaClient,
  input: { name: string; storeId: string },
) {
  const base = slugify(input.name)
  for (let index = 0; index < 100; index += 1) {
    const slug = index === 0 ? base : `${base}-${index}`
    const exists = await db.product.findUnique({
      where: {
        storeId_slug: {
          slug,
          storeId: input.storeId,
        },
      },
      select: {
        id: true,
      },
    })
    if (!exists) return slug
  }
  return `${base}-${Date.now().toString(36)}`
}

async function migrateLegacyServiceItems(
  db: PrismaClient,
  input: {
    currencyCode: string
    dryRun: boolean
    metadata: unknown
    storeId: string
    tenantId: string
  },
) {
  const snapshot = getLegacyServiceOperationsSnapshot(input.metadata)
  const itemMap = new Map<
    string,
    {
      productId: string
      variants: Map<string, string>
      defaultVariantId: string
    }
  >()
  let migratedCount = 0

  for (const legacyItem of snapshot.serviceItems) {
    const existing = await db.product.findFirst({
      where: {
        legacyServiceItemId: legacyItem.id,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
      select: {
        id: true,
        variants: {
          select: {
            id: true,
            legacyServiceVariantId: true,
            isDefault: true,
          },
        },
      },
    })

    if (existing) {
      const defaultVariant =
        existing.variants.find((variant) => variant.isDefault) ??
        existing.variants[0]
      if (defaultVariant) {
        itemMap.set(legacyItem.id, {
          defaultVariantId: defaultVariant.id,
          productId: existing.id,
          variants: new Map(
            existing.variants.flatMap((variant) =>
              variant.legacyServiceVariantId
                ? [[variant.legacyServiceVariantId, variant.id] as const]
                : [],
            ),
          ),
        })
      }
      continue
    }

    migratedCount += 1
    if (input.dryRun) {
      itemMap.set(legacyItem.id, {
        defaultVariantId: `dry-run:${legacyItem.id}:standard`,
        productId: `dry-run:${legacyItem.id}`,
        variants: new Map(
          legacyItem.variants.map((variant) => [
            variant.id,
            `dry-run:${legacyItem.id}:${variant.id}`,
          ]),
        ),
      })
      continue
    }

    const slug = await createUniqueLegacySlug(db, {
      name: legacyItem.name,
      storeId: input.storeId,
    })
    const product = await db.product.create({
      data: {
        category: legacyItem.category,
        currencyCode: input.currencyCode,
        description: legacyItem.description,
        kind: CatalogItemKind.SERVICE,
        legacyServiceItemId: legacyItem.id,
        listPriceMinor: legacyItem.priceMinor,
        metadata: asMetadata({
          migration: {
            source: "legacy_service_metadata",
            version: 1,
          },
        }),
        name: legacyItem.name,
        slug,
        status: legacyItem.status === "archived" ? "ARCHIVED" : "ACTIVE",
        storeId: input.storeId,
        tenantId: input.tenantId,
        serviceProfile: {
          create: {
            estimatedTurnaroundHours: legacyItem.estimatedTurnaroundHours,
            fulfillmentMode: ServiceFulfillmentMode.TRACKED,
          },
        },
        variants: {
          create: [
            {
              isActive: legacyItem.status !== "archived",
              isDefault: true,
              name: "Standard",
              priceMinor: legacyItem.priceMinor,
              sku: legacySku(legacyItem.id, "standard"),
              metadata: asMetadata({
                migration: {
                  source: "legacy_service_metadata",
                  version: 1,
                },
              }),
            },
            ...legacyItem.variants.map((variant) => ({
              isActive: legacyItem.status !== "archived",
              isDefault: false,
              legacyServiceVariantId: variant.id,
              name: variant.name,
              priceMinor: variant.priceMinor,
              sku: legacySku(legacyItem.id, variant.id),
              metadata: asMetadata({
                migration: {
                  source: "legacy_service_metadata",
                  version: 1,
                },
              }),
            })),
          ],
        },
      },
      select: {
        id: true,
        variants: {
          select: {
            id: true,
            isDefault: true,
            legacyServiceVariantId: true,
          },
        },
      },
    })
    const defaultVariant =
      product.variants.find((variant) => variant.isDefault) ??
      product.variants[0]
    if (defaultVariant) {
      itemMap.set(legacyItem.id, {
        defaultVariantId: defaultVariant.id,
        productId: product.id,
        variants: new Map(
          product.variants.flatMap((variant) =>
            variant.legacyServiceVariantId
              ? [[variant.legacyServiceVariantId, variant.id] as const]
              : [],
          ),
        ),
      })
    }
  }

  if (input.dryRun) {
    const existingItems = await db.product.findMany({
      where: {
        legacyServiceItemId: {
          in: snapshot.serviceItems.map((item) => item.id),
        },
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
      select: {
        id: true,
        legacyServiceItemId: true,
        variants: {
          select: {
            id: true,
            isDefault: true,
            legacyServiceVariantId: true,
          },
        },
      },
    })
    for (const item of existingItems) {
      if (!item.legacyServiceItemId) continue
      const defaultVariant =
        item.variants.find((variant) => variant.isDefault) ?? item.variants[0]
      if (!defaultVariant) continue
      itemMap.set(item.legacyServiceItemId, {
        defaultVariantId: defaultVariant.id,
        productId: item.id,
        variants: new Map(
          item.variants.flatMap((variant) =>
            variant.legacyServiceVariantId
              ? [[variant.legacyServiceVariantId, variant.id] as const]
              : [],
          ),
        ),
      })
    }
  }

  return { itemMap, migratedCount, snapshot }
}

async function migrateLegacyRequestLinks(
  db: PrismaClient,
  input: {
    dryRun: boolean
    requestLinks: ReturnType<
      typeof getLegacyServiceOperationsSnapshot
    >["requestLinks"]
    storeId: string
    tenantId: string
  },
) {
  const linkMap = new Map<string, string>()
  let migratedCount = 0
  for (const link of input.requestLinks) {
    const existing = await db.serviceRequestLink.findFirst({
      where: {
        legacyId: link.id,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
      select: { id: true },
    })
    if (existing) {
      linkMap.set(link.id, existing.id)
      continue
    }
    migratedCount += 1
    if (input.dryRun) {
      linkMap.set(link.id, `dry-run:${link.id}`)
      continue
    }
    const created = await db.serviceRequestLink.create({
      data: {
        createdAt: new Date(link.createdAt),
        createdByUserId: link.createdByUserId,
        disabledAt: link.disabledAt ? new Date(link.disabledAt) : null,
        label: link.label,
        legacyId: link.id,
        metadata: asMetadata({
          migration: { source: "legacy_service_metadata", version: 1 },
        }),
        storeId: input.storeId,
        tenantId: input.tenantId,
        token: link.token,
      },
      select: { id: true },
    })
    linkMap.set(link.id, created.id)
  }
  return { linkMap, migratedCount }
}

async function migrateLegacyJobs(
  db: PrismaClient,
  input: {
    dryRun: boolean
    itemMap: Map<
      string,
      {
        defaultVariantId: string
        productId: string
        variants: Map<string, string>
      }
    >
    orders: ReturnType<typeof getLegacyServiceOperationsSnapshot>["orders"]
    storeId: string
    tenantId: string
  },
) {
  const orderMap = new Map<string, { jobId: string; orderId: string }>()
  let migratedCount = 0
  for (const legacyOrder of input.orders) {
    const existing = await db.serviceJob.findFirst({
      where: {
        legacyId: legacyOrder.id,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
      select: {
        id: true,
        orderId: true,
      },
    })
    if (existing) {
      orderMap.set(legacyOrder.id, {
        jobId: existing.id,
        orderId: existing.orderId,
      })
      continue
    }

    const mappedLines = legacyOrder.lines.flatMap((line) => {
      const item = input.itemMap.get(line.serviceItemId)
      if (!item) return []
      return [
        {
          item,
          legacy: line,
          productVariantId:
            (line.variantId ? item.variants.get(line.variantId) : undefined) ??
            item.defaultVariantId,
        },
      ]
    })
    if (mappedLines.length === 0) continue
    migratedCount += 1
    if (input.dryRun) {
      orderMap.set(legacyOrder.id, {
        jobId: `dry-run:${legacyOrder.id}:job`,
        orderId: `dry-run:${legacyOrder.id}:order`,
      })
      continue
    }

    const created = await db.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          createdAt: new Date(legacyOrder.createdAt),
          currencyCode: legacyOrder.currencyCode,
          customerEmail: legacyOrder.customer.email,
          customerName: legacyOrder.customer.name,
          customerPhone: legacyOrder.customer.phone,
          metadata: asMetadata({
            migration: {
              legacyServiceOrderId: legacyOrder.id,
              source: "legacy_service_metadata",
              version: 1,
            },
          }),
          orderNumber: `LEGACY-${legacyOrder.id}`.slice(0, 64),
          paymentStatus:
            legacyOrder.paymentStatus === "paid" ? "PAID" : "PENDING",
          status: mapLegacyOrderStatus(legacyOrder.status),
          storeId: input.storeId,
          subtotalMinor: legacyOrder.totalMinor,
          tenantId: input.tenantId,
          totalMinor: legacyOrder.totalMinor,
          items: {
            create: mappedLines.map(({ item, legacy, productVariantId }) => ({
              kindSnapshot: CatalogItemKind.SERVICE,
              metadata: asMetadata({
                migration: {
                  source: "legacy_service_metadata",
                  version: 1,
                },
              }),
              nameSnapshot: legacy.serviceItemName,
              productId: item.productId,
              productVariantId,
              quantity: legacy.quantity,
              totalPriceMinor: legacy.totalPriceMinor,
              unitPriceMinor: legacy.unitPriceMinor,
            })),
          },
        },
        select: {
          id: true,
          items: {
            select: {
              id: true,
              productId: true,
              productVariantId: true,
            },
          },
        },
      })
      const job = await tx.serviceJob.create({
        data: {
          cancelledAt:
            legacyOrder.status === "cancelled"
              ? new Date(legacyOrder.updatedAt)
              : null,
          completedAt: legacyOrder.completedAt
            ? new Date(legacyOrder.completedAt)
            : null,
          createdAt: new Date(legacyOrder.createdAt),
          dueAt: legacyOrder.dueAt ? new Date(legacyOrder.dueAt) : null,
          legacyId: legacyOrder.id,
          metadata: asMetadata({
            migration: { source: "legacy_service_metadata", version: 1 },
          }),
          orderId: order.id,
          source:
            legacyOrder.source === "public_request"
              ? "public_request"
              : "walk_in",
          status: mapLegacyJobStatus(legacyOrder.status),
          storeId: input.storeId,
          tenantId: input.tenantId,
          trackingToken: legacyOrder.trackingToken,
          lines: {
            create: order.items.map((orderItem) => {
              const mapped = mappedLines.find(
                ({ item, productVariantId }) =>
                  item.productId === orderItem.productId &&
                  productVariantId === orderItem.productVariantId,
              )
              if (!mapped) {
                throw new Error("Legacy service line mapping failed.")
              }
              return {
                nameSnapshot: mapped.legacy.serviceItemName,
                orderItemId: orderItem.id,
                productId: orderItem.productId,
                productVariantId: orderItem.productVariantId,
                quantity: mapped.legacy.quantity,
                totalPriceMinor: mapped.legacy.totalPriceMinor,
                unitPriceMinor: mapped.legacy.unitPriceMinor,
                variantNameSnapshot: mapped.legacy.variantName,
              }
            }),
          },
        },
        select: { id: true },
      })

      await tx.serviceJobEvent.createMany({
        data: [
          {
            actorUserId: legacyOrder.actorUserId,
            happenedAt: new Date(legacyOrder.createdAt),
            serviceJobId: job.id,
            toStatus: ServiceJobStatus.RECEIVED,
            type: ServiceJobEventType.CREATED,
          },
          ...legacyOrder.events.map((event) => ({
            actorUserId: event.actorUserId,
            happenedAt: new Date(event.at),
            note: event.note,
            serviceJobId: job.id,
            toStatus: mapLegacyJobStatus(event.status),
            type:
              event.status === "delayed"
                ? ServiceJobEventType.DELAYED
                : ServiceJobEventType.STATUS_CHANGED,
          })),
          ...legacyOrder.notes.map((note) => ({
            actorUserId: note.actorUserId,
            happenedAt: new Date(note.at),
            note: note.text,
            serviceJobId: job.id,
            toStatus: null,
            type: ServiceJobEventType.NOTE_ADDED,
          })),
        ],
      })
      if (legacyOrder.evidence.length > 0) {
        await tx.serviceJobEvidence.createMany({
          data: legacyOrder.evidence.map((evidence) => ({
            actorUserId: evidence.actorUserId,
            addedAt: new Date(evidence.addedAt),
            label: evidence.label,
            legacyId: evidence.id,
            serviceJobId: job.id,
            url: evidence.url,
          })),
        })
      }
      return { jobId: job.id, orderId: order.id }
    })
    orderMap.set(legacyOrder.id, created)
  }
  return { migratedCount, orderMap }
}

async function migrateLegacyRequests(
  db: PrismaClient,
  input: {
    currencyCode: string
    dryRun: boolean
    itemMap: Map<
      string,
      {
        defaultVariantId: string
        productId: string
        variants: Map<string, string>
      }
    >
    linkMap: Map<string, string>
    orderMap: Map<string, { jobId: string; orderId: string }>
    requests: ReturnType<typeof getLegacyServiceOperationsSnapshot>["requests"]
    storeId: string
    tenantId: string
  },
) {
  let migratedCount = 0
  for (const legacyRequest of input.requests) {
    const exists = await db.serviceRequest.findFirst({
      where: {
        legacyId: legacyRequest.id,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
      select: { id: true },
    })
    if (exists) continue
    const requestLinkId = input.linkMap.get(legacyRequest.requestLinkId)
    if (!requestLinkId) continue
    const mappedLines = legacyRequest.lines.flatMap((line) => {
      const item = input.itemMap.get(line.serviceItemId)
      if (!item) return []
      return [
        {
          item,
          legacy: line,
          productVariantId:
            (line.variantId ? item.variants.get(line.variantId) : undefined) ??
            item.defaultVariantId,
        },
      ]
    })
    if (mappedLines.length === 0) continue
    migratedCount += 1
    if (input.dryRun) continue
    const convertedOrderId = legacyRequest.convertedOrderId
      ? input.orderMap.get(legacyRequest.convertedOrderId)?.orderId
      : undefined
    await db.serviceRequest.create({
      data: {
        convertedAt: convertedOrderId
          ? new Date(legacyRequest.updatedAt)
          : null,
        convertedOrderId,
        createdAt: new Date(legacyRequest.createdAt),
        currencyCode: input.currencyCode,
        customerEmail: legacyRequest.customer.email,
        customerName: legacyRequest.customer.name,
        customerPhone: legacyRequest.customer.phone,
        legacyId: legacyRequest.id,
        metadata: asMetadata({
          migration: { source: "legacy_service_metadata", version: 1 },
        }),
        notes: legacyRequest.notes,
        requestLinkId,
        status: mapLegacyRequestStatus(legacyRequest.status),
        storeId: input.storeId,
        tenantId: input.tenantId,
        totalMinor: legacyRequest.totalMinor,
        trackingToken: legacyRequest.trackingToken,
        lines: {
          create: mappedLines.map(({ item, legacy, productVariantId }) => ({
            nameSnapshot: legacy.serviceItemName,
            productId: item.productId,
            productVariantId,
            quantity: legacy.quantity,
            totalPriceMinor: legacy.totalPriceMinor,
            unitPriceMinor: legacy.unitPriceMinor,
            variantNameSnapshot: legacy.variantName,
          })),
        },
      },
    })
  }
  return migratedCount
}

async function migrateLegacyNotifications(
  db: PrismaClient,
  input: {
    dryRun: boolean
    intents: ReturnType<
      typeof getLegacyServiceOperationsSnapshot
    >["notificationIntents"]
    orderMap: Map<string, { jobId: string; orderId: string }>
    storeId: string
    tenantId: string
  },
) {
  let migratedCount = 0
  for (const legacyIntent of input.intents) {
    const job = input.orderMap.get(legacyIntent.orderId)
    if (!job) continue
    const exists = await db.serviceNotificationIntent.findFirst({
      where: {
        legacyId: legacyIntent.id,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
      select: { id: true },
    })
    if (exists) continue
    migratedCount += 1
    if (input.dryRun) continue
    await db.serviceNotificationIntent.create({
      data: {
        channel: ServiceNotificationChannel.MANUAL,
        createdAt: new Date(legacyIntent.createdAt),
        customerPhone: legacyIntent.customerPhone,
        legacyId: legacyIntent.id,
        manualCopy: legacyIntent.manualCopy,
        serviceJobId: job.jobId,
        status: ServiceNotificationIntentStatus.PENDING,
        storeId: input.storeId,
        tenantId: input.tenantId,
        type:
          legacyIntent.type === "ready"
            ? ServiceNotificationIntentType.READY
            : ServiceNotificationIntentType.DELAY,
      },
    })
  }
  return migratedCount
}

export async function migrateLegacyServiceOperations(
  db: PrismaClient,
  input: {
    afterStoreId?: string
    batchSize?: number
    dryRun?: boolean
    storeId?: string
    tenantId?: string
  } = {},
): Promise<LegacyServiceOperationsMigrationSummary> {
  const dryRun = input.dryRun !== false
  const stores = await db.store.findMany({
    where: {
      ...(input.afterStoreId ? { id: { gt: input.afterStoreId } } : {}),
      ...(input.storeId ? { id: input.storeId } : {}),
      ...(input.tenantId ? { tenantId: input.tenantId } : {}),
      status: { not: "ARCHIVED" },
    },
    orderBy: { id: "asc" },
    take: Math.min(Math.max(input.batchSize ?? 100, 1), 1_000),
    select: {
      currencyCode: true,
      id: true,
      metadata: true,
      tenantId: true,
    },
  })
  const summary: LegacyServiceOperationsMigrationSummary = {
    dryRun,
    migrated: {
      jobs: 0,
      notificationIntents: 0,
      requestLinks: 0,
      requests: 0,
      serviceItems: 0,
    },
    scannedStores: stores.length,
    skippedStores: 0,
  }

  for (const store of stores) {
    const snapshot = getLegacyServiceOperationsSnapshot(store.metadata)
    if (
      snapshot.serviceItems.length === 0 &&
      snapshot.orders.length === 0 &&
      snapshot.requestLinks.length === 0 &&
      snapshot.requests.length === 0
    ) {
      summary.skippedStores += 1
      continue
    }
    const items = await migrateLegacyServiceItems(db, {
      currencyCode: store.currencyCode,
      dryRun,
      metadata: store.metadata,
      storeId: store.id,
      tenantId: store.tenantId,
    })
    summary.migrated.serviceItems += items.migratedCount
    const links = await migrateLegacyRequestLinks(db, {
      dryRun,
      requestLinks: snapshot.requestLinks,
      storeId: store.id,
      tenantId: store.tenantId,
    })
    summary.migrated.requestLinks += links.migratedCount
    const jobs = await migrateLegacyJobs(db, {
      dryRun,
      itemMap: items.itemMap,
      orders: snapshot.orders,
      storeId: store.id,
      tenantId: store.tenantId,
    })
    summary.migrated.jobs += jobs.migratedCount
    summary.migrated.requests += await migrateLegacyRequests(db, {
      currencyCode: store.currencyCode,
      dryRun,
      itemMap: items.itemMap,
      linkMap: links.linkMap,
      orderMap: jobs.orderMap,
      requests: snapshot.requests,
      storeId: store.id,
      tenantId: store.tenantId,
    })
    summary.migrated.notificationIntents += await migrateLegacyNotifications(
      db,
      {
        dryRun,
        intents: snapshot.notificationIntents,
        orderMap: jobs.orderMap,
        storeId: store.id,
        tenantId: store.tenantId,
      },
    )
  }

  return summary
}
