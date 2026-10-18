import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import {
  AccountPhoneVerificationError,
  createAccountPhoneChallenge,
  discardAccountPhoneChallenge,
  getAccountPhoneVerificationStatus,
  verifyAccountPhoneChallenge,
} from "./account-phone-verification"

type User = {
  id: string
  email: string
  name: string
  phone: string | null
  phoneVerifiedAt: Date | null
  emailVerified: boolean
}
type Session = {
  id: string
  userId: string
  token: string
  createdAt: Date
  expiresAt: Date
  qaAuthorizationId: string | null
}
type Verification = {
  id: string
  identifier: string
  value: string
  createdAt: Date
  expiresAt: Date
}
type Bucket = { bucketDigest: string; sentCount: number; windowStartedAt: Date }

const envKeys = [
  "BETTER_AUTH_SECRET",
  "AUTH_SECRET",
  "DEV_PROFILE",
  "APP_ENV",
  "NODE_ENV",
] as const
let previousEnv: Record<string, string | undefined>

beforeEach(() => {
  previousEnv = Object.fromEntries(
    envKeys.map((key) => [key, process.env[key]]),
  )
  Object.assign(process.env, {
    BETTER_AUTH_SECRET: "synthetic-account-phone-secret-32-characters",
    DEV_PROFILE: "local",
    APP_ENV: "local",
    NODE_ENV: "test",
  })
})

afterEach(() => {
  for (const key of envKeys) {
    if (previousEnv[key] === undefined) Reflect.deleteProperty(process.env, key)
    else process.env[key] = previousEnv[key]
  }
})

function fixture() {
  const users = new Map<string, User>([
    [
      "owner",
      {
        id: "owner",
        email: "owner@example.test",
        name: "Owner",
        phone: "+2348000000000",
        phoneVerifiedAt: null,
        emailVerified: true,
      },
    ],
    [
      "other-owner",
      {
        id: "other-owner",
        email: "other@example.test",
        name: "Other Owner",
        phone: "+2348000000001",
        phoneVerifiedAt: null,
        emailVerified: true,
      },
    ],
  ])
  const now = new Date()
  const sessions = new Map<string, Session>([
    [
      "owner-session",
      {
        id: "owner-session",
        userId: "owner",
        token: "ordinary-session-token",
        createdAt: now,
        expiresAt: new Date(now.getTime() + 60 * 60_000),
        qaAuthorizationId: null,
      },
    ],
    [
      "other-session",
      {
        id: "other-session",
        userId: "other-owner",
        token: "other-session-token",
        createdAt: now,
        expiresAt: new Date(now.getTime() + 60 * 60_000),
        qaAuthorizationId: null,
      },
    ],
  ])
  let verifications: Verification[] = []
  let buckets: Bucket[] = []
  let requestStatus: string | null = null
  let nextId = 0
  let queue = Promise.resolve()

  const tx = {
    session: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        sessions.get(where.id) ?? null,
    },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        users.get(where.id) ?? null,
      updateMany: async ({
        where,
        data,
      }: {
        where: {
          id: string
          phone: string
          emailVerified: true
          phoneVerifiedAt: null
        }
        data: { phoneVerifiedAt: Date }
      }) => {
        const user = users.get(where.id)
        if (
          !user ||
          user.phone !== where.phone ||
          !user.emailVerified ||
          user.phoneVerifiedAt !== null
        )
          return { count: 0 }
        user.phoneVerifiedAt = data.phoneVerifiedAt
        return { count: 1 }
      },
    },
    accountPrivacyRequest: {
      findUnique: async () =>
        requestStatus ? { status: requestStatus } : null,
    },
    verification: {
      findFirst: async ({ where }: { where: { identifier: string } }) =>
        verifications
          .filter((row) => row.identifier === where.identifier)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ??
        null,
      create: async ({
        data,
      }: {
        data: Omit<Verification, "id" | "createdAt">
      }) => {
        const row = {
          ...data,
          id: `challenge-${++nextId}`,
          createdAt: new Date(),
        }
        verifications.push(row)
        return row
      },
      deleteMany: async ({
        where,
      }: {
        where: {
          identifier?: string
          id?: string
          value?: string
        }
      }) => {
        const before = verifications.length
        verifications = verifications.filter(
          (row) =>
            !(
              (!where.identifier || row.identifier === where.identifier) &&
              (!where.id || row.id === where.id) &&
              (!where.value || row.value === where.value)
            ),
        )
        return { count: before - verifications.length }
      },
      update: async ({
        where,
        data,
      }: { where: { id: string }; data: { value: string } }) => {
        const row = verifications.find((candidate) => candidate.id === where.id)
        if (!row) throw new Error("Challenge disappeared")
        row.value = data.value
        return row
      },
    },
    accountPrivacyRateBucket: {
      findUnique: async ({ where }: { where: { bucketDigest: string } }) =>
        buckets.find((bucket) => bucket.bucketDigest === where.bucketDigest) ??
        null,
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { bucketDigest: string }
        create: Bucket
        update: {
          sentCount: number | { increment: number }
          windowStartedAt?: Date
        }
      }) => {
        let bucket = buckets.find(
          (candidate) => candidate.bucketDigest === where.bucketDigest,
        )
        if (!bucket) {
          bucket = { ...create }
          buckets.push(bucket)
        } else {
          bucket.sentCount =
            typeof update.sentCount === "number"
              ? update.sentCount
              : bucket.sentCount + update.sentCount.increment
          if (update.windowStartedAt)
            bucket.windowStartedAt = update.windowStartedAt
        }
        return bucket
      },
    },
  }

  const db = {
    ...tx,
    $transaction: async <T>(action: (client: typeof tx) => Promise<T>) => {
      const previous = queue
      let release = () => {}
      queue = new Promise<void>((resolve) => {
        release = resolve
      })
      await previous
      const snapshot = structuredClone({ verifications, buckets, users })
      try {
        return await action(tx)
      } catch (error) {
        verifications = snapshot.verifications
        buckets = snapshot.buckets
        users.clear()
        for (const [id, user] of snapshot.users) users.set(id, user)
        throw error
      } finally {
        release()
      }
    },
    verification: tx.verification,
  } as unknown as PrismaClient

  return {
    db,
    users,
    sessions,
    get verifications() {
      return verifications
    },
    get buckets() {
      return buckets
    },
    setRequestStatus(status: string | null) {
      requestStatus = status
    },
  }
}

