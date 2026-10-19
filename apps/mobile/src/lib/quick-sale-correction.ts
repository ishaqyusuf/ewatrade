import {
  CATALOG_FREE_DESCRIPTION_MAX_LENGTH,
  QUICK_SALE_DESCRIPTION_REQUIRED,
} from "@ewatrade/utils/catalog-free-lines"

// Older offline Quick sales could be saved with a blank description. The fix
// adds only those missing descriptions; the server derives a fresh copy and
// retires the original, or reports that the original was already recorded.
// This module is pure: no store, transport or session access.

export type CorrectionDescription = { lineIndex: number; description: string }

/** The immutable original envelope exactly as it was queued. */
export type CorrectionEnvelope = {
  clientCommandId: string
  eventVersion: number
  payload: {
    lines: unknown[]
    initialPayment?: { clientPaymentId?: string } | null
    [key: string]: unknown
  }
  dependencyClientIds: string[]
  createdAtClient: Date
}

export type CorrectionState =
  /** Saved on this phone, not sent yet. */
  | "ready"
  /** Handed to transport; after a restart this reads as unknown. */
  | "sent"
  /** No reply or an uncertain failure: only the same fix may be re-sent. */
  | "unknown"
  /** A definitive refusal of this fix; never proof the original is absent. */
  | "refused"
  | "replaced"
  | "already_applied"
  /**
   * A saved attempt that couldn't be trusted on restore: it can't be sent
   * and blocks any new proposal for the original. The owner checks it.
   */
  | "invalid"

export type QuickSaleCorrectionAttempt = {
  key: string
  actorUserId: string
  businessId: string
  storeId: string
  deviceId: string
  original: CorrectionEnvelope
  replacementClientCommandId: string
  replacementClientPaymentId?: string
  descriptions: CorrectionDescription[]
  state: CorrectionState
}

