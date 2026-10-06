import { describe, expect, test } from "bun:test"
import {
  approvedOnboardingDataSchema,
  consumeApprovedOnboarding,
  onboardingDraftSchema,
  readApprovedOnboarding,
  saveApprovedOnboardingDraft,
  verifyApprovedOnboardingEmail,
} from "./onboarding-continuation"
import type { DbClient } from "./types"

const token = `ea_${"a".repeat(43)}`
function fixture(overrides: Record<string, unknown> = {}) {
  let row = {
    id: "onboarding-1",
    token,
    completed: false,
    expiresAt: new Date(Date.now() + 60_000),
    formData: {
      kind: "early_access",
      accessUrl: `https://dashboard.example.com/signup?access_token=${token}`,
      approvedAt: new Date().toISOString(),
      requestedAt: new Date().toISOString(),
      email: "owner@example.com",
      fullName: "Approved Owner",
      companyName: "Approved Business",
      leadId: "lead-1",
      emailVerifiedAt: new Date().toISOString(),
    },
    ...overrides,
  }
  const db = {
    onboardingSession: {
      findUnique: async ({ where }: { where: { token: string } }) =>
        where.token === token ? structuredClone(row) : null,
      updateMany: async ({
        where,
        data,
      }: {
        where: {
          completed: boolean
          expiresAt: { gt: Date }
          formData: { equals: unknown }
        }
        data: Partial<typeof row>
      }) => {
        if (
          row.completed !== where.completed ||
          row.expiresAt <= where.expiresAt.gt ||
          JSON.stringify(row.formData) !== JSON.stringify(where.formData.equals)
        )
          return { count: 0 }
        row = { ...row, ...data }
        return { count: 1 }
      },
    },
  } as unknown as DbClient
  return { db, read: () => row }
}

describe("approved onboarding continuation", () => {
  test("native email verification binds the recipient and retains a saved draft", async () => {
    const access = fixture()
    const initial = approvedOnboardingDataSchema.parse(access.read().formData)
    const unverified = fixture({
      formData: {
        ...initial,
        emailVerifiedAt: undefined,
        draft: { city: "Lagos" },
      },
    })
    const verificationToken = `ear_${"v".repeat(43)}`
    const verification = {
      id: "verification-1",
      token: verificationToken,
      completed: false,
      expiresAt: new Date(Date.now() + 60_000),
      formData: {
        kind: "early_access_verification",
        accessToken: token,
        email: initial.email,
      },
    }
    const db = {
      onboardingSession: {
        findUnique: async (args: { where: { token: string } }) =>
          args.where.token === verificationToken
            ? structuredClone(verification)
            : unverified.db.onboardingSession.findUnique(args),
        updateMany: async (args: {
          where: { id: string }
          data: { completed?: boolean }
        }) => {
          if (args.where.id === verification.id) {
            verification.completed = Boolean(args.data.completed)
            return { count: 1 }
          }
          return unverified.db.onboardingSession.updateMany(args)
        },
      },
    } as unknown as DbClient
    expect(await verifyApprovedOnboardingEmail(db, verificationToken)).toEqual({
      accessToken: token,
    })
    expect(
      approvedOnboardingDataSchema.parse(unverified.read().formData).draft,
    ).toEqual({ city: "Lagos" })
    expect(
      approvedOnboardingDataSchema.parse(unverified.read().formData)
        .emailVerifiedAt,
    ).toBeDefined()
    expect(verification.completed).toBe(true)
    verification.formData.email = "different@example.com"
    await expect(
      verifyApprovedOnboardingEmail(db, verificationToken),
    ).rejects.toThrow("approved email")
  })
  test("rejects request/verification sessions, absent approval and expired/used links", async () => {
    for (const overrides of [
      { completed: true },
      { expiresAt: new Date(0) },
      { formData: { kind: "early_access_request" } },
      { formData: { kind: "early_access_verification" } },
    ]) {
      await expect(
        readApprovedOnboarding(fixture(overrides).db, token),
      ).rejects.toThrow()
    }
    await expect(
      readApprovedOnboarding(fixture().db, "arbitrary"),
    ).rejects.toThrow()
  })

  test("drafts retain verification while credentials and identity overrides are refused", async () => {
    const { db, read } = fixture()
    await saveApprovedOnboardingDraft(db, { token, draft: { city: "Lagos" } })
    const parsed = approvedOnboardingDataSchema.parse(read().formData)
    expect(parsed.emailVerifiedAt).toBeDefined()
    expect(parsed.draft).toEqual({ city: "Lagos" })
    for (const forbidden of [
      "password",
      "email",
      "businessName",
      "accessToken",
      "legalVersion",
    ])
      expect(
        onboardingDraftSchema.safeParse({ [forbidden]: "secret" }).success,
      ).toBe(false)
  })

  test("switching clients retains omitted draft fields and supports explicit clears", async () => {
    const { db, read } = fixture()
    await saveApprovedOnboardingDraft(db, {
      token,
      draft: {
        countryCode: "NG",
        region: "Lagos",
        city: "Lagos",
        orderChannels: ["walk_in"],
      },
    })
    await saveApprovedOnboardingDraft(db, {
      token,
      draft: { city: "Ikeja", countryCode: undefined },
    })
    expect(approvedOnboardingDataSchema.parse(read().formData).draft).toEqual({
      countryCode: "NG",
      region: "Lagos",
      city: "Ikeja",
      orderChannels: ["walk_in"],
    })
    await saveApprovedOnboardingDraft(db, {
      token,
      draft: { region: "", orderChannels: [] },
    })
    expect(approvedOnboardingDataSchema.parse(read().formData).draft).toEqual({
      countryCode: "NG",
      region: "",
      city: "Ikeja",
      orderChannels: [],
    })
  })

  test("completion requires the approved verified recipient and business", async () => {
    const { db, read } = fixture()
    await expect(
      consumeApprovedOnboarding(db, {
        token,
        email: "other@example.com",
        businessName: "Approved Business",
      }),
    ).rejects.toThrow("approved email")
    expect(read().completed).toBe(false)
    await consumeApprovedOnboarding(db, {
      token,
      email: "OWNER@EXAMPLE.COM",
      businessName: "Approved Business",
    })
    expect(read().completed).toBe(true)
    await expect(
      consumeApprovedOnboarding(db, {
        token,
        email: "owner@example.com",
        businessName: "Approved Business",
      }),
    ).rejects.toThrow("already complete")
  })

  test("concurrent completion has one winner and stale draft cannot undo consumption", async () => {
    const { db, read } = fixture()
    const input = {
      token,
      email: "owner@example.com",
      businessName: "Approved Business",
    }
    const results = await Promise.allSettled([
      consumeApprovedOnboarding(db, input),
      consumeApprovedOnboarding(db, input),
      saveApprovedOnboardingDraft(db, { token, draft: { city: "Lagos" } }),
    ])
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1)
    expect(read().completed).toBe(true)
  })
})
