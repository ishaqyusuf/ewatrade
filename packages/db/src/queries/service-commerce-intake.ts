import {
  type ServiceCommerceIntakeAccepted,
  type ServiceCommerceIntakeEnvelope,
  type ServiceCommerceIntakeRecovery,
  serviceCommerceIntakeEnvelopeSchema,
} from "@ewatrade/service-commerce"

import type { PrismaClient } from "../../generated/prisma/client"
import { createChannelCommerceInquiry } from "./commerce-inquiries"
import { resolveCustomerEntryPointIntakeContext } from "./customer-channels"
import { submitServiceCommercePrescriptionRequest } from "./prescription-requests"
import { resolveServiceCommerceCatalogSourceLine } from "./service-commerce-catalog-source"
import {
  type ServiceCommerceIntakeAuthorizationContext,
  ServiceCommerceIntakeContextError,
} from "./service-commerce-intake-context"
import { assertActiveServiceCommerceAttendant } from "./service-commerce-media-assets"
import { submitPublicServiceRequest } from "./service-public"

export class ServiceCommerceIntakeError extends Error {
  constructor(
    readonly code:
      | "AMBIGUOUS"
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "STALE_CONTEXT"
      | "UNSUPPORTED",
    message: string,
  ) {
    super(message)
    this.name = "ServiceCommerceIntakeError"
  }
}

type ResolvedIntakeScope = {
  actorUserId: string
  intakeContext?: ServiceCommerceIntakeAuthorizationContext
  routeVertical?: "pharmacy" | "service"
  storeId: string
  tenantId: string
}

async function resolveIntakeScope(
  db: PrismaClient,
  input: {
    actorUserId?: string
    envelope: ServiceCommerceIntakeEnvelope
    tenantId?: string
  },
): Promise<ResolvedIntakeScope> {
  const { envelope } = input
  if (envelope.context.kind === "entry_point") {
    const entry = await resolveCustomerEntryPointIntakeContext(db, {
      publicToken: envelope.context.token,
    })
    return {
      actorUserId: `public_entry_${entry.id}`,
      intakeContext: {
        entryPointId: entry.id,
        entryPointRevision: entry.revision,
        kind: "entry_point",
      },
      storeId: entry.storeId,
      tenantId: entry.tenantId,
    }
  }
  if (envelope.context.kind === "store") {
    if (!input.actorUserId || !input.tenantId) {
      throw new ServiceCommerceIntakeError(
        "FORBIDDEN",
        "Authenticated Store intake context is required.",
      )
    }
    await assertActiveServiceCommerceAttendant(db, {
      actorUserId: input.actorUserId,
      storeId: envelope.context.storeId,
      tenantId: input.tenantId,
    })
    return {
      actorUserId: input.actorUserId,
      intakeContext: { actorUserId: input.actorUserId, kind: "staff" },
      storeId: envelope.context.storeId,
      tenantId: input.tenantId,
    }
  }
  const event = await db.whatsAppInboundEvent.findFirst({
    select: {
      id: true,
      providerEventId: true,
      routeVertical: true,
      storeId: true,
      tenantId: true,
    },
    where: {
      id: envelope.context.inboundEventId,
      providerEventId: envelope.providerEventId,
      status: "PROCESSING",
    },
  })
  if (!event) {
    throw new ServiceCommerceIntakeError(
      "STALE_CONTEXT",
      "The WhatsApp intake context is no longer current.",
    )
  }
  const attendant = await db.serviceCommerceStoreTeamAssignment.findFirst({
    select: { id: true },
    where: {
      capability: "ATTENDANT",
      membership: {
        acceptedAt: { not: null },
        status: "ACTIVE",
        tenantId: event.tenantId,
      },
      status: "ACTIVE",
      storeId: event.storeId,
      tenantId: event.tenantId,
    },
  })
  if (!attendant) {
    throw new ServiceCommerceIntakeError(
      "FORBIDDEN",
      "No active Store attendant is available for this request.",
    )
  }
  return {
    actorUserId: `whatsapp_inbound_${event.id}`,
    intakeContext: {
      inboundEventId: event.id,
      kind: "inbound_event",
      providerEventId: event.providerEventId,
    },
    routeVertical: event.routeVertical === "PHARMACY" ? "pharmacy" : "service",
    storeId: event.storeId,
    tenantId: event.tenantId,
  }
}

function accepted(input: {
  channel: ServiceCommerceIntakeEnvelope["channel"]
  id: string
  kind: ServiceCommerceIntakeAccepted["source"]["kind"]
  replayed: boolean
}): ServiceCommerceIntakeAccepted {
  return {
    channel: input.channel,
    replayed: input.replayed,
    source: { id: input.id, kind: input.kind },
    status: "accepted",
  }
}

