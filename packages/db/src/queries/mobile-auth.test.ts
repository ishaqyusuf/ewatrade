import { describe, expect, test } from "bun:test"
import {
  createMobileOwnerOtp,
  verifyMobileGoogleIdentity,
  verifyMobileOwnerOtp,
} from "./mobile-auth"
import type { DbClient } from "./types"

type VerificationRow = {
  createdAt: Date
  expiresAt: Date
  identifier: string
  value: string
}

type UserRow = {
  avatarUrl?: string | null
  displayName?: string | null
  email: string
  emailVerified?: boolean
  emailVerifiedAt?: Date | null
  id: string
  image?: string | null
  name: string
}

type AccountRow = {
  accountId: string
  idToken?: string | null
  provider: string
  providerAccountId: string
  providerId: string
  userId: string
}

type StoreRow = {
  id: string
  name: string
  slug?: string
  status: string
  tenantId?: string
}

type TenantRow = {
  createdAt: Date
  id: string
  isActive: boolean
  metadata?: unknown
  name: string
  slug: string
  stores: StoreRow[]
  updatedAt: Date
}

type MembershipRow = {
  role: string
  status: string
  tenant: {
    id: string
    name: string
    slug: string
    stores: StoreRow[]
  }
  userId: string
}

function createMockMobileAuthDb(input?: {
  accounts?: AccountRow[]
  memberships?: MembershipRow[]
  stores?: StoreRow[]
  tenants?: TenantRow[]
  users?: UserRow[]
}) {
  const accounts = [...(input?.accounts ?? [])]
  const stores = [...(input?.stores ?? [])]
  const tenants = [...(input?.tenants ?? [])]
  const verifications: VerificationRow[] = []
  const users = [...(input?.users ?? [])]
  const memberships = [...(input?.memberships ?? [])]
  const sessions: Array<{ expiresAt: Date; token: string; userId: string }> = []

  const db = {
    account: {
      findUnique: async ({
        where,
      }: {
        where: {
          provider_providerAccountId: {
            provider: string
            providerAccountId: string
          }
        }
      }) => {
        const lookup = where.provider_providerAccountId

        return (
          accounts.find(
            (account) =>
              account.provider === lookup.provider &&
              account.providerAccountId === lookup.providerAccountId,
          ) ?? null
        )
      },
      upsert: async ({
        create,
        update,
        where,
      }: {
        create: AccountRow
        update: Partial<AccountRow>
        where: {
          provider_providerAccountId: {
            provider: string
            providerAccountId: string
          }
        }
      }) => {
        const lookup = where.provider_providerAccountId
        const existing = accounts.find(
          (account) =>
            account.provider === lookup.provider &&
            account.providerAccountId === lookup.providerAccountId,
        )

        if (existing) {
          Object.assign(existing, update)
          return existing
        }

        accounts.push(create)
        return create
      },
    },
    membership: {
      count: async () => 0,
      create: async ({
        data,
      }: {
        data: { role: string; status: string; tenantId: string; userId: string }
      }) => {
        const tenant = tenants.find(
          (currentTenant) => currentTenant.id === data.tenantId,
        )
        if (!tenant) throw new Error("Tenant not found")

        memberships.push({
          role: data.role,
          status: data.status,
          tenant,
          userId: data.userId,
        })
      },
      findFirst: async ({ where }: { where: { userId: string } }) =>
        memberships.find((membership) => membership.userId === where.userId) ??
        null,
    },
    offlineDevice: {
      findMany: async () => [],
    },
    offlineDeviceRevocation: {
      findMany: async () => [],
    },
    onboardingSession: {
      create: async () => null,
    },
    product: {
      count: async () => 0,
    },
    session: {
      create: async ({
        data,
      }: {
        data: { expiresAt: Date; token: string; userId: string }
      }) => {
        sessions.push(data)

        return {
          expiresAt: data.expiresAt,
          token: data.token,
        }
      },
    },
    store: {
      count: async ({ where }: { where: { tenantId: string } }) =>
        stores.filter((store) => store.tenantId === where.tenantId).length,
      create: async ({
        data,
      }: {
        data: { name: string; slug: string; status: string; tenantId: string }
      }) => {
        const store = {
          id: `store_${stores.length + 1}`,
          name: data.name,
          slug: data.slug,
          status: data.status,
          tenantId: data.tenantId,
        }
        stores.push(store)
        const tenant = tenants.find(
          (currentTenant) => currentTenant.id === data.tenantId,
        )
        tenant?.stores.push(store)

        return {
          id: store.id,
          name: store.name,
          slug: store.slug,
          status: store.status,
        }
      },
      findUnique: async ({
        where,
      }: {
        where: { tenantId_slug: { slug: string; tenantId: string } }
      }) =>
        stores.find(
          (store) =>
            store.tenantId === where.tenantId_slug.tenantId &&
            store.slug === where.tenantId_slug.slug,
        ) ?? null,
    },
    subscriptionPlan: {
      findMany: async () => [],
    },
    tenant: {
      create: async ({
        data,
      }: {
        data: { name: string; slug: string }
      }) => {
        const now = new Date()
        const tenant = {
          createdAt: now,
          id: `tenant_${tenants.length + 1}`,
          isActive: true,
          metadata: null,
          name: data.name,
          slug: data.slug,
          stores: [],
          updatedAt: now,
        }
        tenants.push(tenant)

        return {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
        }
      },
      findFirstOrThrow: async ({ where }: { where: { id: string } }) => {
        const tenant = tenants.find(
          (currentTenant) => currentTenant.id === where.id,
        )
        if (!tenant) throw new Error("Tenant not found")

        return tenant
      },
      findUnique: async ({ where }: { where: { slug: string } }) =>
        tenants.find((tenant) => tenant.slug === where.slug) ?? null,
    },
    tenantSubscription: {
      findUnique: async () => null,
    },
    user: {
      findUnique: async ({ where }: { where: { email: string } }) =>
        users.find((user) => user.email === where.email) ?? null,
      create: async ({
        data,
      }: {
        data: Omit<UserRow, "id"> & { id?: string }
      }) => {
        const user = {
          ...data,
          id: data.id ?? `user_${users.length + 1}`,
        }
        users.push(user)

        return {
          email: user.email,
          id: user.id,
          name: user.name,
        }
      },
      update: async ({
        data,
        where,
      }: {
        data: Partial<UserRow>
        where: { id: string }
      }) => {
        const user = users.find((currentUser) => currentUser.id === where.id)
        if (!user) throw new Error("User not found")

        Object.assign(user, data)

        return {
          email: user.email,
          id: user.id,
          name: user.name,
        }
      },
      upsert: async ({
        create,
        update,
        where,
      }: {
        create: UserRow
        update: Partial<UserRow>
        where: { email: string }
      }) => {
        const existing = users.find((user) => user.email === where.email)

        if (existing) {
          Object.assign(existing, update)

          return {
            email: existing.email,
            id: existing.id,
            name: existing.name,
          }
        }

        const nextUser = {
          ...create,
          id: create.id ?? `user_${users.length + 1}`,
        }
        users.push(nextUser)

        return {
          email: nextUser.email,
          id: nextUser.id,
          name: nextUser.name,
        }
      },
    },
    verification: {
      create: async ({ data }: { data: VerificationRow }) => {
        verifications.push({
          createdAt: data.createdAt ?? new Date(),
          expiresAt: data.expiresAt,
          identifier: data.identifier,
          value: data.value,
        })
      },
      deleteMany: async ({ where }: { where: { identifier: string } }) => {
        const remaining = verifications.filter(
          (verification) => verification.identifier !== where.identifier,
        )
        verifications.splice(0, verifications.length, ...remaining)
      },
      findFirst: async ({
        where,
      }: {
        where: { expiresAt: { gt: Date }; identifier: string }
      }) => {
        return (
          verifications
            .filter(
              (verification) =>
                verification.identifier === where.identifier &&
                verification.expiresAt > where.expiresAt.gt,
            )
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ??
          null
        )
      },
    },
  }

  return {
    accounts,
    client: db as unknown as DbClient,
    memberships,
    sessions,
    stores,
    tenants,
    users,
    verifications,
  }
}

