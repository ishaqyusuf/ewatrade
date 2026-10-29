import type { DbClient } from "./types"

type Scope = {
  tenantId: string
  storeIds: readonly string[]
  actorUserId: string
}

export async function countStorefrontNotifications(db: DbClient, scope: Scope) {
  return {
    unreadCount: await db.storefrontMerchantAlert.count({
      where: unreadWhere(scope),
    }),
  }
}

function unreadWhere(scope: Scope) {
  return {
    tenantId: scope.tenantId,
    storeId: { in: [...scope.storeIds] },
    NOT: { readByUserIds: { has: scope.actorUserId } },
  }
}

/** The request outbox is durable even when external delivery is unavailable. */
export async function listStorefrontNotifications(db: DbClient, scope: Scope) {
  const where = unreadWhere(scope)
  const [unreadCount, alerts] = await Promise.all([
    db.storefrontMerchantAlert.count({ where }),
    db.storefrontMerchantAlert.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 5,
      select: {
        id: true,
        kind: true,
        createdAt: true,
        orderRequestId: true,
        orderRequest: {
          select: {
            reference: true,
            customerName: true,
            fulfilment: true,
            currencyCode: true,
            observedSubtotalMinor: true,
            requestedAt: true,
            _count: { select: { lines: true } },
          },
        },
        serviceContext: {
          select: {
            id: true,
            reference: true,
            serviceRequest: {
              select: {
                customerName: true,
                requestedAt: true,
                _count: { select: { lines: true } },
              },
            },
          },
        },
      },
    }),
  ])
  return {
    unreadCount,
    items: alerts.map((alert) => ({
      id: alert.id,
      kind: alert.kind,
      createdAt: alert.createdAt.toISOString(),
      reference:
        alert.orderRequest?.reference ??
        alert.serviceContext?.reference ??
        "Website request",
      requestId: alert.orderRequestId ?? alert.serviceContext?.id ?? null,
      customerName:
        alert.orderRequest?.customerName ??
        alert.serviceContext?.serviceRequest.customerName ??
        null,
      itemCount:
        alert.orderRequest?._count.lines ??
        alert.serviceContext?.serviceRequest._count.lines ??
        0,
      fulfilment: alert.orderRequest?.fulfilment ?? null,
      subtotalMinor: alert.orderRequest?.observedSubtotalMinor ?? null,
      currencyCode: alert.orderRequest?.currencyCode ?? null,
      requestedAhead: Boolean(
        alert.orderRequest?.requestedAt ??
          alert.serviceContext?.serviceRequest.requestedAt,
      ),
    })),
  }
}

/** Personal acknowledgement has no effect on request, order or external alert state. */
export async function readStorefrontNotification(
  db: DbClient,
  scope: Scope,
  alertId: string,
) {
  const result = await db.storefrontMerchantAlert.updateMany({
    where: {
      id: alertId,
      tenantId: scope.tenantId,
      storeId: { in: [...scope.storeIds] },
      NOT: { readByUserIds: { has: scope.actorUserId } },
    },
    data: { readByUserIds: { push: scope.actorUserId } },
  })
  return { changed: result.count === 1 }
}