async function withCurrentIntakeContext<T>(operation: () => Promise<T>) {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof ServiceCommerceIntakeContextError) {
      throw new ServiceCommerceIntakeError(
        "STALE_CONTEXT",
        "The intake authorization context is no longer current.",
      )
    }
    throw error
  }
}

export async function submitServiceCommerceIntake(
  db: PrismaClient,
  input: {
    actorUserId?: string
    envelope: ServiceCommerceIntakeEnvelope
    tenantId?: string
  },
): Promise<ServiceCommerceIntakeAccepted | ServiceCommerceIntakeRecovery> {
  const envelope = serviceCommerceIntakeEnvelopeSchema.parse(input.envelope)
  const scope = await resolveIntakeScope(db, { ...input, envelope })
  const intent = envelope.intent
  if (intent.kind === "exact_product") {
    return {
      action: "use_cart",
      code: "unsupported",
      status: "recovery",
    }
  }
  const requestedVertical =
    intent.kind === "prescription" ? "pharmacy" : "service"
  if (scope.routeVertical && scope.routeVertical !== requestedVertical) {
    throw new ServiceCommerceIntakeError(
      "AMBIGUOUS",
      "The selected request type does not match this WhatsApp route.",
    )
  }
  if (intent.kind === "commerce_inquiry") {
    const result = await withCurrentIntakeContext(() =>
      createChannelCommerceInquiry(db, {
        actorUserId: scope.actorUserId,
        channelOrigin: envelope.channel,
        clientInquiryId: envelope.clientCommandId,
        consent: envelope.consent,
        customerEmail: intent.customer.email,
        customerName: intent.customer.name,
        customerPhone: intent.customer.phone,
        demand: intent.demand,
        lines: intent.lines,
        intakeContext: scope.intakeContext,
        providerEventId: envelope.providerEventId,
        storeId: scope.storeId,
        summary: intent.summary,
        tenantId: scope.tenantId,
        vertical: "service",
      }),
    )
    return accepted({
      channel: envelope.channel,
      id: result.id,
      kind: "commerce_inquiry",
      replayed: result.replayed,
    })
  }
  if (intent.kind === "service") {
    const result = await withCurrentIntakeContext(() =>
      submitPublicServiceRequest(db, {
        actorUserId: scope.actorUserId,
        channelOrigin: envelope.channel,
        clientRequestId: envelope.clientCommandId,
        consent: envelope.consent,
        customerEmail: intent.customer.email,
        customerName: intent.customer.name,
        customerPhone: intent.customer.phone,
        details: intent.details,
        expectedScope: { storeId: scope.storeId, tenantId: scope.tenantId },
        formToken: intent.formToken,
        intakeContext: scope.intakeContext,
        lines: intent.lines,
        providerEventId: envelope.providerEventId,
      }),
    )
    return accepted({
      channel: envelope.channel,
      id: result.id,
      kind: "service",
      replayed: !result.created,
    })
  }
  const result = await withCurrentIntakeContext(() =>
    submitServiceCommercePrescriptionRequest(db, {
      actorUserId: scope.actorUserId,
      channel: envelope.channel,
      clientRequestId: envelope.clientCommandId,
      consentAcceptedAt: new Date(),
      consentVersion: envelope.consent.privacyNoticeVersion,
      contactOptIn: envelope.consent.contactOptIn,
      customerEmail: intent.customer.email,
      customerName: intent.customer.name,
      customerPhone: intent.customer.phone,
      fulfilmentPreference: intent.fulfilmentPreference,
      manualIntakeText: intent.manualIntakeText,
      media: [],
      intakeContext: scope.intakeContext,
      providerEventId: envelope.providerEventId,
      storeId: scope.storeId,
      tenantId: scope.tenantId,
      useChannelNeutralAttribution: true,
    }),
  )
  return accepted({
    channel: envelope.channel,
    id: result.requestId,
    kind: "prescription",
    replayed: !result.created,
  })
}

export async function getCommerceInquiryIntakeAttachmentTarget(
  db: PrismaClient,
  input: {
    actorUserId: string
    inquiryId: string
    storeId: string
    tenantId: string
  },
) {
  const inquiry = await db.commerceInquiry.findFirst({
    select: {
      lines: {
        orderBy: { position: "asc" },
        select: { id: true },
        take: 1,
      },
    },
    where: {
      id: input.inquiryId,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  const line = inquiry?.lines[0]
  if (!line) {
    throw new ServiceCommerceIntakeError(
      "NOT_FOUND",
      "The Commerce Inquiry attachment target is unavailable.",
    )
  }
  const source = { id: input.inquiryId, kind: "commerce_inquiry" } as const
  const resolved = await resolveServiceCommerceCatalogSourceLine(db, {
    actorUserId: input.actorUserId,
    operation: "read",
    source,
    sourceLineId: line.id,
    storeId: input.storeId,
    tenantId: input.tenantId,
  })
  return {
    source,
    sourceLineId: line.id,
    sourceVersion: resolved.ref.sourceVersion,
  }
}