export function correctionKey(input: {
  actorUserId: string
  businessId: string
  storeId: string
  deviceId: string
  clientCommandId: string
}) {
  return JSON.stringify([
    input.actorUserId,
    input.businessId,
    input.storeId,
    input.deviceId,
    input.clientCommandId,
  ])
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** Indexes of Quick sale lines whose description is missing or blank. */
export function blankQuickSaleLines(payload: unknown): number[] {
  const lines = record(payload)?.lines
  if (!Array.isArray(lines)) return []
  return lines.flatMap((line, index) => {
    const entry = record(line)
    if (!entry || entry.custom !== "quick_sale") return []
    const description = entry.description
    if (description !== undefined && typeof description !== "string") return []
    return typeof description === "string" && description.trim() ? [] : [index]
  })
}

export function correctionDescriptionError(value: string) {
  const description = value.trim()
  if (!description) return QUICK_SALE_DESCRIPTION_REQUIRED
  if (description.length > CATALOG_FREE_DESCRIPTION_MAX_LENGTH)
    return `Keep each description to ${CATALOG_FREE_DESCRIPTION_MAX_LENGTH} characters.`
  return null
}

/**
 * Exactly one trimmed description per blank line, or null. Extra, missing,
 * duplicate or invalid entries never produce a proposal.
 */
export function correctionDescriptions(
  blank: readonly number[],
  values: Readonly<Record<number, string>>,
): CorrectionDescription[] | null {
  if (!blank.length) return null
  const entries: CorrectionDescription[] = []
  for (const lineIndex of blank) {
    const value = values[lineIndex]
    if (typeof value !== "string" || correctionDescriptionError(value))
      return null
    entries.push({ lineIndex, description: value.trim() })
  }
  if (
    Object.keys(values).some((key) => !blank.includes(Number(key))) ||
    entries.length !== blank.length
  )
    return null
  return entries
}

/**
 * The envelope the server must return: the original with the fresh command
 * identity, the fresh payment identity (only when a payment exists) and the
 * blank descriptions filled. Everything else is unchanged.
 */
export function expectedCorrectionEnvelope(
  attempt: Pick<
    QuickSaleCorrectionAttempt,
    | "original"
    | "replacementClientCommandId"
    | "replacementClientPaymentId"
    | "descriptions"
  >,
): CorrectionEnvelope {
  const original = attempt.original
  const payload = JSON.parse(
    JSON.stringify(original.payload),
  ) as CorrectionEnvelope["payload"]
  const descriptions = new Map(
    attempt.descriptions.map((entry) => [entry.lineIndex, entry.description]),
  )
  payload.lines = payload.lines.map((line, index) => {
    const description = descriptions.get(index)
    return description === undefined
      ? line
      : { ...(line as object), description }
  })
  if (payload.initialPayment && attempt.replacementClientPaymentId)
    payload.initialPayment = {
      ...payload.initialPayment,
      clientPaymentId: attempt.replacementClientPaymentId,
    }
  return {
    clientCommandId: attempt.replacementClientCommandId,
    eventVersion: original.eventVersion,
    payload,
    dependencyClientIds: [...original.dependencyClientIds],
    createdAtClient: new Date(original.createdAtClient),
  }
}

export type ServerCommandStatus =
  | "PENDING"
  | "APPLIED"
  | "REVIEW_REQUIRED"
  | "BLOCKED"
  | "DISCARDED"

/** Local queue status for the server's replacement row. */
export function localStatusForCorrection(
  status: ServerCommandStatus,
  recoveryHeld: boolean,
) {
  if (status === "APPLIED") return "applied" as const
  if (status === "DISCARDED") return "discarded" as const
  if (status === "BLOCKED") return "blocked" as const
  if (status === "REVIEW_REQUIRED" || recoveryHeld) return "approval" as const
  return "pending" as const
}

export type CorrectionAvailability =
  | "eligible"
  /** Held for management recovery, or other saved sales depend on it. */
  | "needs_owner"
  | "unavailable"

type QueuedCommand = {
  clientCommandId: string
  payload: unknown
  dependencyClientIds: string[]
  localStatus: string
  recoveryHeld?: boolean
  correctedBy?: string
}

/**
 * Whether this already-owned queued command can be fixed here. Ownership,
 * device and session checks belong to the store; this reads the record only.
 */
export function correctionAvailability(
  command: QueuedCommand,
  partition: readonly QueuedCommand[],
): CorrectionAvailability {
  if (
    command.correctedBy ||
    command.localStatus === "applied" ||
    command.localStatus === "discarded" ||
    !blankQuickSaleLines(command.payload).length
  )
    return "unavailable"
  if (
    command.recoveryHeld ||
    partition.some(
      (other) =>
        other.clientCommandId !== command.clientCommandId &&
        other.localStatus !== "discarded" &&
        other.dependencyClientIds.includes(command.clientCommandId),
    )
  )
    return "needs_owner"
  return "eligible"
}

const STATES: readonly CorrectionState[] = [
  "ready",
  "sent",
  "unknown",
  "refused",
  "replaced",
  "already_applied",
  "invalid",
]

function identity(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 8 &&
    value.length <= 160 &&
    value.trim() === value
  )
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value
}

/**
 * Restore one saved attempt conservatively. A well-formed attempt keeps its
 * exact identities ("sent" becomes "unknown": the app may have stopped before
 * a reply). Anything malformed becomes an unsendable "invalid" marker that
 * still blocks a fresh proposal. An unparseable key is dropped.
 */
