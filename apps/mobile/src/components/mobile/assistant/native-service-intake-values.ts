import {
  type ServiceIntakeAction,
  serviceIntakeAction,
} from "@ewatrade/assistant/general/service-intake"
import {
  minorToStatedAmount,
  statedAmountPattern,
  statedAmountToMinor,
} from "@ewatrade/assistant/general/stated-money"
import { nativeValidationMessage } from "./native-validation-copy"

export type NativeIntakeOffering = {
  offeringId: string
  itemName: string
  variantName: string
  offeringName: string
  fixedPriceMinor: number | null
  service: { workPolicy: string; [key: string]: unknown } | null
  previouslyRead?: boolean
}
export type NativeIntakeContinuation = {
  query?: string
  cursor?: string
  offeringAfter?: string
}
export const intakePaymentMethods = [
  ["cash", "Cash"],
  ["bank_transfer", "Bank transfer"],
  ["card", "Card"],
  ["pos", "POS"],
  ["other", "Other"],
] as const
export const intakeOfferingName = (offering: NativeIntakeOffering) =>
  [offering.itemName, offering.variantName, offering.offeringName]
    .filter((value, index, values) => value && values.indexOf(value) === index)
    .join(" · ")
export const initialIntakePayment = (initial: ServiceIntakeAction) =>
  initial.initialPaymentMinor === undefined
    ? ""
    : minorToStatedAmount(initial.initialPaymentMinor)

/** Retain only selected facts in this edit visit; a new page overrides old facts. */
export function intakeChoicePage(
  retained: readonly NativeIntakeOffering[],
  page: readonly NativeIntakeOffering[],
  selectedIds: readonly string[],
) {
  const selected = new Set(selectedIds)
  return [
    ...new Map<string, NativeIntakeOffering>([
      ...retained
        .filter((row) => selected.has(row.offeringId))
        .map(
          (row) => [row.offeringId, { ...row, previouslyRead: true }] as const,
        ),
      ...page.map(
        (row) => [row.offeringId, { ...row, previouslyRead: false }] as const,
      ),
    ]).values(),
  ]
}

/** Explicit UTC text; preserve original fractional precision even beyond milliseconds. */
export function intakeUtcInput(value?: string) {
  if (!value) return ""
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return value
  const fraction =
    value.match(/T\d{2}:\d{2}:\d{2}(\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/)?.[1] ?? ""
  return `${date.toISOString().slice(0, 19)}${fraction}Z`
}
function editedUtc(value: string, original?: string) {
  const text = value.trim()
  if (!text) return undefined
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(text))
    throw Error("Enter an explicit UTC time, including seconds and Z.")
  if (original && text === intakeUtcInput(original)) return original
  const date = new Date(text)
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 19) !== text.slice(0, 19)
  )
    throw Error("Enter a valid UTC date and time.")
  return text
}

/** Only values change; saved customer identity cannot be replaced or overridden. */
export function nativeServiceIntakeCandidate(
  initial: ServiceIntakeAction,
  draft: ServiceIntakeAction,
  edits: { payment: string; requested: string; due: string },
  options: {
    offerings: readonly NativeIntakeOffering[]
    assignees: readonly { id: string; name: string }[]
  },
): { ok: true; payload: ServiceIntakeAction } | { ok: false; error: string } {
  try {
    if (
      draft.action !== initial.action ||
      draft.customerId !== initial.customerId
    )
      throw Error(
        "Keep the original customer selection. Ask in chat to select another customer.",
      )
    if (
      initial.customerId &&
      (draft.customerName || draft.customerPhone || draft.customerEmail)
    )
      throw Error(
        "Saved customers use their saved contact details without overrides.",
      )
    for (const line of draft.lines) {
      const matches = options.offerings.filter(
        (offering) => offering.offeringId === line.offeringId,
      )
      if (
        matches.length !== 1 ||
        !Number.isSafeInteger(matches[0]?.fixedPriceMinor) ||
        (matches[0]?.fixedPriceMinor ?? -1) < 0 ||
        !["TRACKED", "CHARGE_ONLY"].includes(
          matches[0]?.service?.workPolicy ?? "",
        )
      )
        throw Error(
          "Resolve every selected fixed-price service from authorized choices before reviewing.",
        )
    }
    if (
      draft.requestedAssigneeId &&
      options.assignees.filter(
        (assignee) => assignee.id === draft.requestedAssigneeId,
      ).length !== 1
    )
      throw Error(
        "Choose a currently eligible assignee or explicitly leave work unassigned.",
      )
    const payment = edits.payment.trim()
    if (payment && !statedAmountPattern.test(payment))
      throw Error("Enter a payment amount with at most two decimal places.")
    const initialPaymentMinor = payment
      ? Number(statedAmountToMinor(payment))
      : undefined
    const candidate = serviceIntakeAction.parse({
      ...draft,
      requestedAt: editedUtc(edits.requested, initial.requestedAt),
      dueCommitmentAt: editedUtc(edits.due, initial.dueCommitmentAt),
      initialPaymentMinor,
      initialPaymentMethod: payment
        ? (draft.initialPaymentMethod ?? "cash")
        : undefined,
      initialPaymentReference: payment
        ? draft.initialPaymentReference
        : undefined,
    })
    const hasTracked = candidate.lines.some(
      (line) =>
        options.offerings.find(
          (offering) => offering.offeringId === line.offeringId,
        )?.service?.workPolicy === "TRACKED",
    )
    if (
      !hasTracked &&
      (candidate.requestedAssigneeId || candidate.dueCommitmentAt)
    )
      throw Error(
        "An assignee or promised work time requires a tracked service line.",
      )
    return { ok: true, payload: candidate }
  } catch (error) {
    return {
      ok: false,
      error: nativeValidationMessage(error, "Check the intake details."),
    }
  }
}
