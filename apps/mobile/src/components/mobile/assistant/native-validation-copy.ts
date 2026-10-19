import { ZodError, z } from "zod"

/**
 * Plain correction text for local draft validation. Only messages identical to
 * Zod's own English default for that issue ("Too small: …", raw patterns,
 * minor-unit limits) are rewritten; a message a schema or helper wrote on
 * purpose — even one starting "Invalid …" — and any server refusal pass
 * through unchanged. Nothing here turns a failure into success.
 */
type Issue = {
  code?: string
  origin?: string
  format?: string
  path?: readonly PropertyKey[]
  minimum?: number | bigint
  maximum?: number | bigint
  inclusive?: boolean
  expected?: string
  message?: string
}

const fields: Record<string, { name: string; hint?: string }> = {
  reason: { name: "a reason" },
  note: { name: "a note" },
  conditionNote: { name: "a condition note" },
  instructions: { name: "the instructions" },
  message: { name: "the message" },
  email: { name: "an email address" },
  name: { name: "a name" },
  customerName: { name: "the customer name" },
  customerPhone: {
    name: "the customer phone number",
    hint: "Use the full number, for example +2348012345678.",
  },
  customerEmail: { name: "the customer email address" },
  quantity: {
    name: "the quantity",
    hint: "Use a number above zero with up to six decimal places.",
  },
  unitPriceMinor: { name: "the unit price" },
  enteredTotalMinor: { name: "the item total" },
  // Stock assistant drafts.
  source: { name: "the source or delivery reference" },
  supplierName: { name: "the supplier name" },
  unitCostMinor: { name: "the unit cost" },
  enteredQuantity: {
    name: "the quantity",
    hint: "Use a number above zero with up to six decimal places.",
  },
  correctedEnteredQuantity: {
    name: "the replacement quantity",
    hint: "Use a number above zero with up to six decimal places.",
  },
  declaredQuantity: {
    name: "the declared quantity",
    hint: "Use zero or a number with up to six decimal places.",
  },
  sourceQuantity: {
    name: "the number of source packs",
    hint: "Use a number above zero with up to six decimal places.",
  },
  categories: { name: "a category" },
  effectiveAt: { name: "the effective time" },
  initialPaymentMinor: { name: "the payment amount" },
  initialPaymentReference: { name: "the payment reference" },
  requestedAt: { name: "the requested time" },
  dueCommitmentAt: { name: "the promised time" },
  role: { name: "a role" },
  storeId: { name: "a Store" },
  assignments: { name: "a Store role" },
  lines: { name: "a service line" },
  changes: { name: "an item change" },
  status: { name: "a status" },
  disposition: { name: "what happens to the returned item" },
}
const money = new Set([
  "unitPriceMinor",
  "enteredTotalMinor",
  "initialPaymentMinor",
  "unitCostMinor",
])
const english = z.locales.en().localeError

/** True only when the message is exactly what Zod would have written itself. */
function zodDefault(issue: Issue) {
  const message = issue.message
  if (!message) return true
  if (issue.code === "invalid_type" && typeof issue.expected === "string") {
    // Final issues drop the input, so the "received …" part cannot be rebuilt.
    const base = `Invalid input: expected ${issue.expected}`
    return (
      message === base ||
      (/^, received [a-z]+$/.test(message.slice(base.length)) &&
        message.startsWith(base))
    )
  }
  // Also covers custom refines: with no authored text Zod writes its default
  // ("Invalid input"); any other custom message was written on purpose.
  try {
    const text = english(issue as Parameters<typeof english>[0])
    return (typeof text === "string" ? text : text?.message) === message
  } catch {
    return false
  }
}

function field(path: readonly PropertyKey[] | undefined) {
  const key = [...(path ?? [])]
    .reverse()
    .find((part): part is string => typeof part === "string")
  return { key, ...(key ? fields[key] : undefined) }
}

export function nativeIssueText(issue: Issue, fallback: string) {
  const message = issue.message ?? ""
  if (!zodDefault(issue)) return message || fallback
  const { key, name = "this detail", hint } = field(issue.path)
  const what = name.replace(/^(a|an|the) /, "")
  const cap = what.charAt(0).toUpperCase() + what.slice(1)
  if (issue.code === "too_small") {
    if (issue.origin === "string") {
      const min = Number(issue.minimum ?? 1)
      return min <= 1
        ? `Enter ${name}.`
        : `${cap} needs at least ${min} characters.`
    }
    if (issue.origin === "array" || issue.origin === "set")
      return `Add ${name}.`
    const min = Number(issue.minimum)
    // Zero itself is valid when the minimum is an inclusive 0.
    if (min === 0 && issue.inclusive !== false)
      return `${cap} must be zero or more.`
    if (key && money.has(key) && (min === 0 || min === 1))
      return `${cap} must be more than zero.`
    return `${cap} is too small.`
  }
  if (issue.code === "too_big") {
    if (issue.origin === "string")
      return `Keep ${what} within ${Number(issue.maximum)} characters.`
    if (issue.origin === "array" || issue.origin === "set")
      return `Too many entries for ${what}.`
    return `${cap} is too large.`
  }
  if (issue.code === "invalid_format") {
    if (issue.format === "email") return "Enter a valid email address."
    return hint ? `Check ${what}. ${hint}` : `Check ${what}.`
  }
  if (issue.code === "unrecognized_keys") return fallback
  return hint ? `Check ${what}. ${hint}` : `Check ${what}.`
}

/** A local Zod failure, even from a second copy of the library; never a server error. */
function validationIssues(cause: unknown): Issue[] | null {
  if (cause instanceof ZodError) return cause.issues
  if (
    cause instanceof Error &&
    cause.name === "ZodError" &&
    "issues" in cause &&
    Array.isArray(cause.issues)
  )
    return cause.issues as Issue[]
  return null
}

/** First local issue in plain words; non-validation errors keep their message. */
export function nativeValidationMessage(cause: unknown, fallback: string) {
  const issues = validationIssues(cause)
  if (issues) return nativeIssueText(issues[0] ?? {}, fallback)
  if (cause instanceof Error) return cause.message || fallback
  return fallback
}
