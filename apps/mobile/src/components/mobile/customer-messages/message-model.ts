import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import {
  CUSTOMER_MESSAGE_TEMPLATE_MAX_CHARACTERS,
  type CustomerMessageEventKey,
  customerMessageVariableLabels,
  renderCustomerMessageTemplate,
} from "@ewatrade/customer-messages/client"

export type OrderMessagePreview = RouterOutputs["customerMessages"]["preview"]
export type TemplateList =
  RouterOutputs["customerMessages"]["templates"]["list"]
export type SavedTemplate = TemplateList["templates"][number]
export type TemplateScope = "business" | "store"

/** Readiness only. Green never means a message was sent. */
export type WhatsAppActionState =
  | { kind: "hidden" }
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready" }
  | { kind: "compose" }
  | { kind: "invalid_phone" }
  | { kind: "disabled" }
  | { kind: "blocked"; reason: string }

export const MESSAGE_MAX_CHARACTERS = CUSTOMER_MESSAGE_TEMPLATE_MAX_CHARACTERS
export const OPEN_MAX_CHARACTERS = 1_500
export const PREVIEW_STALE_MS = 60_000

export function messageActionState(
  preview: OrderMessagePreview,
): WhatsAppActionState {
  switch (preview.state) {
    case "ready":
      return { kind: "ready" }
    case "not_composed":
      return { kind: "compose" }
    case "disabled":
      return { kind: "disabled" }
    case "no_phone":
      return { kind: "hidden" }
    case "invalid_phone":
      return { kind: "invalid_phone" }
    case "source_required":
      return {
        kind: "blocked",
        reason: preview.sourceChoices.length
          ? "Choose which record"
          : "Nothing recorded to describe",
      }
    default:
      return {
        kind: "blocked",
        reason: preview.reason ?? "Not available for this order",
      }
  }
}

export function whatsAppActionHint(state: WhatsAppActionState) {
  switch (state.kind) {
    case "ready":
      return "Message ready"
    case "compose":
      return "Compose message"
    case "invalid_phone":
      return "Check phone number"
    case "disabled":
      return "Message disabled"
    case "blocked":
      return state.reason
    case "error":
      return "Couldn’t check. Tap to try again."
    default:
      return "Checking…"
  }
}

/**
 * A failed background read keeps what's on screen (and typed text); lost
 * access or a vanished record hides it.
 */
export function hidesCachedData(failure: unknown) {
  const code =
    failure && typeof failure === "object" && "data" in failure
      ? (failure as { data?: { code?: string } }).data?.code
      : undefined
  return code === "FORBIDDEN" || code === "UNAUTHORIZED" || code === "NOT_FOUND"
}

/** Current facts from the server's formatted values, never recomputed. */
export function orderFacts(preview: OrderMessagePreview) {
  const v = preview.variables
  const facts: Array<{ label: string; value: string }> = []
  if (preview.eventKey === "payment.recorded" && v.amount_paid)
    facts.push({ label: "This payment", value: v.amount_paid })
  if (preview.eventKey === "payment.refund_recorded" && v.refund_amount)
    facts.push({ label: "This refund", value: v.refund_amount })
  if (v.order_total) facts.push({ label: "Total", value: v.order_total })
  if (v.balance_due) facts.push({ label: "Balance due", value: v.balance_due })
  return facts
}

/** Freeze each event's guard when an AI batch starts. */
export function captureBaselines(
  list: Pick<TemplateList, "templates" | "storeId">,
  eventKeys: readonly CustomerMessageEventKey[],
  scope: TemplateScope,
) {
  return new Map(
    eventKeys.map((key) => [key, expectedFor(scopeTemplate(list, key, scope))]),
  )
}

