import type { PrismaClient } from "../../generated/prisma/client"
import { ServiceRequestFormStatus } from "../../generated/prisma/enums"
import { CatalogError } from "./catalog"
import { resolveCustomerEntryPointContextInTransaction } from "./customer-channels"
import { submitPublicServiceRequest } from "./service-public"
import {
  projectPublicServiceRequestForm,
  publicServiceRequestFormInclude,
} from "./service-public-projection"
import { attachStoreConversationTypedRequest } from "./store-conversations-requests"

export async function getStoreEntryServiceRequestForm(
  db: PrismaClient,
  input: { publicToken: string },
) {
  return db.$transaction(async (tx) => {
    const entry = await resolveCustomerEntryPointContextInTransaction(tx, input)
    if (!entry.requestKinds.includes("service")) {
      throw new CatalogError(
        "PUBLIC_TOKEN_INVALID",
        "Service requests are unavailable for this Store.",
      )
    }
    const now = new Date()
    const form = await tx.serviceRequestForm.findFirst({
      include: publicServiceRequestFormInclude,
      orderBy: { createdAt: "desc" },
      where: {
        AND: [
          { OR: [{ activeFrom: null }, { activeFrom: { lte: now } }] },
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        ],
        offerings: { some: {} },
        status: ServiceRequestFormStatus.ACTIVE,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      },
    })
    if (!form) {
      throw new CatalogError(
        "PUBLIC_TOKEN_INVALID",
        "Service requests are unavailable for this Store.",
      )
    }
    return {
      ...projectPublicServiceRequestForm(form),
      entryPointId: entry.entryPointId,
      entryPointRevision: entry.entryPointRevision,
      storeId: entry.storeId,
      tenantId: entry.tenantId,
    }
  })
}

export async function submitStoreConversationServiceRequest(
  db: PrismaClient,
  input: {
    conversationId: string
    credentialToken: string
    customerEmail?: string
    customerName: string
    customerPhone?: string
    details?: string
    lines: Array<{ offeringId: string; quantity: string }>
    messageId: string
    publicToken: string
  },
) {
  const form = await getStoreEntryServiceRequestForm(db, {
    publicToken: input.publicToken,
  })
  const request = await submitPublicServiceRequest(db, {
    clientRequestId: `store-conversation:${input.conversationId}:${input.messageId}`,
    customerEmail: input.customerEmail,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    details: input.details,
    expectedScope: { storeId: form.storeId, tenantId: form.tenantId },
    formId: form.formId,
    intakeContext: {
      entryPointId: form.entryPointId,
      entryPointRevision: form.entryPointRevision,
      kind: "entry_point",
    },
    lines: input.lines,
  })
  await attachStoreConversationTypedRequest(db, {
    clientOperationId: `attach-service:${request.id}`,
    conversationId: input.conversationId,
    credentialToken: input.credentialToken,
    expectedSourceRevision: request.revision,
    messageId: input.messageId,
    publicToken: input.publicToken,
    sourceId: request.id,
    sourceKind: "SERVICE_REQUEST",
  })
  return request
}
