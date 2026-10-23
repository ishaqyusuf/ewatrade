import { DEFAULT_STORE_CONVERSATION_RESPONSE_SLA_MINUTES } from "@ewatrade/service-commerce"
import { z } from "zod"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import { ServiceCommerceIntakeContextError } from "./service-commerce-intake-context"
import { submitPublicServiceRequest } from "./service-public"
import { assertAccountStoreConversationTermsAccepted } from "./store-conversation-account-terms"
import { loadStoreConversationForAccount } from "./store-conversation-accounts"
import {
  assertCustomerAccountAgeAuthority,
  assertGuestAgeAuthority,
} from "./store-conversation-age-authority"
import { assertGuestStoreConversationTermsAccepted } from "./store-conversation-guest-terms"
import { getStoreEntryServiceRequestForm } from "./store-conversation-service-intake"
import { assertStoreConversationTextScreened } from "./store-conversation-text-safety"
import {
  StoreConversationError,
  assertStoreConversationAvailable,
  assertStoreConversationComposerEnabled,
  assertStoreConversationCustomerNotBlocked,
  loadStoreConversationForGuest,
  lockStoreConversation,
  resolveStoreConversationEntry,
  resolveStoreConversationGuestCredential,
} from "./store-conversations-core"

const schema = z
  .object({
    clientOperationId: z.string().trim().min(8).max(191),
    conversationId: z.string().trim().min(1).max(191),
    credentialToken: z.string().min(1).optional(),
    accountUserId: z.string().min(1).optional(),
    publicToken: z.string().min(32).max(191),
    customerName: z.string().trim().min(1).max(240),
    customerEmail: z.string().email().optional(),
    customerPhone: z.string().trim().max(80).optional(),
    details: z.string().trim().max(4000).optional(),
    lines: z
      .array(
        z.object({
          offeringId: z.string().min(1),
          quantity: z.string().min(1),
        }),
      )
      .min(1)
      .max(96),
  })
  .refine(
    (input) => Boolean(input.credentialToken) !== Boolean(input.accountUserId),
    "Exactly one customer authority required",
  )
  .refine(
    (input) => input.customerEmail || input.customerPhone,
    "Contact details required",
  )

type Input = z.infer<typeof schema>
type FormSnapshot = Awaited<ReturnType<typeof getStoreEntryServiceRequestForm>>

async function authorize(
  tx: Prisma.TransactionClient,
  input: Input,
  form?: FormSnapshot,
) {
  if (form)
    await lockStoreConversation(tx, {
      conversationId: input.conversationId,
      storeId: form.storeId,
      tenantId: form.tenantId,
    })
  if (input.accountUserId) {
    await assertAccountStoreConversationTermsAccepted(tx, input.accountUserId)
    await assertCustomerAccountAgeAuthority(tx, input.accountUserId)
  } else {
    if (!input.credentialToken)
      throw new StoreConversationError(
        "FORBIDDEN",
        "Customer authority required.",
      )
    const credential = await resolveStoreConversationGuestCredential(tx, {
      credentialToken: input.credentialToken,
      now: new Date(),
      purpose: "WEB_DEVICE",
    })
    await assertGuestStoreConversationTermsAccepted(
      tx,
      credential.guestIdentityId,
    )
    await assertGuestAgeAuthority(tx, credential.guestIdentityId)
  }
  const entry = await resolveStoreConversationEntry(tx, {
    publicToken: input.publicToken,
  })
  if (
    form &&
    (entry.storeId !== form.storeId ||
      entry.tenantId !== form.tenantId ||
      entry.entryPointId !== form.entryPointId ||
      entry.entryPointRevision !== form.entryPointRevision)
  )
    throw new StoreConversationError(
      "CONFLICT",
      "This Store entry changed. Refresh and try again.",
    )
  if (form) {
    const now = new Date()
    const currentForm = await tx.serviceRequestForm.findFirst({
      where: {
        id: form.formId,
        storeId: form.storeId,
        tenantId: form.tenantId,
        status: "ACTIVE",
        AND: [
          { OR: [{ activeFrom: null }, { activeFrom: { lte: now } }] },
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        ],
      },
      select: {
        offerings: {
          where: {
            offeringId: { in: input.lines.map((line) => line.offeringId) },
            offering: {
              tenantId: form.tenantId,
              status: "ACTIVE",
              serviceOffering: { isNot: null },
              storeAvailability: {
                some: { storeId: form.storeId, isAvailable: true },
              },
            },
          },
          select: { offeringId: true },
        },
      },
    })
    if (
      !currentForm ||
      currentForm.offerings.length !==
        new Set(input.lines.map((line) => line.offeringId)).size
    )
      throw new StoreConversationError(
        "NOT_READY",
        "This Service form changed. Refresh and try again.",
      )
  }
  const { conversation } = input.accountUserId
    ? await loadStoreConversationForAccount(tx, {
        accountUserId: input.accountUserId,
        conversationId: input.conversationId,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
        now: new Date(),
        touchAccess: false,
      })
    : await loadStoreConversationForGuest(tx, {
        conversationId: input.conversationId,
        credentialToken: input.credentialToken ?? "",
        now: new Date(),
        storeId: entry.storeId,
        tenantId: entry.tenantId,
        touchCredential: false,
      })
  assertStoreConversationAvailable(entry.availability)
  assertStoreConversationComposerEnabled(entry.channelMode)
  if (!entry.requestKinds.includes("service"))
    throw new StoreConversationError(
      "NOT_READY",
      "Service requests are unavailable for this Store.",
    )
  if (conversation.moderationState === "RESTRICTED")
    throw new StoreConversationError(
      "FORBIDDEN",
      "This conversation cannot accept requests.",
    )
  await assertStoreConversationCustomerNotBlocked(tx, {
    conversationId: conversation.id,
    storeId: entry.storeId,
    tenantId: entry.tenantId,
  })
  return { conversation, entry }
}

