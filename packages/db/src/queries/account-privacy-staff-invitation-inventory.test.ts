import { describe, expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import { getAccountPrivacyStaffInvitationInventory } from "./account-privacy-staff-invitation-inventory"
import { staffInvitationPrivacyInventoryFixture } from "./account-privacy-staff-invitation-inventory.fixture"

describe("count-only staff invitation privacy inventory", () => {
  test("one parameterized snapshot returns counts without content, token, address or provider IDs", async () => {
    const calls: unknown[][] = []
    const row = staffInvitationPrivacyInventoryFixture(
      "staffInvitationCommands",
    )
    const db = {
      $queryRaw: async (...values: unknown[]) => {
        calls.push(values)
        return [row]
      },
    } as unknown as Pick<PrismaClient, "$queryRaw">
    expect(
      await getAccountPrivacyStaffInvitationInventory(
        db,
        "subject",
        " STAFF@Example.Test ",
      ),
    ).toEqual(row)
    expect(calls).toHaveLength(1)
    const values = calls[0]?.slice(1)
    expect(values).toContain("subject")
    expect(values).toContain("staff@example.test")
    expect(JSON.stringify(row)).not.toContain("staff@example.test")
    expect(Object.keys(row)).toHaveLength(7)
  })
  test("contact candidates are absent unless caller supplies verified original contact", async () => {
    const params: unknown[] = []
    const db = {
      $queryRaw: async (_: unknown, ...values: unknown[]) => {
        params.push(...values)
        return [staffInvitationPrivacyInventoryFixture()]
      },
    } as unknown as Pick<PrismaClient, "$queryRaw">
    await getAccountPrivacyStaffInvitationInventory(db, "subject")
    expect(params).toContain(null)
    expect(params).not.toContain("")
  })
  test("missing, partial, negative and corrupt counts fail closed", async () => {
    for (const row of [
      undefined,
      {},
      {
        ...staffInvitationPrivacyInventoryFixture(),
        staffInvitationAttempts: -1,
      },
      {
        ...staffInvitationPrivacyInventoryFixture(),
        staffInvitationCommands: Number.NaN,
      },
    ]) {
      const db = {
        $queryRaw: async () => (row === undefined ? [] : [row]),
      } as unknown as Pick<PrismaClient, "$queryRaw">
      await expect(
        getAccountPrivacyStaffInvitationInventory(db, "subject"),
      ).rejects.toThrow("unavailable")
    }
    const db = {
      $queryRaw: async () => {
        throw Error("Must not query")
      },
    } as unknown as Pick<PrismaClient, "$queryRaw">
    await expect(
      getAccountPrivacyStaffInvitationInventory(db, " "),
    ).rejects.toThrow("subject required")
  })
})
