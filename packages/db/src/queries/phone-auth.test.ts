import { describe, expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import {
  createPhoneOtp,
  isLocalPhoneAuth,
  normalizeAuthPhone,
  purgeExpiredPhoneOtpChallenges,
  verifyPhoneOtp,
} from "./phone-auth"

type Row = {
  id: string
  identifier: string
  value: string
  createdAt: Date
  expiresAt: Date
}
type Bucket = { bucketDigest: string; sentCount: number; windowStartedAt: Date }
function fixture(verified = true) {
  let rows: Row[] = []
  let buckets: Bucket[] = []
  let sessions: object[] = []
  let closing = false
  let queue = Promise.resolve()
  const user = {
    id: "owner",
    phone: "+2348000000000",
    phoneVerifiedAt: verified ? new Date() : null,
    email: "internal@phone.ewatrade.invalid",
    emailVerified: false,
    name: "Owner",
    ageBand: "ADULT",
    createdAt: new Date("2020-01-01"),
  }
  const tx = {
    verification: {
      async findFirst({ where }: { where: { identifier: string } }) {
        return rows.find((row) => row.identifier === where.identifier) ?? null
      },
      async create({ data }: { data: Omit<Row, "id" | "createdAt"> }) {
        const row = { ...data, id: "challenge", createdAt: new Date() }
        rows.push(row)
        return row
      },
      async deleteMany({
        where,
      }: {
        where: {
          identifier?: string | { startsWith: string }
          id?: string
          expiresAt?: { lte: Date }
        }
      }) {
        const previous = rows.length
        rows = rows.filter((row) => {
          const matches = where.id
            ? row.id === where.id
            : typeof where.identifier === "string"
              ? row.identifier === where.identifier
              : row.identifier.startsWith(where.identifier?.startsWith ?? "")
          return !(
            matches &&
            (!where.expiresAt || row.expiresAt <= where.expiresAt.lte)
          )
        })
        return { count: previous - rows.length }
      },
      async update({
        where,
        data,
      }: { where: { id: string }; data: { value: string } }) {
        const row = rows.find((value) => value.id === where.id)
        if (!row) throw new Error("Missing challenge")
        row.value = data.value
        return row
      },
    },
    accountPrivacyRateBucket: {
      async findUnique({ where }: { where: { bucketDigest: string } }) {
        return (
          buckets.find((value) => value.bucketDigest === where.bucketDigest) ??
          null
        )
      },
      async upsert({
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
      }) {
        let row = buckets.find(
          (value) => value.bucketDigest === where.bucketDigest,
        )
        if (!row) {
          row = { ...create }
          buckets.push(row)
        } else {
          row.sentCount =
            typeof update.sentCount === "number"
              ? update.sentCount
              : row.sentCount + update.sentCount.increment
          if (update.windowStartedAt)
            row.windowStartedAt = update.windowStartedAt
        }
        return row
      },
    },
    user: {
      async findUnique({ where }: { where: { id?: string; phone?: string } }) {
        return where.id === user.id || where.phone === user.phone ? user : null
      },
    },
    membership: {
      async findFirst() {
        return null
      },
    },
    storeConversationAccountAccess: {
      async findFirst() {
        return null
      },
    },
    accountPrivacyRequest: {
      async findUnique() {
        return closing ? { status: "PROCESSING" } : null
      },
    },
    session: {
      async create({
        data,
      }: { data: { expiresAt: Date; token: string; userId: string } }) {
        sessions.push(data)
        return data
      },
    },
  }
  const db = {
    ...tx,
    async $transaction<T>(action: (client: typeof tx) => Promise<T>) {
      const previous = queue
      let release = () => {}
      queue = new Promise<void>((resolve) => {
        release = resolve
      })
      await previous
      const snapshot = structuredClone({ rows, buckets, sessions })
      try {
        return await action(tx)
      } catch (error) {
        rows = snapshot.rows
        buckets = snapshot.buckets
        sessions = snapshot.sessions
        throw error
      } finally {
        release()
      }
    },
  } as unknown as PrismaClient
  return {
    db,
    user,
    get rows() {
      return rows
    },
    get sessions() {
      return sessions
    },
    setClosing() {
      closing = true
    },
  }
}

async function local<T>(action: () => Promise<T>) {
  const keys = [
    "APP_ENV",
    "NODE_ENV",
    "DEV_PROFILE",
    "BETTER_AUTH_SECRET",
  ] as const
  const saved = keys.map((key) => process.env[key])
  Object.assign(process.env, {
    APP_ENV: "local",
    NODE_ENV: "test",
    DEV_PROFILE: "local",
    BETTER_AUTH_SECRET: "test-phone-auth-secret-only",
  })
  try {
    return await action()
  } finally {
    keys.forEach((key, index) => {
      if (saved[index] === undefined) delete process.env[key]
      else process.env[key] = saved[index]
    })
  }
}

describe("phone authentication security", () => {
  test("expiry cleanup preserves live phone codes and unrelated email verifications", async () => {
    const store = fixture()
    const now = new Date()
    store.rows.push(
      {
        id: "expired-phone",
        identifier: "phone-auth:login:old",
        value: "expired",
        createdAt: now,
        expiresAt: new Date(now.getTime() - 1),
      },
      {
        id: "live-phone",
        identifier: "phone-auth:login:live",
        value: "live",
        createdAt: now,
        expiresAt: new Date(now.getTime() + 60_000),
      },
      {
        id: "email",
        identifier: "mobile-auth:login:email",
        value: "email",
        createdAt: now,
        expiresAt: new Date(now.getTime() - 1),
      },
    )
    expect(await purgeExpiredPhoneOtpChallenges(store.db, now)).toEqual({
      count: 1,
    })
    expect(store.rows.map((row) => row.id)).toEqual(["live-phone", "email"])
  })
  test("fixed codes are limited to the exact local development profile", () => {
    expect(isLocalPhoneAuth({ DEV_PROFILE: "local", APP_ENV: "local" })).toBe(
      true,
    )
    expect(isLocalPhoneAuth({ DEV_PROFILE: "preview" })).toBe(false)
    expect(isLocalPhoneAuth({ DEV_PROFILE: "local", APP_ENV: "preview" })).toBe(
      false,
    )
    expect(
      isLocalPhoneAuth({ DEV_PROFILE: "local", APP_ENV: "production" }),
    ).toBe(false)
    expect(
      isLocalPhoneAuth({ DEV_PROFILE: "local", NODE_ENV: "production" }),
    ).toBe(false)
    expect(() => normalizeAuthPhone("08000000000")).toThrow("country code")
  })
  test("stores only hashed codes and enforces resend, mode and recipient boundaries", () =>
    local(async () => {
      const store = fixture()
      await createPhoneOtp(
        store.db,
        { phone: store.user.phone, mode: "login" },
        "trusted-test-source",
      )
      expect(store.rows[0]?.value).not.toContain("123456")
      expect(store.rows[0]?.identifier).not.toContain(store.user.phone)
      await expect(
        createPhoneOtp(
          store.db,
          { phone: store.user.phone, mode: "login" },
          "trusted-test-source",
        ),
      ).rejects.toThrow("Wait one minute")
      await expect(
        verifyPhoneOtp(store.db, {
          phone: store.user.phone,
          mode: "sign_up",
          code: "123456",
        }),
      ).rejects.toThrow("expired")
      await expect(
        verifyPhoneOtp(store.db, {
          phone: "+2348000000001",
          mode: "login",
          code: "123456",
        }),
      ).rejects.toThrow("expired")
      expect(store.sessions.length).toBe(0)
    }))
  test("commits incorrect attempts and blocks the correct code after five failures", () =>
    local(async () => {
      const store = fixture()
      await createPhoneOtp(
        store.db,
        { phone: store.user.phone, mode: "login" },
        "trusted-test-source",
      )
      for (let attempt = 0; attempt < 5; attempt++)
        await expect(
          verifyPhoneOtp(store.db, {
            phone: store.user.phone,
            mode: "login",
            code: "654321",
          }),
        ).rejects.toThrow("incorrect")
      expect(JSON.parse(store.rows[0]?.value ?? "{}").attempts).toBe(5)
      await expect(
        verifyPhoneOtp(store.db, {
          phone: store.user.phone,
          mode: "login",
          code: "123456",
        }),
      ).rejects.toThrow("Too many incorrect")
      expect(store.sessions.length).toBe(0)
    }))
  test("consumes a code once even with simultaneous verification", () =>
    local(async () => {
      const store = fixture()
      await createPhoneOtp(
        store.db,
        { phone: store.user.phone, mode: "login" },
        "trusted-test-source",
      )
      const results = await Promise.allSettled(
        [1, 2].map(() =>
          verifyPhoneOtp(store.db, {
            phone: store.user.phone,
            mode: "login",
            code: "123456",
          }),
        ),
      )
      expect(
        results.filter((result) => result.status === "fulfilled").length,
      ).toBe(1)
      expect(store.sessions.length).toBe(1)
      expect(store.rows.length).toBe(0)
      expect(store.user.emailVerified).toBe(false)
    }))
  test("cannot take over an unverified phone on an existing email account", () =>
    local(async () => {
      const store = fixture(false)
      await createPhoneOtp(
        store.db,
        { phone: store.user.phone, mode: "login" },
        "trusted-test-source",
      )
      await expect(
        verifyPhoneOtp(store.db, {
          phone: store.user.phone,
          mode: "login",
          code: "123456",
        }),
      ).rejects.toThrow("existing sign-in")
      expect(store.sessions.length).toBe(0)
      expect(store.user.phoneVerifiedAt).toBeNull()
    }))
  test("keeps account-deletion access restrictions and expires codes", () =>
    local(async () => {
      const store = fixture()
      await createPhoneOtp(
        store.db,
        { phone: store.user.phone, mode: "login" },
        "trusted-test-source",
      )
      store.setClosing()
      await expect(
        verifyPhoneOtp(store.db, {
          phone: store.user.phone,
          mode: "login",
          code: "123456",
        }),
      ).rejects.toThrow("being closed")
      expect(store.rows.length).toBe(1)
      await expect(
        verifyPhoneOtp(
          store.db,
          { phone: store.user.phone, mode: "login", code: "123456" },
          new Date(Date.now() + 6 * 60_000),
        ),
      ).rejects.toThrow("expired")
      expect(store.sessions.length).toBe(0)
    }))
  test("rejects underage signup and missing trusted network before persistence", () =>
    local(async () => {
      const store = fixture()
      await expect(
        createPhoneOtp(
          store.db,
          { phone: store.user.phone, mode: "sign_up", ageBand: "UNDECLARED" },
          "trusted-test-source",
        ),
      ).rejects.toThrow("eligible age")
      await expect(
        createPhoneOtp(
          store.db,
          { phone: store.user.phone, mode: "login" },
          "",
        ),
      ).rejects.toThrow("unavailable")
      expect(store.rows.length).toBe(0)
    }))
})
