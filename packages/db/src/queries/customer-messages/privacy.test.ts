import { expect, test } from "bun:test"
import { accountPrivacyAdditionalScopeIsResolved } from "../account-privacy-record-scope"
import { customerMessageTemplatePrivacyInventory } from "./privacy"

test("optional editor attribution cannot be silently omitted from privacy inventory", async () => {
  const db = { $queryRaw: async () => [{ customerMessageTemplates: 2 }] }
  expect(
    await customerMessageTemplatePrivacyInventory(
      db as Parameters<typeof customerMessageTemplatePrivacyInventory>[0],
      "subject",
    ),
  ).toEqual({ customerMessageTemplates: 2 })
  for (const count of [undefined, -1, 1.5]) {
    const invalid = {
      $queryRaw: async () => [{ customerMessageTemplates: count }],
    }
    await expect(
      customerMessageTemplatePrivacyInventory(
        invalid as Parameters<
          typeof customerMessageTemplatePrivacyInventory
        >[0],
        "subject",
      ),
    ).rejects.toThrow("unavailable")
  }
})

test("an unresolved editor record blocks completion even when old legacy domains are empty", async () => {
  // No approved source-owned retention policy: a count alone cannot establish erasure.
  const db = {
    $queryRaw: async () => [],
    accountPrivacyRecordRetention: { findMany: async () => [] },
  }
  expect(
    await accountPrivacyAdditionalScopeIsResolved(
      db as unknown as Parameters<
        typeof accountPrivacyAdditionalScopeIsResolved
      >[0],
      {
        requestId: "request",
        subjectId: "subject",
        inventory: {
          legacyMessages: 0,
          automationEvents: 0,
          customerMessageTemplates: 1,
        },
      },
    ),
  ).toBe(false)
})