/** Grey states explain; they never offer Open or Copy. */
export function blockedMessageCopy(preview: OrderMessagePreview) {
  switch (preview.state) {
    case "no_phone":
      return "This order has no customer phone number. Add one under Change → Customer."
    case "invalid_phone":
      return `Check the phone number${preview.recipient?.phoneDisplay ? ` (${preview.recipient.phoneDisplay})` : ""}. ${preview.reason ?? "Add the country code if the customer is abroad."}`
    case "source_required":
      return preview.sourceChoices.length
        ? "Choose which record this message is about."
        : preview.eventKey === "payment.refund_recorded"
          ? "This order has no recorded refund to describe."
          : "This order has no recorded payment to describe."
    case "disabled":
      return "This message is turned off for this Store."
    case "ineligible":
      return preview.reason ?? "This message doesn’t apply to this order now."
    case "invalid_message":
      return (
        preview.reason ??
        "The saved message needs details this order doesn’t have."
      )
    default:
      return null
  }
}

export function savedMessageLabel(
  state: "composed" | "missing" | "disabled",
  scope: "business" | "store" | null,
) {
  if (state === "missing") return "Not written yet"
  if (state === "disabled")
    return scope === "store" ? "Off for this Store" : "Turned off"
  return scope === "store" ? "Ready · this Store’s wording" : "Ready"
}

export function messageVariableLabel(name: string) {
  return customerMessageVariableLabels[name] ?? name.replaceAll("_", " ")
}

export function messageLength(body: string) {
  return Array.from(body).length
}

export function tryRenderMessage(
  eventKey: CustomerMessageEventKey,
  body: string,
  variables: Record<string, string | undefined>,
): { text: string; problem: null } | { text: null; problem: string } {
  try {
    return {
      text: renderCustomerMessageTemplate(eventKey, body, variables),
      problem: null,
    }
  } catch (failure) {
    return {
      text: null,
      problem:
        failure instanceof Error ? failure.message : "Check this message.",
    }
  }
}

/** Insert `{name}` at the selection and return the next value and caret. */
export function insertVariable(
  value: string,
  name: string,
  selection: { start: number; end: number } | null,
) {
  const token = `{${name}}`
  const start = selection?.start ?? value.length
  const end = selection?.end ?? value.length
  const before = value.slice(0, start)
  const spaced = before && !/\s$/.test(before) ? `${before} ` : before
  return {
    value: `${spaced}${token}${value.slice(end)}`,
    caret: spaced.length + token.length,
  }
}

export function scopeTemplate(
  list: Pick<TemplateList, "templates" | "storeId">,
  eventKey: CustomerMessageEventKey,
  scope: TemplateScope,
): SavedTemplate | null {
  const scopeKey = scope === "business" ? "business" : `store:${list.storeId}`
  return (
    list.templates.find(
      (row) => row.eventKey === eventKey && row.scopeKey === scopeKey,
    ) ?? null
  )
}

export type TemplateWrite = {
  eventKey: CustomerMessageEventKey
  scope: TemplateScope
}
export type TemplateWriteResult =
  | { removed: true }
  | { removed: false; template: SavedTemplate }

/** Put a confirmed write into the cached list at once (statuses follow). */
export function applyTemplateWrite(
  list: TemplateList,
  write: TemplateWrite,
  result: TemplateWriteResult,
): TemplateList {
  const scopeKey =
    write.scope === "business" ? "business" : `store:${list.storeId}`
  const others = list.templates.filter(
    (row) => !(row.eventKey === write.eventKey && row.scopeKey === scopeKey),
  )
  return {
    ...list,
    templates: result.removed ? others : [...others, result.template],
  }
}

export function expectedFor(row: SavedTemplate | null) {
  return row
    ? { expectedRevision: row.revision, expectedTemplateId: row.id }
    : { expectedRevision: 0 }
}

export function saveFailureText(failure: unknown) {
  const code =
    failure && typeof failure === "object" && "data" in failure
      ? (failure as { data?: { code?: string } }).data?.code
      : undefined
  if (code === "CONFLICT")
    return "Someone else changed this message. Reload to see it, then save again. Your text is kept here."
  return failure instanceof Error
    ? failure.message
    : "This message wasn’t saved. Try again."
}