export function restoreCorrectionAttempt(
  key: string,
  saved: unknown,
): QuickSaleCorrectionAttempt | null {
  let parts: unknown
  try {
    parts = JSON.parse(key)
  } catch {
    return null
  }
  if (
    !Array.isArray(parts) ||
    parts.length !== 5 ||
    !parts.every((part) => text(part))
  )
    return null
  // Checked above: exactly five non-empty, trimmed strings.
  const [actorUserId, businessId, storeId, deviceId, clientCommandId] =
    parts as [string, string, string, string, string]
  const owner = { actorUserId, businessId, storeId, deviceId }
  const invalid: QuickSaleCorrectionAttempt = {
    key,
    ...owner,
    original: {
      clientCommandId,
      eventVersion: 0,
      payload: { lines: [] },
      dependencyClientIds: [],
      createdAtClient: new Date(0),
    },
    replacementClientCommandId: "",
    descriptions: [],
    state: "invalid",
  }
  const value = record(saved)
  const original = record(value?.original)
  const payload = record(original?.payload)
  const createdAt = new Date(
    original?.createdAtClient as unknown as string | number | Date,
  )
  const descriptions = value?.descriptions
  const blank = blankQuickSaleLines(payload)
  if (
    !value ||
    value.key !== key ||
    value.actorUserId !== actorUserId ||
    value.businessId !== businessId ||
    value.storeId !== storeId ||
    value.deviceId !== deviceId ||
    !original ||
    original.clientCommandId !== clientCommandId ||
    typeof original.eventVersion !== "number" ||
    !payload ||
    !Array.isArray(payload.lines) ||
    !Array.isArray(original.dependencyClientIds) ||
    !original.dependencyClientIds.every((id) => typeof id === "string") ||
    Number.isNaN(createdAt.getTime()) ||
    !identity(value.replacementClientCommandId) ||
    value.replacementClientCommandId === clientCommandId ||
    (value.replacementClientPaymentId !== undefined &&
      !identity(value.replacementClientPaymentId)) ||
    Boolean(payload.initialPayment) !==
      (value.replacementClientPaymentId !== undefined) ||
    !STATES.includes(value.state as CorrectionState) ||
    !Array.isArray(descriptions) ||
    descriptions.length !== blank.length ||
    !descriptions.every((entry, index) => {
      const item = record(entry)
      return (
        item &&
        item.lineIndex === blank[index] &&
        typeof item.description === "string" &&
        item.description === item.description.trim() &&
        !correctionDescriptionError(item.description)
      )
    })
  )
    return invalid
  return {
    key,
    ...owner,
    original: {
      clientCommandId,
      eventVersion: original.eventVersion as number,
      payload: JSON.parse(JSON.stringify(payload)),
      dependencyClientIds: [...(original.dependencyClientIds as string[])],
      createdAtClient: createdAt,
    },
    replacementClientCommandId: value.replacementClientCommandId as string,
    ...(value.replacementClientPaymentId !== undefined
      ? {
          replacementClientPaymentId:
            value.replacementClientPaymentId as string,
        }
      : {}),
    descriptions: (descriptions as CorrectionDescription[]).map((entry) => ({
      lineIndex: entry.lineIndex,
      description: entry.description,
    })),
    state:
      value.state === "sent" ? "unknown" : (value.state as CorrectionState),
  }
}

/** The server's answer, validated field by field; never trusted by cast. */
export type ValidatedCorrectionReceipt =
  | { outcome: "already_applied"; result: unknown }
  | {
      outcome: "replaced"
      envelope: CorrectionEnvelope
      status: ServerCommandStatus
      recoveryHeld: boolean
      result: unknown
    }

const SERVER_STATUSES: readonly ServerCommandStatus[] = [
  "PENDING",
  "APPLIED",
  "REVIEW_REQUIRED",
  "BLOCKED",
  "DISCARDED",
]

