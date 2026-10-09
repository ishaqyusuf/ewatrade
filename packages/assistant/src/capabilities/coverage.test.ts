import { expect, test } from "bun:test"
import { z } from "zod"
import {
  buildCapabilityCoverage,
  ruleFor,
  validateCapabilityManifest,
} from "./coverage"
import { capabilityForAction, capabilityManifest } from "./manifest"
import type { Capability, ProcedureRule } from "./types"

const read = capabilityManifest[0]
const write = capabilityForAction("customer_create")

test("the manifest registers the four reviewed actions with schema, policy and receipt", () => {
  expect(validateCapabilityManifest()).toEqual([])
  expect(
    capabilityManifest
      .filter((entry) => entry.mode === "write")
      .map((entry) => entry.action),
  ).toEqual([
    "customer_create",
    "product_create",
    "order_create",
    "payment_record",
  ])
  expect(
    write.schema.safeParse({ action: "customer_create", name: "Amina" }),
  ).toMatchObject({ success: true })
})

test("manifest validation rejects duplicates, empty policy and mismatched schemas", () => {
  const broken: Capability[] = [
    read,
    { ...read, tool: "other" },
    { ...read, id: "search.other", policy: { roles: [] } },
    {
      ...write,
      id: "customers.other",
      schema: z.object({ action: z.literal("product_create") }),
      receipt: "",
    },
  ]
  expect(validateCapabilityManifest(broken)).toEqual([
    "search.records: duplicate ID",
    "search.other: policy has no roles",
    "search.other: tool searchRecords used by search.records",
    "customers.other: no receipt",
    "customers.other: schema does not accept customer_create",
  ])
})

test("exact procedure rules win over the longest matching pattern", () => {
  const rules: Record<string, ProcedureRule> = {
    "finance.*": { owner: "finance", status: "planned", ticket: "E01" },
    "finance.*Money*": { owner: "finance", status: "planned", ticket: "E03" },
    "finance.createMoneyAccount": {
      owner: "finance",
      status: "planned",
      ticket: "E01",
    },
  }
  expect(ruleFor("finance.recordMoney", rules)?.pattern).toBe("finance.*Money*")
  expect(ruleFor("finance.createMoneyAccount", rules)?.pattern).toBe(
    "finance.createMoneyAccount",
  )
  expect(ruleFor("finance.book", rules)?.pattern).toBe("finance.*")
  expect(ruleFor("orders.create", rules)).toBeNull()
})

test("coverage fails on unclassified merchant, stale and conflicting entries", () => {
  const { rows, errors } = buildCapabilityCoverage(
    [
      { path: "search.global", type: "query", merchant: true },
      { path: "orders.refund", type: "mutation", merchant: true },
      { path: "auth.signIn", type: "mutation", merchant: false },
    ],
    [read],
    {
      "search.global": { owner: "search", status: "excluded", reason: "x" },
      "stock.*": { owner: "inventory", status: "planned", ticket: "Z99" },
    },
  )
  expect(errors).toEqual([
    "search.global: supported by the manifest and also classified",
    "stock.*: unknown ticket Z99",
    "stock.*: rule matches no procedure",
    "orders.refund: merchant procedure is not classified",
  ])
  expect(rows.map((row) => [row.path, row.status])).toEqual([
    ["auth.signIn", "excluded"],
    ["orders.refund", "excluded"],
    ["search.global", "supported"],
  ])
})
