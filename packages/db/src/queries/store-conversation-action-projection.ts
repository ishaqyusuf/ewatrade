import {
  type ServiceCommerceAction,
  type ServiceCommerceCustomerActionProjection,
  type ServiceCommerceSourceRef,
  projectStoreConversationQuoteActionMessage,
  storeConversationQuoteSnapshotSchema,
} from "@ewatrade/service-commerce"

import type { Prisma } from "../../generated/prisma/client"
import {
  CommerceQuoteVersionStatus,
  StoreConversationRequestKind,
} from "../../generated/prisma/enums"
import { ServiceCommerceAccessError } from "./service-commerce-access"
import {
  type IssueServiceCommerceCustomerActionToken,
  issueServiceCommerceCustomerActionsInTransaction,
} from "./service-commerce-actions/capabilities"
import { ServiceCommerceCustomerActionError } from "./service-commerce-actions/shared"
import { StoreConversationError } from "./store-conversations-core"

const ACTION_CAPABILITY_ROTATION_MS = 6 * 24 * 60 * 60_000
const ACTION_CAPABILITY_LIFETIME_MS = 7 * 24 * 60 * 60_000

const issuedActionsBySource = {
  [StoreConversationRequestKind.COMMERCE_INQUIRY]: [
    "view_quote",
    "choose_quote_option",
    "talk_to_staff",
  ],
  [StoreConversationRequestKind.PRESCRIPTION_REQUEST]: [
    "view_quote",
    "choose_quote_option",
    "pick_up",
    "delivery",
    "talk_to_staff",
  ],
  [StoreConversationRequestKind.SERVICE_REQUEST]: [
    "view_quote",
    "choose_quote_option",
    "talk_to_staff",
  ],
} as const satisfies Record<
  StoreConversationRequestKind,
  readonly ServiceCommerceAction[]
>

const acceptedActionsBySource = {
  [StoreConversationRequestKind.COMMERCE_INQUIRY]: [
    "view_quote",
    "talk_to_staff",
  ],
  [StoreConversationRequestKind.PRESCRIPTION_REQUEST]: [
    "view_quote",
    "pay_now",
    "talk_to_staff",
  ],
  [StoreConversationRequestKind.SERVICE_REQUEST]: [
    "view_quote",
    "book",
    "reschedule",
    "cancel",
    "talk_to_staff",
  ],
} as const satisfies Record<
  StoreConversationRequestKind,
  readonly ServiceCommerceAction[]
>

export const storeConversationActionMessageInclude = {
  quoteVersion: {
    include: {
      acceptedOrder: { select: { id: true } },
      optionSelection: { select: { optionId: true } },
      quote: { select: { currentVersionId: true } },
    },
  },
} as const

export type StoreConversationActionMessageRow =
  Prisma.StoreConversationActionMessageGetPayload<{
    include: typeof storeConversationActionMessageInclude
  }>

export const publicSourceKind = {
  [StoreConversationRequestKind.COMMERCE_INQUIRY]: "commerce_inquiry",
  [StoreConversationRequestKind.PRESCRIPTION_REQUEST]: "prescription",
  [StoreConversationRequestKind.SERVICE_REQUEST]: "service",
} satisfies Record<
  StoreConversationRequestKind,
  ServiceCommerceSourceRef["kind"]
>

export function projectStoreConversationActionMessageRow(
  row: StoreConversationActionMessageRow,
  input: {
    actions?: ServiceCommerceCustomerActionProjection[]
    now?: Date
  } = {},
) {
  const snapshot = storeConversationQuoteSnapshotSchema.parse(row.quoteSnapshot)
  if (
    snapshot.currencyCode !== row.quoteVersion.currencyCode ||
    snapshot.quoteVersion !== row.quoteVersion.version
  ) {
    throw new StoreConversationError(
      "CONFLICT",
      "This quotation presentation no longer matches its immutable version.",
    )
  }
  const status =
    row.quoteVersion.quote.currentVersionId !== row.quoteVersionId
      ? ("superseded" as const)
      : row.quoteVersion.status.toLowerCase() === "accepted"
        ? ("accepted" as const)
        : row.quoteVersion.status.toLowerCase() === "declined"
          ? ("declined" as const)
          : row.quoteVersion.status.toLowerCase() === "expired"
            ? ("expired" as const)
            : row.quoteVersion.status.toLowerCase() === "revoked"
              ? ("revoked" as const)
              : row.quoteVersion.status.toLowerCase() === "superseded"
                ? ("superseded" as const)
                : ("issued" as const)
  return projectStoreConversationQuoteActionMessage({
    actions: input.actions ?? [],
    completed:
      row.quoteVersion.status === CommerceQuoteVersionStatus.ACCEPTED ||
      Boolean(row.quoteVersion.acceptedOrder),
    currencyCode: snapshot.currencyCode,
    expiresAt: row.quoteVersion.expiresAt,
    now: input.now ?? new Date(),
    options: snapshot.options,
    quoteVersion: snapshot.quoteVersion,
    revokedAt: row.quoteVersion.revokedAt,
    selectedOptionId: row.quoteVersion.optionSelection?.optionId ?? null,
    status,
  })
}

