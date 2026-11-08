import { z } from "zod"
import {
  type BillingCheckoutSession,
  Prisma,
} from "../../../generated/prisma/client"
import type { DbClient } from "../types"

export type OwnerWebSession = Pick<
  BillingCheckoutSession,
  | "id"
  | "tenantId"
  | "requestedByUserId"
  | "provider"
  | "providerSessionId"
  | "status"
  | "checkoutUrl"
  | "createdAt"
  | "completedAt"
  | "metadata"
>
const snapshotSchema = z.object({
  id: z.uuid(),
  tenantId: z.string(),
  requestedByUserId: z.string(),
  provider: z.literal("OTHER"),
  providerSessionId: z.string(),
  status: z.enum([
    "CREATED",
    "PENDING",
    "COMPLETED",
    "CANCELLED",
    "EXPIRED",
    "FAILED",
  ]),
  checkoutUrl: z.string().nullable(),
  createdAt: z.iso.datetime().transform((s) => new Date(s)),
  completedAt: z.iso
    .datetime()
    .nullable()
    .transform((s) => (s ? new Date(s) : null)),
})

function readJournal(payload: unknown): OwnerWebSession {
  const parsed = z
    .object({
      session: snapshotSchema,
      ownerWeb: z.record(z.string(), z.json()),
    })
    .parse(payload)
  return { ...parsed.session, metadata: { ownerWeb: parsed.ownerWeb } }
}

/** Tenant-less journal survives deletion of the legacy checkout projection. */
export async function saveOwnerWebSession(
  tx: DbClient,
  session: OwnerWebSession,
) {
  const metadata = z
    .object({ ownerWeb: z.record(z.string(), z.json()) })
    .parse(session.metadata)
  const data = {
    type: "owner_paystack_checkout",
    status: "PROCESSED" as const,
    processedAt: new Date(),
    tenantId: null,
    metadata,
    payload: {
      session: {
        id: session.id,
        tenantId: session.tenantId,
        requestedByUserId: session.requestedByUserId,
        provider: session.provider,
        providerSessionId: session.providerSessionId,
        status: session.status,
        checkoutUrl: session.checkoutUrl,
        createdAt: session.createdAt.toISOString(),
        completedAt: session.completedAt?.toISOString() ?? null,
      },
      ownerWeb: metadata.ownerWeb,
    } satisfies Prisma.InputJsonObject,
  }
  await tx.billingProviderEvent.upsert({
    where: {
      provider_eventId: {
        provider: "OTHER",
        eventId: `owner-paystack-checkout:${session.id}`,
      },
    },
    create: {
      ...data,
      provider: "OTHER",
      eventId: `owner-paystack-checkout:${session.id}`,
    },
    update: data,
  })
}

export async function loadOwnerWebSession(db: DbClient, id: string) {
  const event = await db.billingProviderEvent.findUnique({
    where: {
      provider_eventId: {
        provider: "OTHER",
        eventId: `owner-paystack-checkout:${id}`,
      },
    },
  })
  if (event) return readJournal(event.payload)
  return db.billingCheckoutSession.findUnique({ where: { id } })
}

export async function updateOwnerWebSession(
  tx: DbClient,
  session: OwnerWebSession,
  changes: Partial<OwnerWebSession>,
) {
  const next = { ...session, ...changes }
  // This Tenant-linked row is a compatibility projection, not the payment authority.
  await tx.billingCheckoutSession.updateMany({
    where: { id: session.id },
    data: {
      status: next.status,
      checkoutUrl: next.checkoutUrl,
      completedAt: next.completedAt,
      metadata: next.metadata ?? {},
    },
  })
  await saveOwnerWebSession(tx, next)
  return next
}

export async function findPendingOwnerWebCheckout(
  db: DbClient,
  accountId: string,
  tenantId?: string,
) {
  const event = await db.billingProviderEvent.findFirst({
    where: {
      provider: "OTHER",
      type: "owner_paystack_checkout",
      AND: [
        { metadata: { path: ["ownerWeb", "accountId"], equals: accountId } },
        {
          OR: ["preparing", "ready", "uncertain"].map((state) => ({
            metadata: { path: ["ownerWeb", "state"], equals: state },
          })),
        },
        ...(tenantId
          ? [{ payload: { path: ["session", "tenantId"], equals: tenantId } }]
          : []),
      ],
    },
    orderBy: { createdAt: "desc" },
  })
  return event ? readJournal(event.payload) : null
}

export async function latestOwnerWebCheckout(
  db: DbClient,
  accountId: string,
  tenantId?: string,
) {
  const event = await db.billingProviderEvent.findFirst({
    where: {
      provider: "OTHER",
      type: "owner_paystack_checkout",
      AND: [
        { metadata: { path: ["ownerWeb", "accountId"], equals: accountId } },
        ...(tenantId
          ? [{ payload: { path: ["session", "tenantId"], equals: tenantId } }]
          : []),
      ],
    },
    orderBy: { createdAt: "desc" },
  })
  return event ? readJournal(event.payload) : null
}

export async function matchingOwnerWebCheckouts(
  db: DbClient,
  match: {
    customerCode: string
    authorizationDigest: string
    productId: string
    environment: string
    subscriptionCode: string
  },
) {
  const events = await db.billingProviderEvent.findMany({
    where: {
      provider: "OTHER",
      type: "owner_paystack_checkout",
      AND: [
        ...["customerCode", "authorizationDigest", "environment"].map(
          (key) => ({
            metadata: {
              path: ["ownerWeb", key],
              equals:
                match[
                  key as "customerCode" | "authorizationDigest" | "environment"
                ],
            },
          }),
        ),
        {
          metadata: {
            path: ["ownerWeb", "product", "productId"],
            equals: match.productId,
          },
        },
        {
          OR: [
            {
              metadata: {
                path: ["ownerWeb", "subscriptionCode"],
                equals: match.subscriptionCode,
              },
            },
            {
              metadata: {
                path: ["ownerWeb", "subscriptionCode"],
                equals: Prisma.JsonNull,
              },
            },
          ],
        },
      ],
    },
    take: 2,
  })
  return events
    .map((e) => readJournal(e.payload))
    .filter((row) => row.status === "COMPLETED")
}