export function validateCorrectionReceipt(
  attempt: QuickSaleCorrectionAttempt,
  receipt: unknown,
): ValidatedCorrectionReceipt | null {
  const value = record(receipt)
  if (
    !value ||
    value.originalClientCommandId !== attempt.original.clientCommandId
  )
    return null
  if (value.outcome === "already_applied") {
    // A reconciliation needs the original's actual canonical result.
    if (value.result === null || value.result === undefined) return null
    return { outcome: "already_applied", result: value.result }
  }
  if (value.outcome !== "replaced") return null
  const replacement = record(value.replacement)
  const envelope = record(replacement?.envelope)
  const payload = record(envelope?.payload)
  const createdAt = new Date(
    envelope?.createdAtClient as unknown as string | number | Date,
  )
  if (
    !replacement ||
    !envelope ||
    !payload ||
    typeof value.originalPayloadHash !== "string" ||
    typeof replacement.payloadHash !== "string" ||
    !SERVER_STATUSES.includes(replacement.status as ServerCommandStatus) ||
    typeof replacement.recoveryHeld !== "boolean" ||
    envelope.clientCommandId !== attempt.replacementClientCommandId ||
    typeof envelope.eventVersion !== "number" ||
    !Array.isArray(envelope.dependencyClientIds) ||
    Number.isNaN(createdAt.getTime())
  )
    return null
  const actual: CorrectionEnvelope = {
    clientCommandId: envelope.clientCommandId as string,
    eventVersion: envelope.eventVersion as number,
    payload: payload as CorrectionEnvelope["payload"],
    dependencyClientIds: envelope.dependencyClientIds as string[],
    createdAtClient: createdAt,
  }
  // The returned envelope must be exactly the agreed derivation.
  const expected = expectedCorrectionEnvelope(attempt)
  const ordered = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(ordered)
    if (input && typeof input === "object" && !(input instanceof Date))
      return Object.fromEntries(
        Object.entries(input)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, entry]) => [key, ordered(entry)]),
      )
    return input instanceof Date ? input.toISOString() : input
  }
  if (JSON.stringify(ordered(actual)) !== JSON.stringify(ordered(expected)))
    return null
  const status = replacement.status as ServerCommandStatus
  return {
    outcome: "replaced",
    envelope: actual,
    status,
    recoveryHeld: replacement.recoveryHeld as boolean,
    result: replacement.recoveryHeld ? null : (replacement.result ?? null),
  }
}

export type CorrectionViewKind =
  | "needs"
  | "saved"
  | "sending"
  | "unknown"
  | "review"
  | "pending"
  | "applied"
  | "already"
  | "refused"
  | "owner"

export type CorrectionView = {
  kind: CorrectionViewKind
  /** Only blank descriptions are ever editable, and only before a proposal. */
  editable: boolean
  rowLabel: string
  original: string
  fix: string
  /** Only explicit server results say recorded; nothing else asserts absence. */
  business: string
  banner?: {
    title: string
    message: string
    tone: "warning" | "success" | "destructive"
  }
  primary?: "send" | "check" | "done"
}

/**
 * What the merchant sees for one blank original. A waiting or refused local
 * row is never proof that the original didn't reach the business: the old
 * pipeline could record an Order before marking it applied.
 */