function actionCapabilityWindow(
  row: StoreConversationActionMessageRow,
  now: Date,
) {
  const releaseAt = row.quoteVersion.issuedAt ?? row.occurredAt
  const elapsed = Math.max(0, now.getTime() - releaseAt.getTime())
  const window = Math.floor(elapsed / ACTION_CAPABILITY_ROTATION_MS)
  const rotatingExpiry = new Date(
    releaseAt.getTime() +
      window * ACTION_CAPABILITY_ROTATION_MS +
      ACTION_CAPABILITY_LIFETIME_MS,
  )
  const quoteExpiry =
    row.quoteVersion.status === CommerceQuoteVersionStatus.ISSUED
      ? row.quoteVersion.expiresAt
      : null
  const expiresAt =
    quoteExpiry && quoteExpiry < rotatingExpiry ? quoteExpiry : rotatingExpiry
  return { expiresAt, window }
}

export function allowedConversationActions(
  sourceKind: StoreConversationRequestKind,
  status: CommerceQuoteVersionStatus,
): readonly ServiceCommerceAction[] {
  return status === CommerceQuoteVersionStatus.ACCEPTED
    ? acceptedActionsBySource[sourceKind]
    : issuedActionsBySource[sourceKind]
}

export type StoreConversationActionMaterializationDependencies = {
  issueCapabilityToken: IssueServiceCommerceCustomerActionToken
  issueActionsInTransaction?: typeof issueServiceCommerceCustomerActionsInTransaction
}

export async function materializeGuestStoreConversationActionMessagesInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    available: boolean
    now: Date
    rows: StoreConversationActionMessageRow[]
  },
  dependencies?: StoreConversationActionMaterializationDependencies,
) {
  if (input.rows.length > 0 && !dependencies) {
    throw new StoreConversationError(
      "CONFLICT",
      "Customer chat actions are not configured.",
    )
  }
  const projections = new Map<
    string,
    ReturnType<typeof projectStoreConversationActionMessageRow>
  >()
  const rows = [...input.rows].sort((left, right) =>
    left.messageId.localeCompare(right.messageId),
  )
  for (const row of rows) {
    const { expiresAt, window } = actionCapabilityWindow(row, input.now)
    let actions: ServiceCommerceCustomerActionProjection[] = []
    let authorizationUnavailable = false
    if (
      input.available &&
      row.quoteVersion.quote.currentVersionId === row.quoteVersionId &&
      (row.quoteVersion.status === CommerceQuoteVersionStatus.ISSUED ||
        row.quoteVersion.status === CommerceQuoteVersionStatus.ACCEPTED) &&
      !row.quoteVersion.revokedAt &&
      expiresAt > input.now
    ) {
      const issueCapabilityToken = dependencies?.issueCapabilityToken
      if (!issueCapabilityToken) {
        throw new StoreConversationError(
          "CONFLICT",
          "Customer chat actions are not configured.",
        )
      }
      try {
        const issueActions =
          dependencies?.issueActionsInTransaction ??
          issueServiceCommerceCustomerActionsInTransaction
        const issued = await issueActions(tx, {
          actorUserId: row.createdByUserId,
          allowedActions: allowedConversationActions(
            row.sourceKind,
            row.quoteVersion.status,
          ),
          channel: "web",
          clientBatchId: `store-conversation:${row.messageId}:${row.quoteVersionId}:${window}`,
          expiresAt,
          issueCapabilityToken,
          now: input.now,
          source: {
            id: row.sourceId,
            kind: publicSourceKind[row.sourceKind],
          },
          storeId: row.storeId,
          tenantId: row.tenantId,
        })
        actions = issued.actions
      } catch (error) {
        const unavailableAction =
          (error instanceof ServiceCommerceCustomerActionError &&
            error.code === "ACTION_BLOCKED") ||
          error instanceof ServiceCommerceAccessError
        if (!unavailableAction) {
          throw error
        }
        authorizationUnavailable = true
      }
    }
    const projection = projectStoreConversationActionMessageRow(row, {
      actions,
      now: input.now,
    })
    projections.set(
      row.messageId,
      authorizationUnavailable &&
        projection.lifecycle === "current" &&
        projection.actions.length === 0
        ? { ...projection, recovery: "talk_to_store" }
        : projection,
    )
  }
  return projections
}