describe("mobile auth queries", () => {
  test("creates a normalized OTP verification without storing the raw code", async () => {
    const db = createMockMobileAuthDb()

    const otp = await createMobileOwnerOtp(db.client, {
      businessName: "  Main Market Store  ",
      email: " OWNER@Example.COM ",
      mode: "sign_up",
      name: "  Store Owner  ",
    })

    expect(otp.email).toBe("owner@example.com")
    expect(otp.code).toMatch(/^\d{6}$/)
    expect(db.verifications).toHaveLength(1)
    expect(db.verifications[0]?.identifier).toBe(
      "mobile-owner-auth:sign_up:owner@example.com",
    )
    expect(db.verifications[0]?.value).not.toContain(otp.code)

    const payload = JSON.parse(db.verifications[0]?.value ?? "{}")
    expect(payload).toMatchObject({
      businessName: "Main Market Store",
      mode: "sign_up",
      name: "Store Owner",
    })
    expect(typeof payload.codeHash).toBe("string")
    expect(payload.codeHash).not.toBe(otp.code)
  })

  test("creates a normalized OTP verification with an explicit development code", async () => {
    const db = createMockMobileAuthDb()

    const otp = await createMobileOwnerOtp(db.client, {
      code: "123456",
      email: " OWNER@Example.COM ",
      mode: "sign_up",
    })

    expect(otp.email).toBe("owner@example.com")
    expect(otp.code).toBe("123456")
    expect(db.verifications).toHaveLength(1)
    expect(db.verifications[0]?.value).not.toContain("123456")

    await expect(
      verifyMobileOwnerOtp(db.client, {
        businessName: "Main Market Store",
        code: "123456",
        email: "owner@example.com",
        mode: "sign_up",
        name: "Store Owner",
      }),
    ).resolves.toMatchObject({
      profile: {
        businessName: "Main Market Store",
        email: "owner@example.com",
      },
    })
  })

  test("does not create a login OTP when no account exists for the email", async () => {
    const db = createMockMobileAuthDb()

    await expect(
      createMobileOwnerOtp(db.client, {
        email: "missing-owner@example.com",
        mode: "login",
      }),
    ).rejects.toThrow("No owner account exists for this email yet.")

    expect(db.verifications).toHaveLength(0)
  })

  test("creates a login OTP only after the account has business access", async () => {
    const user = {
      email: "owner@example.com",
      id: "user_owner",
      name: "Owner Name",
    }
    const db = createMockMobileAuthDb({
      memberships: [
        {
          role: "OWNER",
          status: "ACTIVE",
          tenant: {
            id: "tenant_123",
            name: "Main Market Store",
            slug: "main-market-store",
            stores: [
              {
                id: "store_123",
                name: "Main Market Store",
                status: "ACTIVE",
              },
            ],
          },
          userId: user.id,
        },
      ],
      users: [user],
    })

    const otp = await createMobileOwnerOtp(db.client, {
      email: "OWNER@example.com",
      mode: "login",
    })

    expect(otp.email).toBe("owner@example.com")
    expect(otp.code).toMatch(/^\d{6}$/)
    expect(db.verifications).toHaveLength(1)
    expect(db.verifications[0]?.identifier).toBe(
      "mobile-owner-auth:login:owner@example.com",
    )
  })

  test("does not create a login OTP when the account has no active business", async () => {
    const db = createMockMobileAuthDb({
      users: [
        {
          email: "owner@example.com",
          id: "user_owner",
          name: "Owner Name",
        },
      ],
    })

    await expect(
      createMobileOwnerOtp(db.client, {
        email: "owner@example.com",
        mode: "login",
      }),
    ).rejects.toThrow("No active business is available for this account.")

    expect(db.verifications).toHaveLength(0)
  })

  test("rejects an incorrect OTP without consuming the pending verification", async () => {
    const user = {
      email: "owner@example.com",
      id: "user_owner",
      name: "Owner Name",
    }
    const db = createMockMobileAuthDb({
      memberships: [
        {
          role: "OWNER",
          status: "ACTIVE",
          tenant: {
            id: "tenant_123",
            name: "Main Market Store",
            slug: "main-market-store",
            stores: [
              {
                id: "store_123",
                name: "Main Market Store",
                status: "ACTIVE",
              },
            ],
          },
          userId: user.id,
        },
      ],
      users: [user],
    })
    const otp = await createMobileOwnerOtp(db.client, {
      email: "owner@example.com",
      mode: "login",
    })
    const wrongCode = otp.code === "000000" ? "111111" : "000000"

    await expect(
      verifyMobileOwnerOtp(db.client, {
        code: wrongCode,
        email: "owner@example.com",
        mode: "login",
      }),
    ).rejects.toThrow("The verification code is incorrect.")

    expect(db.verifications).toHaveLength(1)
    expect(db.sessions).toHaveLength(0)
  })

  test("verifies a returning owner OTP into the active business session context", async () => {
    const user = {
      email: "owner@example.com",
      id: "user_owner",
      name: "Owner Name",
    }
    const db = createMockMobileAuthDb({
      memberships: [
        {
          role: "OWNER",
          status: "ACTIVE",
          tenant: {
            id: "tenant_123",
            name: "Main Market Store",
            slug: "main-market-store",
            stores: [
              {
                id: "store_123",
                name: "Main Market Store",
                status: "ACTIVE",
              },
            ],
          },
          userId: user.id,
        },
      ],
      users: [user],
    })
    const otp = await createMobileOwnerOtp(db.client, {
      email: "OWNER@example.com",
      mode: "login",
    })

    const session = await verifyMobileOwnerOtp(db.client, {
      code: otp.code,
      email: " owner@example.com ",
      mode: "login",
    })

    expect(db.verifications).toHaveLength(0)
    expect(db.sessions).toHaveLength(1)
    expect(session.token).toMatch(/^[a-f0-9]{64}$/)
    expect(session.profile).toMatchObject({
      businessId: "tenant_123",
      businessName: "Main Market Store",
      email: "owner@example.com",
      id: "user_owner",
      role: "OWNER",
      status: "ACTIVE",
    })
    expect(session.tenant).toMatchObject({
      id: "tenant_123",
      name: "Main Market Store",
      storeId: "store_123",
      storeName: "Main Market Store",
    })
  })

  test("verifies new owner OTP signup by creating the first business and store", async () => {
    const db = createMockMobileAuthDb()
    const otp = await createMobileOwnerOtp(db.client, {
      businessName: " Main Market Store ",
      email: "new-owner@example.com",
      mode: "sign_up",
      name: " New Owner ",
    })

    const session = await verifyMobileOwnerOtp(db.client, {
      code: otp.code,
      email: "new-owner@example.com",
      mode: "sign_up",
    })

    expect(db.tenants).toEqual([
      expect.objectContaining({
        id: "tenant_1",
        name: "Main Market Store",
        slug: "main-market-store",
      }),
    ])
    expect(db.memberships).toEqual([
      expect.objectContaining({
        role: "OWNER",
        status: "ACTIVE",
        userId: "user_1",
      }),
    ])
    expect(db.stores).toEqual([
      expect.objectContaining({
        id: "store_1",
        name: "Main Market Store",
        slug: "main-market-store",
        status: "ACTIVE",
        tenantId: "tenant_1",
      }),
    ])
    expect(session.profile).toMatchObject({
      businessId: "tenant_1",
      businessName: "Main Market Store",
      email: "new-owner@example.com",
      id: "user_1",
      name: "New Owner",
      role: "OWNER",
      status: "ACTIVE",
    })
    expect(session.tenant).toMatchObject({
      id: "tenant_1",
      name: "Main Market Store",
      storeId: "store_1",
      storeName: "Main Market Store",
    })
  })

  test("rejects Google login when no linked or email-matching owner exists", async () => {
    const db = createMockMobileAuthDb()

    await expect(
      verifyMobileGoogleIdentity(db.client, {
        email: "new-owner@example.com",
        mode: "login",
        name: "New Owner",
        providerAccountId: "google-new-owner",
      }),
    ).rejects.toThrow("No owner account exists for this Google account yet.")

    expect(db.accounts).toHaveLength(0)
    expect(db.sessions).toHaveLength(0)
  })

  test("links an existing owner email to Google and returns the active business session context", async () => {
    const user = {
      email: "owner@example.com",
      id: "user_owner",
      name: "Existing Owner",
    }
    const db = createMockMobileAuthDb({
      memberships: [
        {
          role: "OWNER",
          status: "ACTIVE",
          tenant: {
            id: "tenant_123",
            name: "Main Market Store",
            slug: "main-market-store",
            stores: [
              {
                id: "store_123",
                name: "Main Market Store",
                status: "ACTIVE",
              },
            ],
          },
          userId: user.id,
        },
      ],
      users: [user],
    })

    const session = await verifyMobileGoogleIdentity(db.client, {
      email: " OWNER@example.com ",
      idToken: "google-id-token",
      image: "https://example.com/avatar.png",
      mode: "login",
      name: " Google Owner ",
      providerAccountId: " google-owner ",
    })

    expect(db.accounts).toEqual([
      expect.objectContaining({
        accountId: "google-owner",
        idToken: "google-id-token",
        provider: "google",
        providerAccountId: "google-owner",
        providerId: "google",
        userId: "user_owner",
      }),
    ])
    expect(db.users[0]).toMatchObject({
      avatarUrl: "https://example.com/avatar.png",
      displayName: "Google Owner",
      emailVerified: true,
      image: "https://example.com/avatar.png",
      name: "Google Owner",
    })
    expect(db.sessions).toHaveLength(1)
    expect(session.profile).toMatchObject({
      businessId: "tenant_123",
      businessName: "Main Market Store",
      email: "owner@example.com",
      id: "user_owner",
      name: "Google Owner",
      role: "OWNER",
      status: "ACTIVE",
    })
    expect(session.tenant).toMatchObject({
      id: "tenant_123",
      name: "Main Market Store",
      storeId: "store_123",
      storeName: "Main Market Store",
    })
  })

  test("creates a new Google owner signup with first business and linked provider account", async () => {
    const db = createMockMobileAuthDb()

    const session = await verifyMobileGoogleIdentity(db.client, {
      businessName: " Main Market Store ",
      email: "new-google-owner@example.com",
      idToken: "new-google-id-token",
      mode: "sign_up",
      name: " New Google Owner ",
      providerAccountId: " new-google-owner ",
    })

    expect(db.accounts).toEqual([
      expect.objectContaining({
        accountId: "new-google-owner",
        idToken: "new-google-id-token",
        provider: "google",
        providerAccountId: "new-google-owner",
        providerId: "google",
        userId: "user_1",
      }),
    ])
    expect(db.tenants).toEqual([
      expect.objectContaining({
        id: "tenant_1",
        name: "Main Market Store",
        slug: "main-market-store",
      }),
    ])
    expect(db.stores).toEqual([
      expect.objectContaining({
        id: "store_1",
        name: "Main Market Store",
        slug: "main-market-store",
        status: "ACTIVE",
        tenantId: "tenant_1",
      }),
    ])
    expect(session.profile).toMatchObject({
      businessId: "tenant_1",
      businessName: "Main Market Store",
      email: "new-google-owner@example.com",
      id: "user_1",
      name: "New Google Owner",
      role: "OWNER",
      status: "ACTIVE",
    })
    expect(session.tenant).toMatchObject({
      id: "tenant_1",
      name: "Main Market Store",
      storeId: "store_1",
      storeName: "Main Market Store",
    })
  })
})
