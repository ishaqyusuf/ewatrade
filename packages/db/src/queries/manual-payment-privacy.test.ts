import { expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import { manualPaymentPrivacyInventory } from "./manual-payment-privacy"
test("manual-payment attribution fails closed on missing/invalid counts and retains link/reviewer/asset evidence", async () => {
  const db = (rows: unknown[]) =>
    ({ $queryRaw: async () => rows }) as unknown as Pick<
      PrismaClient,
      "$queryRaw"
    >
  await expect(
    manualPaymentPrivacyInventory(db([]), "subject"),
  ).rejects.toThrow("unavailable")
  await expect(
    manualPaymentPrivacyInventory(
      db([
        {
          manualPaymentLinks: 0,
          manualPaymentReviews: -1,
          manualPaymentReceiptAssets: 0,
          manualPaymentAlertSettings: 0,
          manualPaymentAlertIntents: 0,
          manualPaymentAlertNoticeReads: 0,
        },
      ]),
      "subject",
    ),
  ).rejects.toThrow("unavailable")
  expect(
    await manualPaymentPrivacyInventory(
      db([
        {
          manualPaymentLinks: 2,
          manualPaymentReviews: 1,
          manualPaymentReceiptAssets: 1,
          manualPaymentAlertSettings: 1,
          manualPaymentAlertIntents: 3,
          manualPaymentAlertNoticeReads: 2,
        },
      ]),
      "subject",
    ),
  ).toEqual({
    manualPaymentLinks: 2,
    manualPaymentReviews: 1,
    manualPaymentReceiptAssets: 1,
    manualPaymentAlertSettings: 1,
    manualPaymentAlertIntents: 3,
    manualPaymentAlertNoticeReads: 2,
  })
})
