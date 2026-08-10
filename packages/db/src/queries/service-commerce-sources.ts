import {
  SERVICE_COMMERCE_CAPABILITIES,
  type ServiceCommerceAction,
  type ServiceCommerceCustomerRequestProjection,
  type ServiceCommerceRequestState,
  type ServiceCommerceSourceKind,
  type ServiceCommerceSourceRef,
  type ServiceCommerceVertical,
  serviceCommerceCustomerRequestProjectionSchema,
  serviceCommerceSourceRefSchema,
} from "@ewatrade/service-commerce"
import type {
  PrescriptionRequestStatus,
  ServiceRequestStatus,
} from "../../generated/prisma/enums"
import { normalizeCommerceInquiryState } from "./commerce-inquiries"
import { getServiceCommerceWorkspaceAccess } from "./service-commerce-access"
import { evaluateServiceCommercePolicyBatchInTransaction } from "./service-commerce-policy"
import type { DbClient } from "./types"

export class ServiceCommerceSourceError extends Error {
  constructor(
    readonly code: "FORBIDDEN" | "NOT_FOUND" | "NOT_READY",
    message: string,
  ) {
    super(message)
    this.name = "ServiceCommerceSourceError"
  }
}

type LoadedSource = {
  state: ServiceCommerceRequestState
  summary: string
  vertical: ServiceCommerceVertical
}

type SourceLoader = (
  db: DbClient,
  input: { id: string; storeId: string; tenantId: string },
) => Promise<LoadedSource | null>

const serviceStates = {
  CONVERTED: "converted",
  DECLINED: "declined",
  NEEDS_INFORMATION: "needs_clarification",
  QUOTED: "quoted",
  SUBMITTED: "received",
  WITHDRAWN: "withdrawn",
} satisfies Record<ServiceRequestStatus, ServiceCommerceRequestState>

const prescriptionStates = {
  ATTENDANT_VERIFICATION: "received",
  CONVERTED: "converted",
  DECLINED: "declined",
  EXPIRED: "expired",
  MEDIA_REVIEW: "received",
  NEEDS_CLARIFICATION: "needs_clarification",
  NEEDS_CLEARER_MEDIA: "needs_clarification",
  PHARMACIST_REVIEW: "received",
  QUOTED: "quoted",
  READY_TO_QUOTE: "ready_to_quote",
  RECEIVED: "received",
  TRANSCRIBING: "received",
  WITHDRAWN: "withdrawn",
} satisfies Record<PrescriptionRequestStatus, ServiceCommerceRequestState>

const sourceLoaders = {
  commerce_inquiry: async (db, input) => {
    const inquiry = await db.commerceInquiry.findFirst({
      select: { status: true, summary: true, vertical: true },
      where: {
        id: input.id,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    return inquiry
      ? {
          state: normalizeCommerceInquiryState(inquiry.status),
          summary: inquiry.summary,
          vertical: inquiry.vertical === "PHARMACY" ? "pharmacy" : "service",
        }
      : null
  },
  prescription: async (db, input) => {
    const request = await db.prescriptionRequest.findFirst({
      select: { status: true },
      where: {
        id: input.id,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    return request
      ? {
          state: prescriptionStates[request.status],
          summary: "Prescription request",
          vertical: "pharmacy",
        }
      : null
  },
  service: async (db, input) => {
    const request = await db.serviceRequest.findFirst({
      select: { status: true },
      where: {
        id: input.id,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    return request
      ? {
          state: serviceStates[request.status],
          summary: "Service request",
          vertical: "service",
        }
      : null
  },
} satisfies Record<ServiceCommerceSourceKind, SourceLoader>

function availableActions(
  state: ServiceCommerceRequestState,
  readiness: Awaited<
    ReturnType<typeof getServiceCommerceWorkspaceAccess>
  >["readiness"],
) {
  const actions: ServiceCommerceAction[] = []
  const ready = (capability: keyof typeof readiness.capabilities) =>
    readiness.capabilities[capability].readiness === "available"
  const hasCustomerChannel = ready("web") || ready("staff") || ready("whatsapp")

  if (
    hasCustomerChannel &&
    (state === "received" ||
      state === "needs_clarification" ||
      state === "ready_to_quote")
  ) {
    actions.push("talk_to_staff")
  }
  if (
    ready("quote") &&
    (state === "received" ||
      state === "needs_clarification" ||
      state === "ready_to_quote")
  ) {
    actions.push("request_quote")
  }
  if (state === "quoted") {
    if (ready("payment")) actions.push("pay_now")
    if (ready("pickup")) actions.push("pick_up")
    if (ready("delivery")) actions.push("delivery")
    if (hasCustomerChannel) actions.push("talk_to_staff")
  }
  return actions
}

export async function getServiceCommerceCustomerRequestProjection(
  db: DbClient,
  input: {
    actorUserId: string
    source: ServiceCommerceSourceRef
    storeId: string
    tenantId: string
  },
): Promise<ServiceCommerceCustomerRequestProjection> {
  const source = serviceCommerceSourceRefSchema.parse(input.source)
  const workspace = await getServiceCommerceWorkspaceAccess(db, input)
  if (!workspace.access.canOperate) {
    throw new ServiceCommerceSourceError(
      "FORBIDDEN",
      "Service Commerce source access is unavailable.",
    )
  }
  if (workspace.configuration.status !== "active") {
    throw new ServiceCommerceSourceError(
      "NOT_READY",
      "Service Commerce is not active for this Store.",
    )
  }

  const loaded = await sourceLoaders[source.kind](db, {
    id: source.id,
    storeId: input.storeId,
    tenantId: input.tenantId,
  })
  if (!loaded) {
    throw new ServiceCommerceSourceError(
      "NOT_FOUND",
      "Service Commerce source not found.",
    )
  }

  const capabilityScopes = SERVICE_COMMERCE_CAPABILITIES.map((capability) => ({
    channel:
      capability === "web" || capability === "whatsapp"
        ? capability
        : ("staff" as const),
    subject: capability,
    vertical: loaded.vertical,
  }))
  const policy = await evaluateServiceCommercePolicyBatchInTransaction(db, {
    actorUserId: input.actorUserId,
    purpose: "service_commerce_source_projection",
    scopes: capabilityScopes,
    storeId: input.storeId,
    tenantId: input.tenantId,
  })
  const sourceReadiness = Object.fromEntries(
    SERVICE_COMMERCE_CAPABILITIES.map((capability, index) => {
      const readiness = workspace.readiness.capabilities[capability].readiness
      return [
        capability,
        readiness === "available" && policy[index]?.outcome !== "allowed"
          ? { capability, readiness: "restricted" as const }
          : workspace.readiness.capabilities[capability],
      ]
    }),
  ) as typeof workspace.readiness.capabilities

  return serviceCommerceCustomerRequestProjectionSchema.parse({
    allowedCommands: availableActions(loaded.state, {
      ...workspace.readiness,
      capabilities: sourceReadiness,
    }),
    capabilities: SERVICE_COMMERCE_CAPABILITIES.map((capability) => ({
      capability,
      readiness: sourceReadiness[capability].readiness,
    })),
    source,
    state: loaded.state,
    store: { id: workspace.store.id, name: workspace.store.name },
    summary: loaded.summary,
  })
}
