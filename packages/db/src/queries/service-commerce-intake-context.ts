import type { DbClient } from "./types"

export class ServiceCommerceIntakeContextError extends Error {
  constructor() {
    super("The intake authorization context is no longer current.")
    this.name = "ServiceCommerceIntakeContextError"
  }
}

export type ServiceCommerceIntakeAuthorizationContext =
  | {
      entryPointId: string
      entryPointRevision: number
      kind: "entry_point"
    }
  | {
      inboundEventId: string
      kind: "inbound_event"
      providerEventId: string
    }
  | {
      actorUserId: string
      kind: "staff"
    }

export async function assertServiceCommerceIntakeContextInTransaction(
  db: DbClient,
  input: {
    context?: ServiceCommerceIntakeAuthorizationContext
    storeId: string
    tenantId: string
    vertical: "pharmacy" | "service"
  },
) {
  if (!input.context) return
  if (input.context.kind === "staff") {
    const assignment = await db.serviceCommerceStoreTeamAssignment.findFirst({
      select: { id: true },
      where: {
        capability: "ATTENDANT",
        membership: {
          acceptedAt: { not: null },
          status: "ACTIVE",
          tenantId: input.tenantId,
          userId: input.context.actorUserId,
        },
        status: "ACTIVE",
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (!assignment) throw new ServiceCommerceIntakeContextError()
    return
  }
  if (input.context.kind === "entry_point") {
    const entry = await db.customerEntryPoint.findFirst({
      select: { id: true },
      where: {
        id: input.context.entryPointId,
        revision: input.context.entryPointRevision,
        status: "PUBLISHED",
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (!entry) throw new ServiceCommerceIntakeContextError()
    return
  }
  const event = await db.whatsAppInboundEvent.findFirst({
    select: { id: true },
    where: {
      id: input.context.inboundEventId,
      providerEventId: input.context.providerEventId,
      routeVertical: input.vertical === "pharmacy" ? "PHARMACY" : "SERVICE",
      status: "PROCESSING",
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  if (!event) throw new ServiceCommerceIntakeContextError()
}
