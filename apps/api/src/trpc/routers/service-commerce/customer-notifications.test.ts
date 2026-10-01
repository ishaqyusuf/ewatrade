import { expect, test } from "bun:test"

import { createCallerFactory } from "../../init"
import { serviceCommerceCustomerNotificationsRouter } from "./customer-notifications"

const createCaller = createCallerFactory(
  serviceCommerceCustomerNotificationsRouter,
)

test("undeclared Account cannot read notification preferences", async () => {
  let preferenceReads = 0
  const caller = createCaller({
    db: {
      user: { findUnique: async () => ({ ageBand: "UNDECLARED" }) },
      storeConversationAccountNotificationPreference: {
        findUnique: async () => {
          preferenceReads += 1
          return null
        },
      },
    },
    session: { user: { id: "legacy-account" } },
  } as never)

  await expect(
    caller.accountStoreConversationNotificationPreference(),
  ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
  expect(preferenceReads).toBe(0)
})

test("declared teen Account can read its notification preference", async () => {
  let preferenceReads = 0
  const caller = createCaller({
    db: {
      user: {
        findUnique: async () => ({
          ageBand: "AGE_13_TO_15",
          emailVerified: true,
          id: "teen-account",
        }),
      },
      storeConversationAccountNotificationPreference: {
        findUnique: async () => {
          preferenceReads += 1
          return null
        },
      },
    },
    session: { user: { id: "teen-account" } },
  } as never)

  expect(
    await caller.accountStoreConversationNotificationPreference(),
  ).toMatchObject({ emailEligible: true })
  expect(preferenceReads).toBe(1)
})