export function correctionView(input: {
  availability: CorrectionAvailability
  attempt: QuickSaleCorrectionAttempt | null
  /** The installed replacement's local status, after a replaced receipt. */
  replacementStatus?: string | null
  sending: boolean
  canSend: boolean
}): CorrectionView {
  const { attempt } = input
  const kept = "Kept unchanged on this phone"
  if (!attempt) {
    if (input.availability === "needs_owner")
      return {
        kind: "owner",
        editable: false,
        rowLabel: "Waiting for your owner",
        original: kept,
        fix: "Not available",
        business: "Check with your owner",
        banner: {
          title: "Waiting for your owner",
          message:
            "This sale needs your owner (it's held, or other saved sales depend on it), so it can't be fixed here. Whether it already reached the business isn't confirmed.",
          tone: "warning",
        },
        primary: "done",
      }
    return {
      kind: "needs",
      editable: true,
      rowLabel: "Needs a description",
      original: kept,
      fix: "On this phone, not sent",
      business: "Not confirmed yet",
      ...(input.canSend
        ? {}
        : {
            banner: {
              title: "Reconnect to send",
              message:
                "You can add the description now; it's sent once you're online and signed in.",
              tone: "warning" as const,
            },
          }),
      primary: "send",
    }
  }
  if (input.sending)
    return {
      kind: "sending",
      editable: false,
      rowLabel: "Sending fix…",
      original: kept,
      fix: "Sending…",
      business: "Not confirmed yet",
      banner: {
        title: "Sending your fix…",
        message:
          "The original stays on this phone until the business confirms.",
        tone: "warning",
      },
    }
  switch (attempt.state) {
    case "ready":
      return {
        kind: "saved",
        editable: false,
        rowLabel: "Fix saved · not sent",
        original: kept,
        fix: "Saved on this phone, not sent",
        business: "Not confirmed yet",
        banner: {
          title: "Saved, not sent yet",
          message: input.canSend
            ? "Send the saved fix. It's the same fix every time, so it can't create a second sale."
            : "Reconnect to send the saved fix.",
          tone: "warning",
        },
        primary: "check",
      }
    case "sent":
    case "unknown":
      return {
        kind: "unknown",
        editable: false,
        rowLabel: "Fix sent · checking",
        original: kept,
        fix: "Sent · checking",
        business: "Not confirmed yet",
        banner: {
          title: "Didn't get a reply",
          message:
            "We can't tell yet whether your fix arrived. Check again sends the same fix, so it can't create a second sale. If it keeps failing, reconnect or ask your owner to check it.",
          tone: "warning",
        },
        primary: "check",
      }
    case "refused":
      return {
        kind: "refused",
        editable: false,
        rowLabel: "Fix not accepted · ask your owner",
        original: kept,
        fix: "Not accepted",
        business: "Not confirmed · check with your owner",
        banner: {
          title: "Couldn't send this fix",
          message:
            "The business didn't accept this fix. The original sale is kept unchanged on this phone, and whether it already reached the business isn't confirmed. Ask your owner to check it.",
          tone: "destructive",
        },
        primary: "done",
      }
    case "invalid":
      return {
        kind: "refused",
        editable: false,
        rowLabel: "Needs your owner",
        original: kept,
        fix: "Can't be sent from here",
        business: "Not confirmed · check with your owner",
        banner: {
          title: "Check this sale with your owner",
          message:
            "The saved fix on this phone couldn't be read back safely, so it won't be sent. Ask your owner to check this sale.",
          tone: "destructive",
        },
        primary: "done",
      }
    case "already_applied":
      return {
        kind: "already",
        editable: false,
        rowLabel: "Already recorded",
        original: "Already recorded",
        fix: "Not needed",
        business: "Already recorded",
        banner: {
          title: "Already recorded",
          message:
            "This sale had already reached the business, so nothing new was created and no description was needed.",
          tone: "success",
        },
        primary: "done",
      }
    case "replaced": {
      const status = input.replacementStatus
      const base = {
        editable: false,
        original: "Kept as history",
        fix: "Sent",
        primary: "done" as const,
      }
      if (status === "applied")
        return {
          ...base,
          kind: "applied",
          rowLabel: "Recorded",
          business: "Recorded",
          banner: {
            title: "Recorded",
            message: "The fixed sale is now a business record.",
            tone: "success",
          },
        }
      if (status === "approval")
        return {
          ...base,
          kind: "review",
          rowLabel: "Waiting for owner review",
          business: "Waiting for owner review",
          banner: {
            title: "Sent · waiting for owner review",
            message:
              "Your owner reviews staff sales before they're recorded. The original is kept as history.",
            tone: "warning",
          },
        }
      if (status === "pending")
        return {
          ...base,
          kind: "pending",
          rowLabel: "Recording on next sync",
          business: "Recording on next sync",
          banner: {
            title: "Sent · recording",
            message:
              "The business accepted the fix. The sale is recorded on the next sync; no receipt until then.",
            tone: "warning",
          },
        }
      return {
        ...base,
        kind: "owner",
        rowLabel: "Check with your owner",
        business: "Check with your owner",
        banner: {
          title: "Check this sale with your owner",
          message:
            "The fix was accepted, but the fixed sale needs your owner's attention before it's recorded.",
          tone: "warning",
        },
      }
    }
  }
}
