import { z } from "zod"
import type { GeneralAction } from "./contracts"

/**
 * Money the merchant states ("they paid 3,000") reaches draftAction in major
 * units and the server converts it. Models asked for minor units copied the
 * spoken figure (12 Oct 2026: "paid 3,000 cash" became amountMinor 3000, i.e.
 * ₦30.00). Stored proposal payloads keep their `*Minor` fields; only the tool
 * input the model sees changes.
 */
type Kind = "number" | "string"
type StatedField = { kind: Kind; as?: string }
type ActionName = GeneralAction["action"]

/**
 * Every `*Minor` draft field whose value comes from the merchant's words, by
 * path (`[]` = each array item) and stored type (integer, or digit string for
 * bookkeeping amounts). The model writes it without `Minor`, or as `as`.
 */
export const statedMoneyFields = {
  order_create: {
    "initialPayment.amountMinor": { kind: "number" },
    "lines[].amountMinor": { kind: "number" },
    "lines[].enteredTotalMinor": { kind: "number" },
  },
  payment_record: { amountMinor: { kind: "number" } },
  order_replace: {
    "changes[].unitPriceMinor": { kind: "number" },
    "changes[].enteredTotalMinor": { kind: "number" },
  },
  product_create: {
    priceMinor: { kind: "number" },
    "sellingUnits[].priceMinor": { kind: "number" },
    "variants[].priceMinor": { kind: "number" },
    "variants[].sellingUnitPrices[].priceMinor": { kind: "number" },
  },
  product_price_update: { priceMinor: { kind: "number" } },
  stock_receive: { unitCostMinor: { kind: "number" } },
  service_intake: {
    initialPaymentMinor: { kind: "number", as: "initialPaymentAmount" },
  },
  cash_count_record: { observedBalanceMinor: { kind: "string" } },
  expense_record: {
    "lines[].amountMinor": { kind: "string" },
    "payment.amountMinor": { kind: "string" },
  },
  bill_payment: { amountMinor: { kind: "string" } },
  money_movement: { amountMinor: { kind: "string" } },
  customer_receipt: { amountMinor: { kind: "string" } },
  held_credit_refund: { amountMinor: { kind: "string" } },
  purchase_register: { "lines[].amountMinor": { kind: "string" } },
  purchase_record: { "lines[].amountMinor": { kind: "string" } },
  purchase_recognize: { invoiceAmountMinor: { kind: "string" } },
  purchase_payment: { amountMinor: { kind: "string" } },
  supplier_opening: { amountMinor: { kind: "string" } },
  supplier_advance: { amountMinor: { kind: "string" } },
} as const satisfies Partial<Record<ActionName, Record<string, StatedField>>>

/**
 * `*Minor` fields the model copies from saved reads and keeps in minor units:
 * the price snapshot a sale is checked against, and amounts of existing
 * ledger credits and allocations.
 */
export const copiedMinorFields = {
  order_create: ["lines[].expectedFixedPriceMinor"],
  customer_credit_apply: ["amountMinor"],
  customer_allocation_release: ["amountMinor"],
  supplier_allocation_release: ["amountMinor"],
  supplier_advance_allocate: ["amountMinor"],
} as const satisfies Partial<Record<ActionName, readonly string[]>>

export const statedAmountPattern =
  /^(?:\d{1,3}(?:,\d{3})+|\d{1,12})(?:\.\d{1,2})?$/
export const statedAmountDescription =
  'Money the user stated, in major currency units exactly as said: ₦3,000 is "3000", ₦2,500.50 is "2500.50". Never convert to kobo/cents; the server does.'

/** "3,000.5" → 300050 (or "300050"). Exact string arithmetic; no floats. */
export function statedAmountToMinor(value: string, kind: Kind = "number") {
  const [whole = "0", fraction = ""] = value
    .trim()
    .replaceAll(",", "")
    .split(".")
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"))
  return kind === "number" ? Number(minor) : minor.toString()
}

/** 150 → "1.50", 250000 → "2500". */
export function minorToStatedAmount(value: number | string) {
  const minor = BigInt(value)
  const cents = minor % 100n
  return cents
    ? `${minor / 100n}.${cents.toString().padStart(2, "0")}`
    : `${minor / 100n}`
}

function fieldsFor(action: unknown) {
  return typeof action === "string" && action in statedMoneyFields
    ? Object.entries(
        statedMoneyFields[action as keyof typeof statedMoneyFields],
      ).map(([path, field]: [string, StatedField]) => {
        const segments = path.split(".")
        const canonicalKey = segments.at(-1) ?? path
        return {
          segments,
          kind: field.kind,
          canonicalKey,
          modelKey: field.as ?? canonicalKey.replace(/Minor$/, ""),
        }
      })
    : []
}

/** Calls `leaf` on each object holding the path's last key. */
export function visitDraftPath(
  value: unknown,
  segments: string[],
  path: (string | number)[],
  leaf: (parent: Record<string, unknown>, path: (string | number)[]) => void,
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return
  const [head = "", ...rest] = segments
  const record = value as Record<string, unknown>
  if (!rest.length) return leaf(record, path)
  const key = head.replace(/\[\]$/, "")
  const next = record[key]
  if (!head.endsWith("[]"))
    return visitDraftPath(next, rest, [...path, key], leaf)
  if (Array.isArray(next))
    next.forEach((item, index) =>
      visitDraftPath(item, rest, [...path, key, index], leaf),
    )
}

