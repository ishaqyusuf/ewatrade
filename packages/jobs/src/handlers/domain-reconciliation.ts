import { prisma } from "@ewatrade/db/client"
import {
  completeDomainRegistration,
  listDomainConnectionsForReconciliation,
  listDueManagedDomains,
  listUncertainDomainOrders,
  reconcileManagedDomain,
} from "@ewatrade/db/queries"
import { createDomainProvider } from "@ewatrade/domains"

import { domainConnectionVerificationHandler } from "./domain-connection-verification"

export type DomainReconciliationPayload = { limit?: number }

export async function domainReconciliationHandler(
  input: DomainReconciliationPayload,
  _attempt: number,
) {
  const limit = Math.min(input.limit ?? 100, 200)
  const connections = await listDomainConnectionsForReconciliation(prisma, {
    limit,
  })

  for (const connection of connections) {
    await domainConnectionVerificationHandler(
      { connectionId: connection.id },
      1,
    ).catch(() => null)
  }

  const uncertainOrders = await listUncertainDomainOrders(prisma, { limit })

  for (const order of uncertainOrders) {
    if (order.provider === "EXTERNAL") continue
    const attempt = order.operationAttempts[0]
    if (!attempt) continue
    const vercelProjectId = process.env.VERCEL_STOREFRONT_PROJECT_ID?.trim()
    if (!vercelProjectId) continue

    await createDomainProvider(order.provider)
      .getDomain(order.normalizedDomain)
      .then(async (providerState) => {
        if (providerState.status !== "active") return
        const responseMetadata =
          attempt.responseMetadata &&
          typeof attempt.responseMetadata === "object" &&
          !Array.isArray(attempt.responseMetadata)
            ? attempt.responseMetadata
            : {}

        await completeDomainRegistration(prisma, {
          attemptId: attempt.id,
          expiresAt: providerState.expiresAt,
          orderId: order.id,
          providerCustomerHandle:
            typeof responseMetadata.providerCustomerHandle === "string"
              ? responseMetadata.providerCustomerHandle
              : null,
          providerDomainId: providerState.providerDomainId,
          registeredAt: order.paidAt ?? new Date(),
          vercelProjectId,
        })
      })
      .catch(() => null)
  }

  const renewalWindow = new Date()
  renewalWindow.setDate(renewalWindow.getDate() + 45)
  const managedDomains = await listDueManagedDomains(prisma, {
    before: renewalWindow,
    limit,
  })

  for (const domain of managedDomains) {
    if (domain.provider === "EXTERNAL") continue

    await createDomainProvider(domain.provider)
      .getDomain(domain.hostname)
      .then((providerState) =>
        reconcileManagedDomain(prisma, {
          expiresAt: providerState.expiresAt,
          managedDomainId: domain.id,
          providerDomainId: providerState.providerDomainId,
          providerStatus: providerState.status,
        }),
      )
      .catch(() => null)
  }

  return {
    checkedConnections: connections.length,
    checkedManagedDomains: managedDomains.length,
    checkedUncertainOrders: uncertainOrders.length,
  }
}