/** Structured intake is independent of free-form chat. No customer-authored chat text is created. */
export async function startStoreConversationServiceRequest(
  db: PrismaClient,
  raw: Input,
) {
  const input = schema.parse(raw)
  await assertStoreConversationTextScreened(input.customerName)
  if (input.details) await assertStoreConversationTextScreened(input.details)
  await db.$transaction((tx) => authorize(tx, input))
  const form = await getStoreEntryServiceRequestForm(db, {
    publicToken: input.publicToken,
  })
  return submitPublicServiceRequest(
    db,
    {
      clientRequestId: `store-service-start:${input.conversationId}:${input.clientOperationId}`,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
      details: input.details,
      lines: input.lines,
      expectedScope: { storeId: form.storeId, tenantId: form.tenantId },
      formId: form.formId,
      intakeContext: {
        kind: "entry_point",
        entryPointId: form.entryPointId,
        entryPointRevision: form.entryPointRevision,
      },
    },
    {
      onRequest: async (tx, request) => {
        const { entry, conversation } = await authorize(tx, input, form)
        const scope = {
          conversationId: conversation.id,
          storeId: entry.storeId,
          tenantId: entry.tenantId,
        }
        const existing = await tx.storeConversationRequestLink.findFirst({
          where: { ...scope, kind: "SERVICE_REQUEST", sourceId: request.id },
        })
        if (existing) return
        const current = await tx.storeConversation.findUniqueOrThrow({
          where: { id: conversation.id },
        })
        const sequence = current.lastMessageSequence + 1
        const now = new Date()
        const message = await tx.storeConversationMessage.create({
          data: {
            ...scope,
            authorKind: "SYSTEM",
            kind: "SYSTEM_EVENT",
            channel: "WEB",
            body: "Service request submitted",
            occurredAt: now,
            sequence,
          },
        })
        await tx.storeConversationRequestLink.create({
          data: {
            ...scope,
            messageId: message.id,
            sourceId: request.id,
            sourceRevision: request.revision,
            kind: "SERVICE_REQUEST",
          },
        })
        await tx.storeConversation.update({
          where: { id: conversation.id },
          data: {
            archivedAt: null,
            lifecycle: "ACTIVE",
            lastActivityAt: now,
            lastCustomerMessageAt: now,
            lastCustomerMessageSequence: sequence,
            lastMessageSequence: sequence,
            responseDueAt: new Date(
              now.getTime() +
                DEFAULT_STORE_CONVERSATION_RESPONSE_SLA_MINUTES * 60_000,
            ),
          },
        })
        await tx.storeConversationAuditEvent.create({
          data: {
            ...scope,
            actorKind: "CUSTOMER",
            type: "REQUEST_LINKED",
            conversationSequence: sequence,
            reasonCode: "structured_service_request_submitted",
          },
        })
      },
    },
  ).catch((error: unknown) => {
    if (error instanceof ServiceCommerceIntakeContextError)
      throw new StoreConversationError(
        "CONFLICT",
        "This Store entry changed. Refresh and try again.",
      )
    throw error
  })
}