const actor = { userId: "owner", sessionId: "owner-session" }

describe("account phone verification queries", () => {
  test("reports only attached phone status and verifies it without changing account identity", async () => {
    const f = fixture()
    expect(
      await getAccountPhoneVerificationStatus(f.db as never, "owner"),
    ).toEqual({
      phone: "+2348000000000",
      verified: false,
      canVerify: true,
    })
    const before = structuredClone(f.users.get("owner"))
    const issued = await createAccountPhoneChallenge(f.db, actor, "192.0.2.40")
    expect(issued.code).toBe("123456")
    expect(issued.phone).toBe(before?.phone)
    expect(issued.value).not.toContain(issued.code)
    expect(issued.identifier).not.toContain(issued.phone)

    await verifyAccountPhoneChallenge(f.db, actor, issued.code)
    expect(f.users.get("owner")).toMatchObject({
      ...before,
      phoneVerifiedAt: expect.any(Date),
    })
    expect(f.verifications).toHaveLength(0)
    expect(f.users.get("other-owner")).toEqual({
      id: "other-owner",
      email: "other@example.test",
      name: "Other Owner",
      phone: "+2348000000001",
      phoneVerifiedAt: null,
      emailVerified: true,
    })
  })

  test("requires the exact live non-QA session and a verified-email account with an unverified phone", async () => {
    const f = fixture()
    const session = f.sessions.get("owner-session")
    if (!session) throw new Error("Missing fixture session")
    const cases: Array<() => void> = [
      () => f.sessions.delete("owner-session"),
      () => {
        f.sessions.set("owner-session", { ...session, userId: "other-owner" })
      },
      () => {
        f.sessions.set("owner-session", {
          ...session,
          createdAt: new Date(Date.now() - 15 * 60_000 - 1),
        })
      },
      () => {
        f.sessions.set("owner-session", {
          ...session,
          createdAt: new Date(Date.now() + 1_000),
        })
      },
      () => {
        f.sessions.set("owner-session", {
          ...session,
          expiresAt: new Date(Date.now() - 1),
        })
      },
      () => {
        f.sessions.set("owner-session", {
          ...session,
          qaAuthorizationId: "qa-auth",
        })
      },
      () => {
        f.sessions.set("owner-session", { ...session, token: "qas_scoped" })
      },
    ]
    for (const mutate of cases) {
      f.sessions.set("owner-session", session)
      mutate()
      await expect(
        createAccountPhoneChallenge(f.db, actor, "192.0.2.40"),
      ).rejects.toBeInstanceOf(AccountPhoneVerificationError)
      expect(f.verifications).toHaveLength(0)
    }

    f.sessions.set("owner-session", session)
    const user = f.users.get("owner")
    if (!user) throw new Error("Missing fixture user")
    user.emailVerified = false
    await expect(
      createAccountPhoneChallenge(f.db, actor, "192.0.2.40"),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    user.emailVerified = true
    user.phone = null
    await expect(
      createAccountPhoneChallenge(f.db, actor, "192.0.2.40"),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    user.phone = "+2348000000000"
    user.phoneVerifiedAt = new Date()
    await expect(
      createAccountPhoneChallenge(f.db, actor, "192.0.2.40"),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    expect(f.verifications).toHaveLength(0)
  })

  test("binds codes to user, session and current persisted phone", async () => {
    const f = fixture()
    const issued = await createAccountPhoneChallenge(f.db, actor, "192.0.2.40")
    await expect(
      verifyAccountPhoneChallenge(
        f.db,
        { userId: "other-owner", sessionId: "other-session" },
        issued.code,
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })

    const secondSession: Session = {
      id: "owner-session-2",
      userId: "owner",
      token: "another-session-token",
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60 * 60_000),
      qaAuthorizationId: null,
    }
    f.sessions.set(secondSession.id, secondSession)
    await expect(
      verifyAccountPhoneChallenge(
        f.db,
        { userId: "owner", sessionId: secondSession.id },
        issued.code,
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })

    const user = f.users.get("owner")
    if (!user) throw new Error("Missing fixture user")
    user.phone = "+2348000000002"
    await expect(
      verifyAccountPhoneChallenge(f.db, actor, issued.code),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    expect(user.phoneVerifiedAt).toBeNull()

    const emailChanged = fixture()
    const emailBound = await createAccountPhoneChallenge(
      emailChanged.db,
      actor,
      "192.0.2.40",
    )
    const emailOwner = emailChanged.users.get("owner")
    if (!emailOwner) throw new Error("Missing fixture user")
    emailOwner.emailVerified = false
    await expect(
      verifyAccountPhoneChallenge(emailChanged.db, actor, emailBound.code),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    expect(emailOwner.phoneVerifiedAt).toBeNull()
  })

  test("persists five bad attempts, enforces expiry and consumes a valid code once", async () => {
    const f = fixture()
    const issued = await createAccountPhoneChallenge(f.db, actor, "192.0.2.40")
    for (let attempt = 0; attempt < 5; attempt++)
      await expect(
        verifyAccountPhoneChallenge(f.db, actor, "654321"),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    expect(JSON.parse(f.verifications[0]?.value ?? "{}").attempts).toBe(5)
    await expect(
      verifyAccountPhoneChallenge(f.db, actor, issued.code),
    ).rejects.toThrow("Too many incorrect codes")
    expect(f.users.get("owner")?.phoneVerifiedAt).toBeNull()

    const fresh = fixture()
    const expiring = await createAccountPhoneChallenge(
      fresh.db,
      actor,
      "192.0.2.40",
    )
    const row = fresh.verifications[0]
    if (!row) throw new Error("Missing fixture challenge")
    row.expiresAt = new Date(Date.now() - 1)
    await expect(
      verifyAccountPhoneChallenge(fresh.db, actor, expiring.code),
    ).rejects.toThrow("expired")
    expect(fresh.users.get("owner")?.phoneVerifiedAt).toBeNull()
  })

  test("parallel bad codes cannot exceed or erase the persisted attempt ceiling", async () => {
    const f = fixture()
    await createAccountPhoneChallenge(f.db, actor, "192.0.2.40")
    const outcomes = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        verifyAccountPhoneChallenge(f.db, actor, "654321"),
      ),
    )
    expect(outcomes.every((outcome) => outcome.status === "rejected")).toBe(
      true,
    )
    expect(JSON.parse(f.verifications[0]?.value ?? "{}").attempts).toBe(5)
    expect(f.users.get("owner")?.phoneVerifiedAt).toBeNull()
  })

  test("a parallel verification has one winner and does not change email or other profile data", async () => {
    const f = fixture()
    const issued = await createAccountPhoneChallenge(f.db, actor, "192.0.2.40")
    const outcomes = await Promise.allSettled([
      verifyAccountPhoneChallenge(f.db, actor, issued.code),
      verifyAccountPhoneChallenge(f.db, actor, issued.code),
    ])
    expect(
      outcomes.filter((outcome) => outcome.status === "fulfilled"),
    ).toHaveLength(1)
    expect(f.users.get("owner")?.phoneVerifiedAt).toBeInstanceOf(Date)
    expect(f.verifications).toHaveLength(0)
  })

  test("enforces shared actor send budget, one-minute resend cooldown and failed-delivery exact cleanup", async () => {
    const f = fixture()
    const base = Date.now()
    const first = await createAccountPhoneChallenge(
      f.db,
      actor,
      "192.0.2.40",
      new Date(base),
    )
    await expect(
      createAccountPhoneChallenge(f.db, actor, "192.0.2.40"),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" })
    let latest = first
    for (let send = 1; send < 5; send++)
      latest = await createAccountPhoneChallenge(
        f.db,
        actor,
        "192.0.2.40",
        new Date(base + send * 60_001),
      )
    await expect(
      createAccountPhoneChallenge(
        f.db,
        actor,
        "192.0.2.40",
        new Date(base + 5 * 60_001),
      ),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" })
    expect(f.verifications).toHaveLength(1)
    await discardAccountPhoneChallenge(f.db, {
      identifier: latest.identifier,
      value: "stale-value",
    })
    expect(f.verifications).toHaveLength(1)
    await discardAccountPhoneChallenge(f.db, latest)
    expect(f.verifications).toHaveLength(0)
  })

  test("refuses to create challenges when the account has a privacy closure in progress", async () => {
    const f = fixture()
    f.setRequestStatus("PROCESSING")
    await expect(
      createAccountPhoneChallenge(f.db, actor, "192.0.2.40"),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    expect(f.verifications).toHaveLength(0)
  })
})