/** Clearly labelled sample details for Settings previews. */
export function sampleMessageVariables(input: {
  businessName: string
  storeName: string
}): Record<string, string> {
  return {
    customer_name: "Ada Okafor",
    customer_first_name: "Ada",
    business_name: input.businessName,
    store_name: input.storeName,
    store_phone: "0803 123 4567",
    order_number: "ORD-1024",
    order_date: "14 Oct 2026",
    order_total: "₦25,000",
    items_summary: "2 × Rice 5kg, 1 × Palm oil 1L",
    order_status: "out for delivery",
    amount_paid: "₦10,000",
    payment_date: "14 Oct 2026",
    total_paid: "₦15,000",
    balance_due: "₦10,000",
    payment_method: "bank transfer",
    refund_amount: "₦5,000",
  }
}

export const TONE_OPTIONS = [
  { value: "friendly", label: "Friendly" },
  { value: "short", label: "Short" },
  { value: "professional", label: "Professional" },
] as const
export const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "pcm", label: "Pidgin" },
] as const
export type MessageTone = (typeof TONE_OPTIONS)[number]["value"]
export type MessageLanguage = (typeof LANGUAGE_OPTIONS)[number]["value"]

/** What a saved-wording editor shows and which saved row it writes against. */
export type EditorState = {
  body: string
  /** The saved body this editor last adopted. */
  baseline: string
  guard: ReturnType<typeof expectedFor>
  /** A newer saved row arrived while the person had unsaved text. */
  conflict: boolean
}

export function editorStateFor(row: SavedTemplate | null): EditorState {
  const body = row?.body ?? ""
  return { body, baseline: body, guard: expectedFor(row), conflict: false }
}

function sameGuard(
  guard: ReturnType<typeof expectedFor>,
  row: SavedTemplate | null,
) {
  const next = expectedFor(row)
  return (
    guard.expectedRevision === next.expectedRevision &&
    ("expectedTemplateId" in guard ? guard.expectedTemplateId : undefined) ===
      ("expectedTemplateId" in next ? next.expectedTemplateId : undefined)
  )
}

/**
 * A refetched row: a clean editor adopts it; an editor with typed text keeps
 * its text and its original guard and is marked in conflict, so Save can't
 * overwrite a change the person hasn't seen.
 */
export function reconcileEditor(
  state: EditorState,
  row: SavedTemplate | null,
): EditorState {
  if (sameGuard(state.guard, row)) return state
  if (state.body === state.baseline) return editorStateFor(row)
  return state.conflict ? state : { ...state, conflict: true }
}

/** This editor's own confirmed write is adopted explicitly. */
export function adoptOwnWrite(
  state: EditorState,
  result: TemplateWriteResult,
): EditorState {
  if (result.removed) return editorStateFor(null)
  return {
    body: state.body,
    baseline: result.template.body,
    guard: expectedFor(result.template),
    conflict: false,
  }
}

/** A write applies only to a cached list still belonging to its Store. */
export function applyTemplateWriteIfCurrent(
  current: TemplateList | undefined,
  startedForStoreId: string | undefined,
  write: TemplateWrite,
  result: TemplateWriteResult,
): TemplateList | undefined {
  if (!current || !startedForStoreId || current.storeId !== startedForStoreId)
    return current
  return applyTemplateWrite(current, write, result)
}

/** Where and when a template write started. */
export type WriteContext = {
  storeId: string | undefined
  /** The data-cache generation; any clear since makes the write stale. */
  generation: number
}

/**
 * A finished write may touch the cache only in the context it started in:
 * same Store list and no cache clear in between. Sign-out or an A→B→A switch
 * keeps the old write discarded even when the same Store comes back.
 */
export function writeContextIsCurrent(
  started: WriteContext | undefined,
  now: WriteContext,
) {
  return Boolean(
    started?.storeId &&
      started.storeId === now.storeId &&
      started.generation === now.generation,
  )
}
