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
import { loadPrescriptionServiceCommerceSourceActionFacts } from "./service-commerce-prescription-source-action-adapter"
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
  activeVerticalCommerce: boolean
  contactOptIn: boolean
  customerEmail: string | null
  customerPhone: string | null
  sharedCommerceEligible: boolean
  state: ServiceCommerceRequestState
  summary: string
  updatedAt: Date
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
      select: {
        contactOptIn: true,
        customerEmail: true,
        customerPhone: true,
        status: true,
        summary: true,
        updatedAt: true,
        vertical: true,
      },
      where: {
        id: input.id,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    return inquiry
      ? {
          activeVerticalCommerce: true,
          contactOptIn: inquiry.contactOptIn,
          customerEmail: inquiry.customerEmail,
          customerPhone: inquiry.customerPhone,
          sharedCommerceEligible: true,
          state: normalizeCommerceInquiryState(inquiry.status),
          summary: inquiry.summary,
          updatedAt: inquiry.updatedAt,
          vertical: inquiry.vertical === "PHARMACY" ? "pharmacy" : "service",
        }
      : null
  },
  prescription: async (db, input) => {
    const request = await loadPrescriptionServiceCommerceSourceActionFacts(
      db,
      input,
    )
    return request
      ? {
          activeVerticalCommerce: request.commerceActive,
          contactOptIn: request.contactOptIn,
          customerEmail: request.customerEmail,
          customerPhone: request.customerPhone,
          sharedCommerceEligible: request.releasedForSharedCommerce,
          state: prescriptionStates[request.status],
          summary: "Prescription request",
          updatedAt: request.updatedAt,
          vertical: "pharmacy",
        }
      : null
  },
  service: async (db, input) => {
    const request = await db.serviceRequest.findFirst({
      select: {
        contactOptIn: true,
        customerEmail: true,
        customerPhone: true,
        status: true,
        updatedAt: true,
      },
      where: {
        id: input.id,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    return request
      ? {
          activeVerticalCommerce: true,
          contactOptIn: request.contactOptIn,
          customerEmail: request.customerEmail,
          customerPhone: request.customerPhone,
          sharedCommerceEligible: true,
          state: serviceStates[request.status],
          summary: "Service request",
          updatedAt: request.updatedAt,
          vertical: "service",
        }
      : null
  },
} satisfies Record<ServiceCommerceSourceKind, SourceLoader>

export async function loadServiceCommerceSourceSnapshot(
  db: DbClient,
  input: {
    source: ServiceCommerceSourceRef
    storeId: string
    tenantId: string
  },
) {
  const source = serviceCommerceSourceRefSchema.parse(input.source)
  return sourceLoaders[source.kind](db, {
    id: source.id,
    storeId: input.storeId,
    tenantId: input.tenantId,
  })
}

function availableActions(
  state: ServiceCommerceRequestState,
  readiness: Awaited<
    ReturnType<typeof getServiceCommerceWorkspaceAccess>
  >["readiness"],
  sharedCommerceEligible: boolean,
) {
  if (!sharedCommerceEligible) return []
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
  const context = await resolveServiceCommerceSourceContext(db, input)
  return serviceCommerceCustomerRequestProjectionSchema.parse({
    allowedCommands: availableActions(
      context.loaded.state,
      {
        ...context.workspace.readiness,
        capabilities: context.sourceReadiness,
      },
      context.loaded.sharedCommerceEligible,
    ),
    capabilities: SERVICE_COMMERCE_CAPABILITIES.map((capability) => ({
      capability,
      readiness: context.sourceReadiness[capability].readiness,
    })),
    source: context.source,
    state: context.loaded.state,
    store: {
      id: context.workspace.store.id,
      name: context.workspace.store.name,
    },
    summary: context.loaded.summary,
  })
}

export async function resolveServiceCommerceSourceContext(
  db: DbClient,
  input: {
    actorUserId: string
    source: ServiceCommerceSourceRef
    storeId: string
    tenantId: string
  },
) {
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

  const loaded = await loadServiceCommerceSourceSnapshot(db, {
    source,
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
      const workspaceCapability = workspace.readiness.capabilities[capability]
      const verticalFulfilmentReady =
        source.kind === "prescription" &&
        loaded.activeVerticalCommerce &&
        (capability === "pickup" || capability === "delivery") &&
        workspaceCapability.readiness === "setup_required"
      const readiness = verticalFulfilmentReady
        ? "available"
        : workspaceCapability.readiness
      return [
        capability,
        readiness === "available" && policy[index]?.outcome !== "allowed"
          ? { capability, readiness: "restricted" as const }
          : verticalFulfilmentReady
            ? { blockers: [], readiness: "available" as const, recovery: null }
            : workspaceCapability,
      ]
    }),
  ) as typeof workspace.readiness.capabilities

  return {
    loaded,
    source,
    sourceReadiness,
    workspace,
  }
}
