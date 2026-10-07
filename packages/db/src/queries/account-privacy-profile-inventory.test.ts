import { expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import { getAccountPrivacyProfileInventory } from "./account-privacy-profile-inventory"
import { mobileOtpIdentifiersForEmail } from "./mobile-otp-identifier"

test("profile inventory returns counts and field presence without personal values", async () => {
  const queries: Record<string, unknown> = {}
  const db = {
    user: {
      findUnique: async (query: unknown) => {
        queries.user = query
        return {
          email: "Member@Example.Test",
          name: "Member Name",
          phone: "+2348000000000",
          image: null,
          firstName: null,
          lastName: null,
          displayName: null,
          avatarUrl: null,
          metadata: { private: "value" },
          emailVerifiedAt: null,
          phoneVerifiedAt: null,
          isPlatformAdmin: false,
          ageBand: "UNDECLARED",
          ageDeclaredAt: null,
        }
      },
    },
    account: {
      count: async (query: unknown) => {
        queries.account = query
        return 2
      },
    },
    session: {
      count: async (query: unknown) => {
        queries.session = query
        return 3
      },
    },
    legalAcceptance: {
      count: async (query: unknown) => {
        queries.legal = query
        return 1
      },
    },
    verification: {
      count: async (query: unknown) => {
        queries.verification = query
        return 4
      },
    },
  } as unknown as PrismaClient
  const result = await getAccountPrivacyProfileInventory(
    db,
    "user-1",
    " MEMBER@example.test ",
  )
  expect(result).toEqual({
    userExists: true,
    originalEmailRemains: true,
    personalFieldCount: 3,
    authAccounts: 2,
    sessions: 3,
    legalAcceptances: 1,
    verificationRows: 4,
  })
  expect(queries.account).toEqual({ where: { userId: "user-1" } })
  expect(queries.verification).toEqual({
    where: {
      identifier: { in: mobileOtpIdentifiersForEmail("member@example.test") },
    },
  })
  expect(JSON.stringify(result)).not.toContain("Member Name")
  expect(JSON.stringify(result)).not.toContain("+234")
  expect(JSON.stringify(result)).not.toContain("private")
})

test("removed User does not hide retained auth, session or OTP rows", async () => {
  const db = {
    user: { findUnique: async () => null },
    account: { count: async () => 1 },
    session: { count: async () => 2 },
    legalAcceptance: { count: async () => 0 },
    verification: { count: async () => 1 },
  } as unknown as PrismaClient
  expect(
    await getAccountPrivacyProfileInventory(
      db,
      "user-1",
      "member@example.test",
    ),
  ).toEqual({
    userExists: false,
    originalEmailRemains: false,
    personalFieldCount: 0,
    authAccounts: 1,
    sessions: 2,
    legalAcceptances: 0,
    verificationRows: 1,
  })
})

test.each([
  ["younger teen", "AGE_13_TO_15", null, 1],
  ["older teen", "AGE_16_TO_17", null, 1],
  ["adult", "ADULT", null, 1],
  ["timestamp only", "UNDECLARED", new Date("2026-09-01T00:00:00Z"), 1],
  ["band and timestamp", "ADULT", new Date("2026-09-01T00:00:00Z"), 2],
  ["cleared", "UNDECLARED", null, 0],
])(
  "profile inventory counts %s declaration without returning it",
  async (_label, ageBand, ageDeclaredAt, expectedCount) => {
    const db = {
      user: {
        findUnique: async (query: { select: Record<string, boolean> }) => {
          expect(query.select).toMatchObject({
            ageBand: true,
            ageDeclaredAt: true,
          })
          return {
            email: "anonymous@example.test",
            name: "",
            image: null,
            phone: null,
            firstName: null,
            lastName: null,
            displayName: null,
            avatarUrl: null,
            metadata: null,
            emailVerifiedAt: null,
            phoneVerifiedAt: null,
            isPlatformAdmin: false,
            ageBand,
            ageDeclaredAt,
          }
        },
      },
      account: { count: async () => 0 },
      session: { count: async () => 0 },
      legalAcceptance: { count: async () => 0 },
      verification: { count: async () => 0 },
    } as unknown as PrismaClient
    const result = await getAccountPrivacyProfileInventory(
      db,
      "user-1",
      "member@example.test",
    )
    expect(result.personalFieldCount).toBe(expectedCount)
    expect(result).not.toHaveProperty("ageBand")
    expect(result).not.toHaveProperty("ageDeclaredAt")
  },
)
