import { expect, test } from "bun:test"
import type { ExpenseReceiptUploadRepository } from "@ewatrade/db/finance-expense-receipt-upload"
import {
  createExpenseReceiptSessionCheck,
  financeExpenseReceiptActorScope,
} from "./expense-receipt-session"
import { withFinanceExpenseReceiptUploadSession } from "./expense-receipt-upload-workflow"

const initial = {
  sessionId: "session_receipt",
  token: "synthetic-private-token",
  actorUserId: "actor_receipt",
  tenantId: "tenant_receipt",
}

function fixture() {
  let current: typeof initial | null = { ...initial }
  let persisted: { userId: string; token: string; expiresAt: Date } | null = {
    userId: initial.actorUserId,
    token: initial.token,
    expiresAt: new Date(Date.now() + 60_000),
  }
  let privacyBlocked = false
  let expireWhilePrivacyWaits = false
  const reads: string[] = []
  const original = { ...initial }
  const check = createExpenseReceiptSessionCheck(original, {
    current: async () => current,
    persisted: async (sessionId) => {
      reads.push(`session:${sessionId}`)
      return persisted
    },
    privacyBlocked: async (actorUserId) => {
      reads.push(`privacy:${actorUserId}`)
      if (expireWhilePrivacyWaits && persisted)
        persisted.expiresAt = new Date(Date.now() - 1)
      return privacyBlocked
    },
  })
  return {
    check,
    original,
    reads,
    setCurrent: (value: typeof current) => {
      current = value
    },
    setPersisted: (value: typeof persisted) => {
      persisted = value
    },
    blockPrivacy: () => {
      privacyBlocked = true
    },
    expireDuringPrivacy: () => {
      expireWhilePrivacyWaits = true
    },
  }
}

test("current receipt session checks detached exact identity and persisted expiry on every call", async () => {
  const f = fixture()
  f.original.sessionId = "mutated_input"
  f.original.token = "mutated_token"
  await f.check()
  await f.check()
  expect(f.reads).toEqual([
    `session:${initial.sessionId}`,
    `privacy:${initial.actorUserId}`,
    `session:${initial.sessionId}`,
    `privacy:${initial.actorUserId}`,
  ])
})

test("missing, changed or rotated current session refuses before persisted reads", async () => {
  for (const current of [
    null,
    { ...initial, sessionId: "other" },
    { ...initial, token: "rotated" },
    { ...initial, actorUserId: "other" },
    { ...initial, tenantId: "other" },
  ]) {
    const f = fixture()
    f.setCurrent(current)
    await expect(f.check()).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Current receipt session access is unavailable.",
    })
    expect(f.reads).toHaveLength(0)
  }
})

test("a cached authenticated cookie cannot authorize a deleted, expired, foreign or rotated persisted session", async () => {
  const valid = {
    userId: initial.actorUserId,
    token: initial.token,
    expiresAt: new Date(Date.now() + 60_000),
  }
  for (const persisted of [
    null,
    { ...valid, userId: "other" },
    { ...valid, token: "rotated" },
    { ...valid, expiresAt: new Date(0) },
    { ...valid, expiresAt: new Date(Number.NaN) },
  ]) {
    const f = fixture()
    f.setPersisted(persisted)
    await expect(f.check()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Current receipt session access is unavailable.",
    })
  }
  const f = fixture()
  await f.check()
  f.setPersisted(null)
  await expect(f.check()).rejects.toMatchObject({ code: "UNAUTHORIZED" })
})

test("privacy revocation and expiry during awaited privacy evaluation refuse", async () => {
  const f = fixture()
  await f.check()
  f.blockPrivacy()
  await expect(f.check()).rejects.toMatchObject({ code: "UNAUTHORIZED" })
  const expiry = fixture()
  expiry.expireDuringPrivacy()
  await expect(expiry.check()).rejects.toMatchObject({ code: "UNAUTHORIZED" })
})

test("Owner/Admin receipt actor extraction retains the original protected gate", () => {
  const context = {
    session: { user: { id: initial.actorUserId } },
    tenantContext: {
      tenant: { id: initial.tenantId },
      membership: { role: "admin" },
    },
  }
  expect(financeExpenseReceiptActorScope(context)).toEqual({
    tenantId: initial.tenantId,
    actorUserId: initial.actorUserId,
  })
  expect(() =>
    financeExpenseReceiptActorScope({ ...context, session: null }),
  ).toThrow("You must be signed in")
  expect(() =>
    financeExpenseReceiptActorScope({
      ...context,
      tenantContext: {
        ...context.tenantContext,
        membership: { role: "MANAGER" },
      },
    }),
  ).toThrow("Only Owners and Admins")
})

test("every upload boundary checks session before invoking the real repository callback", async () => {
  const effects: string[] = []
  let blocked = false
  const checkSession = async () => {
    effects.push("check")
    if (blocked) throw new Error("Session revoked")
  }
  // Boundary fixture only; result shape is intentionally unused in these refusals.
  const repository = new Proxy({} as ExpenseReceiptUploadRepository, {
    get: (_target, operation) => async () => {
      effects.push(String(operation))
      return undefined
    },
  })
  const guarded = withFinanceExpenseReceiptUploadSession(
    repository,
    checkSession,
  )
  const target = {} as Parameters<typeof guarded.claim>[1]
  const claim = {} as Parameters<typeof guarded.revalidate>[0]
  const stored = {} as Parameters<typeof guarded.complete>[1]
  const operations = [
    () => guarded.load(),
    () => guarded.claim("store_test", target),
    () => guarded.revalidate(claim),
    () => guarded.complete(claim, stored),
  ]
  for (const operation of operations) await operation()
  expect(effects).toEqual([
    "check",
    "load",
    "check",
    "claim",
    "check",
    "revalidate",
    "check",
    "complete",
  ])
  effects.length = 0
  blocked = true
  for (const operation of operations)
    await expect(operation()).rejects.toThrow("Session revoked")
  expect(effects).toEqual(["check", "check", "check", "check"])
})
