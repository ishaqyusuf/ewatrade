import { expect, test } from "bun:test"
import { z } from "zod"
import { writeCapabilities } from "../capabilities/manifest"
import { generalActionSchema } from "./contracts"
import {
  canonicalStatedTimeDraft,
  statedTimeFields,
  statedTimeFromCanonical,
  statedTimeJsonSchema,
  statedTimeToUtc,
} from "./stated-time"

// 12 Oct 2026, Jawdah Poultry QA: an expense "today" at 17:50 Lagos time was
// drafted as 17:50Z, an hour in the future, and finance refused it.
test("local business time converts with the business time zone", () => {
  expect(statedTimeToUtc("2026-10-12T17:50", "Africa/Lagos")).toBe(
    "2026-10-12T16:50:00.000Z",
  )
  expect(statedTimeToUtc("2026-10-12", "Africa/Lagos")).toBe(
    "2026-10-11T23:00:00.000Z",
  )
  expect(statedTimeToUtc("2026-10-12T17:50+01:00", "UTC")).toBe(
    "2026-10-12T16:50:00.000Z",
  )
  // A wall time right after a daylight-saving change keeps its own offset.
  expect(statedTimeToUtc("2026-03-29T03:30", "Europe/London")).toBe(
    "2026-03-29T02:30:00.000Z",
  )
})

test("a Z time is refused instead of guessed", () => {
  for (const effectiveAt of [
    "2026-10-12T17:50:00Z",
    "2026-10-12T17:50:00.000Z",
  ])
    expect(() =>
      canonicalStatedTimeDraft(
        { action: "money_movement", effectiveAt },
        "Africa/Lagos",
      ),
    ).toThrow("never add Z")
})

test("nested and optional draft times convert; other actions are untouched", () => {
  expect(
    canonicalStatedTimeDraft(
      {
        action: "expense_record",
        incurredAt: "2026-10-12T08:00",
        payment: { effectiveAt: "2026-10-12T08:05" },
      },
      "Africa/Lagos",
    ),
  ).toEqual({
    action: "expense_record",
    incurredAt: "2026-10-12T07:00:00.000Z",
    payment: { effectiveAt: "2026-10-12T07:05:00.000Z" },
  })
  const cleared = {
    action: "order_metadata_update",
    patch: { deliveryDueAt: null },
  }
  expect(canonicalStatedTimeDraft(cleared, "Africa/Lagos")).toEqual(cleared)
  const other = { action: "customer_create", name: "Amina" }
  expect(canonicalStatedTimeDraft(other, "Africa/Lagos")).toBe(other)
})

test("rehearsal UTC instants travel with an explicit offset", () => {
  const stated = statedTimeFromCanonical({
    action: "stock_receive",
    effectiveAt: "2026-10-12T07:30:00.000Z",
  })
  expect(stated).toEqual({
    action: "stock_receive",
    effectiveAt: "2026-10-12T07:30:00.000+00:00",
  })
  expect(canonicalStatedTimeDraft(stated, "Africa/Lagos")).toEqual({
    action: "stock_receive",
    effectiveAt: "2026-10-12T07:30:00.000Z",
  })
})

type JsonNode = {
  format?: string
  type?: unknown
  pattern?: string
  properties?: Record<string, JsonNode>
  items?: JsonNode
  anyOf?: JsonNode[]
  oneOf?: JsonNode[]
  allOf?: JsonNode[]
}
function timePaths(
  node: JsonNode | undefined,
  path = "",
  out = new Set<string>(),
) {
  if (!node) return out
  for (const branch of [
    ...(node.anyOf ?? []),
    ...(node.oneOf ?? []),
    ...(node.allOf ?? []),
  ])
    timePaths(branch, path, out)
  if (node.items) timePaths(node.items, `${path}[]`, out)
  if (node.format === "date-time") out.add(path)
  for (const [key, value] of Object.entries(node.properties ?? {}))
    timePaths(value, path ? `${path}.${key}` : key, out)
  return out
}

// A new draft time must be listed, or the model writes local time as UTC.
test("every date-time draft field is a stated local time", () => {
  for (const capability of writeCapabilities) {
    const found = timePaths(
      z.toJSONSchema(capability.schema, {
        io: "input",
        unrepresentable: "any",
      }) as JsonNode,
    )
    const listed: readonly string[] =
      (statedTimeFields as Record<string, readonly string[]>)[
        capability.action
      ] ?? []
    expect({ action: capability.action, fields: [...found].sort() }).toEqual({
      action: capability.action,
      fields: [...listed].sort(),
    })
  }
})

test("the tool schema asks for local time and the result still validates", () => {
  const expense = writeCapabilities.find(
    (capability) => capability.action === "expense_record",
  )
  if (!expense) throw Error("expense_record capability missing")
  const schema = statedTimeJsonSchema(
    z.toJSONSchema(expense.schema, { io: "input" }),
  )
  expect(timePaths(schema as JsonNode).size).toBe(0)
  expect(JSON.stringify(schema)).toContain("Never add Z")
  const draft = canonicalStatedTimeDraft(
    {
      action: "expense_record",
      bookId: "book",
      payeeName: "Agro Mart",
      description: "Feed",
      incurredAt: "2026-10-12T08:00",
      expenseAlreadyIncurred: true,
      lines: [
        { accountId: "feed", description: "Feed", amountMinor: "450000" },
      ],
    },
    "Africa/Lagos",
  )
  expect(generalActionSchema.safeParse(draft).success).toBe(true)
})
