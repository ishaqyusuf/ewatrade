import { expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import { AccountAgeBand } from "../../generated/prisma/enums"
import {
  assertCustomerAccountAgeAuthority,
  assertGuestAgeAuthority,
  declareCustomerAccountAgeBand,
  declareGuestAgeBand,
} from "./store-conversation-age-authority"

function dbWith(input: {
  account?: { ageBand: AccountAgeBand } | null
  guest?: { ageBand: AccountAgeBand } | null
}) {
  return {
    user: { findUnique: async () => input.account ?? null },
    storeConversationGuestIdentity: {
      findUnique: async () => input.guest ?? null,
    },
  } as unknown as PrismaClient
}

test("declared 13–17 and adult accounts can use Store messages", async () => {
  for (const ageBand of [
    AccountAgeBand.AGE_13_TO_15,
    AccountAgeBand.AGE_16_TO_17,
    AccountAgeBand.ADULT,
  ]) {
    await expect(
      assertCustomerAccountAgeAuthority(
        dbWith({ account: { ageBand } }),
        "user",
      ),
    ).resolves.toBeUndefined()
    await expect(
      assertGuestAgeAuthority(dbWith({ guest: { ageBand } }), "guest"),
    ).resolves.toBeUndefined()
  }
})

test("missing or undeclared age cannot use Store messages", async () => {
  for (const account of [null, { ageBand: AccountAgeBand.UNDECLARED }]) {
    await expect(
      assertCustomerAccountAgeAuthority(dbWith({ account }), "user"),
    ).rejects.toMatchObject({ code: "NOT_READY" })
  }
  for (const guest of [null, { ageBand: AccountAgeBand.UNDECLARED }]) {
    await expect(
      assertGuestAgeAuthority(dbWith({ guest }), "guest"),
    ).rejects.toMatchObject({ code: "NOT_READY" })
  }
})

test("account and Guest age declarations are single-assignment", async () => {
  const calls: Array<{ ageBand: AccountAgeBand; id: string }> = []
  const db = {
    user: {
      updateMany: async ({
        data,
        where,
      }: { data: { ageBand: AccountAgeBand }; where: { id: string } }) => {
        calls.push({ ageBand: data.ageBand, id: where.id })
        return { count: 1 }
      },
    },
    storeConversationGuestIdentity: {
      updateMany: async ({
        data,
        where,
      }: { data: { ageBand: AccountAgeBand }; where: { id: string } }) => {
        calls.push({ ageBand: data.ageBand, id: where.id })
        return { count: 1 }
      },
    },
  } as unknown as PrismaClient
  await declareCustomerAccountAgeBand(
    db,
    "account",
    AccountAgeBand.AGE_13_TO_15,
  )
  await declareGuestAgeBand(db, "guest", AccountAgeBand.ADULT)
  expect(calls).toEqual([
    { ageBand: AccountAgeBand.AGE_13_TO_15, id: "account" },
    { ageBand: AccountAgeBand.ADULT, id: "guest" },
  ])
  await expect(
    declareGuestAgeBand(db, "guest", AccountAgeBand.UNDECLARED),
  ).rejects.toMatchObject({ code: "CONFLICT" })
})

test("a conflicting second age declaration is refused", async () => {
  const db = {
    user: {
      updateMany: async () => ({ count: 0 }),
      findUnique: async () => ({
        ageBand: AccountAgeBand.AGE_16_TO_17,
        ageDeclaredAt: new Date("2026-09-28T00:00:00Z"),
      }),
    },
  } as unknown as PrismaClient
  await expect(
    declareCustomerAccountAgeBand(db, "account", AccountAgeBand.ADULT),
  ).rejects.toMatchObject({ code: "CONFLICT" })
  await expect(
    declareCustomerAccountAgeBand(db, "account", AccountAgeBand.AGE_16_TO_17),
  ).resolves.toMatchObject({ ageBand: AccountAgeBand.AGE_16_TO_17 })
})