const issue = (path: (string | number)[], message: string) =>
  new z.ZodError([{ code: "custom", path, message, input: undefined }])

/**
 * Turns the model's stated-money draft into the canonical proposal input.
 * Throws a ZodError when a stated field arrives in minor units or malformed.
 */
export function canonicalStatedMoneyDraft(input: unknown): unknown {
  if (!input || typeof input !== "object" || !("action" in input)) return input
  const fields = fieldsFor(input.action)
  if (!fields.length) return input
  const draft = structuredClone(input) as Record<string, unknown>
  for (const field of fields)
    visitDraftPath(draft, field.segments, [], (parent, path) => {
      if (field.canonicalKey in parent)
        throw issue(
          [...path, field.canonicalKey],
          `Write ${field.modelKey} in major units as the user said it (e.g. "3000" for ₦3,000), not ${field.canonicalKey}.`,
        )
      if (!(field.modelKey in parent)) return
      const value = parent[field.modelKey]
      if (typeof value !== "string" || !statedAmountPattern.test(value.trim()))
        throw issue(
          [...path, field.modelKey],
          `Write ${field.modelKey} as a decimal string in major units, e.g. "3000" or "3,000.50".`,
        )
      parent[field.canonicalKey] = statedAmountToMinor(value, field.kind)
      delete parent[field.modelKey]
    })
  return draft
}

/** The reverse, for rehearsal drafts written in stored minor units. */
export function statedMoneyFromCanonical(input: unknown): unknown {
  if (!input || typeof input !== "object" || !("action" in input)) return input
  const fields = fieldsFor(input.action)
  if (!fields.length) return input
  const draft = structuredClone(input) as Record<string, unknown>
  for (const field of fields)
    visitDraftPath(draft, field.segments, [], (parent) => {
      const value = parent[field.canonicalKey]
      if (typeof value !== "number" && typeof value !== "string") return
      parent[field.modelKey] = minorToStatedAmount(value)
      delete parent[field.canonicalKey]
    })
  return draft
}

/**
 * A canonical validation issue as the model wrote the draft: the stated field
 * name, and a limit in major units rather than kobo.
 */
export function statedMoneyIssue<
  I extends { path: PropertyKey[]; message: string; maximum?: unknown },
>(action: unknown, issue: I): I {
  const last = issue.path.at(-1)
  const field = fieldsFor(action).find((entry) => entry.canonicalKey === last)
  if (!field) return issue
  const maximum =
    typeof issue.maximum === "number" || typeof issue.maximum === "bigint"
      ? minorToStatedAmount(issue.maximum.toString())
      : undefined
  return {
    ...issue,
    path: [...issue.path.slice(0, -1), field.modelKey],
    message: maximum
      ? `Too big: ${field.modelKey} can be at most ${maximum} in major units.`
      : issue.message,
  }
}

export type JsonNode = {
  properties?: Record<string, JsonNode>
  required?: string[]
  items?: JsonNode
  anyOf?: JsonNode[]
  oneOf?: JsonNode[]
  allOf?: JsonNode[]
  const?: unknown
  [key: string]: unknown
}
/** The node and every union/intersection branch below it. */
export function branches(node: JsonNode | undefined): JsonNode[] {
  if (!node) return []
  return [
    node,
    ...[
      ...(node.anyOf ?? []),
      ...(node.oneOf ?? []),
      ...(node.allOf ?? []),
    ].flatMap(branches),
  ]
}

/** Schema objects that can hold the last key of a draft path. */
export function schemaParents(action: JsonNode, segments: string[]) {
  let nodes = [action]
  for (const segment of segments.slice(0, -1)) {
    const key = segment.replace(/\[\]$/, "")
    nodes = nodes
      .flatMap(branches)
      .map((node) => node.properties?.[key])
      .map((node) => (segment.endsWith("[]") ? node?.items : node))
      .filter((node): node is JsonNode => Boolean(node))
  }
  return nodes.flatMap(branches)
}

/** Rewrites the draftAction JSON schema so stated fields read as major units. */
export function statedMoneyJsonSchema<T extends object>(schema: T): T {
  const root = structuredClone(schema) as JsonNode
  for (const action of branches(root)) {
    const name = action.properties?.action?.const
    for (const field of fieldsFor(name)) {
      for (const node of schemaParents(action, field.segments)) {
        const properties = node.properties
        if (!properties?.[field.canonicalKey]) continue
        // Same key order, so the model reads the fields where it expects them.
        node.properties = Object.fromEntries(
          Object.entries(properties).map(([key, value]) =>
            key === field.canonicalKey
              ? [
                  field.modelKey,
                  {
                    type: "string",
                    pattern: statedAmountPattern.source,
                    description: statedAmountDescription,
                  },
                ]
              : [key, value],
          ),
        )
        node.required = node.required?.map((key) =>
          key === field.canonicalKey ? field.modelKey : key,
        )
      }
    }
  }
  return root as T
}
