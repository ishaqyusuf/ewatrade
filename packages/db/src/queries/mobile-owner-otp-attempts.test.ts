import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { MobileOtpAttemptError, verifyMobileOwnerOtp } from "./mobile-auth"

test("five wrong email-code guesses persist the attempt count and invalidate the challenge", async () => {
  const row = {
    id: "challenge",
    expiresAt: new Date(Date.now() + 600_000),
    value: JSON.stringify({
      attempts: 0,
      codeHash: createHash("sha256").update("654321").digest("hex"),
    }),
  }
  const db = {
    verification: {
      findFirst: async () =>
        row.expiresAt.getTime() > Date.now() ? row : null,
      update: async ({ data }: { data: { value: string; expiresAt?: Date } }) =>
        Object.assign(row, data),
    },
  } as unknown as Parameters<typeof verifyMobileOwnerOtp>[0]
  for (let attempt = 1; attempt <= 5; attempt++) {
    await expect(
      verifyMobileOwnerOtp(db, {
        email: "test@example.com",
        mode: "login",
        code: "000000",
      }),
    ).rejects.toBeInstanceOf(MobileOtpAttemptError)
    expect(JSON.parse(row.value).attempts).toBe(attempt)
  }
  await expect(
    verifyMobileOwnerOtp(db, {
      email: "test@example.com",
      mode: "login",
      code: "654321",
    }),
  ).rejects.toThrow("expired")
})
