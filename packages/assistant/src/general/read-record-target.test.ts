import { expect, test } from "bun:test"
import {
  type ReadRecordTarget,
  readRecordTargetSchema,
} from "./read-record-target"

const origin = { tenantId: "business-one", storeId: "store-one" }
const targets = [
  { kind: "catalog_item", catalogItemId: "item-one", origin },
  { kind: "order", orderId: "order-one", origin },
  { kind: "customer_directory", origin },
  { kind: "customer", customerId: "customer-one", origin },
] satisfies ReadRecordTarget[]

test("read navigation retains the saved object and its original scope", () => {
  for (const target of targets)
    expect(readRecordTargetSchema.parse(target)).toEqual(target)
})

test("read targets reject authority, credential, arbitrary URL and invented customer-object fields", () => {
  for (const target of targets) {
    for (const extra of [
      { href: "https://untrusted.test" },
      { approvalToken: "secret" },
      { actorUserId: "other" },
      { origin: { ...origin, role: "OWNER" } },
    ]) {
      expect(
        readRecordTargetSchema.safeParse({ ...target, ...extra }).success,
      ).toBe(false)
    }
    expect(
      readRecordTargetSchema.safeParse({
        ...target,
        origin: { tenantId: "business-one" },
      }).success,
    ).toBe(false)
  }
  expect(
    readRecordTargetSchema.safeParse({
      kind: "customer_directory",
      customerId: "guessed",
      origin,
    }).success,
  ).toBe(false)
})

test("blank, overlong, path-normalizing and control-bearing identities fail closed", () => {
  for (const orderId of [
    "",
    " ",
    ".",
    "..",
    "a".repeat(161),
    "a\nb",
    "a\u0000b",
  ]) {
    expect(
      readRecordTargetSchema.safeParse({ kind: "order", orderId, origin })
        .success,
    ).toBe(false)
  }
})
