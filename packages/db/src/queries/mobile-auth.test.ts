import { describe, expect, test } from "bun:test"
import { verifyMobileAppleIdentity } from "./mobile-apple-auth"
import {
  MobileAccountNotFoundError,
  createMobileOwnerOtp,
  createMobileSessionForVerifiedUser,
  getMobileAccessProfile,
  shouldUseFixedMobileOwnerOtp,
  verifyMobileGoogleIdentity,
  verifyMobileOwnerOtp,
  verifyMobileSocialIdentity,
} from "./mobile-auth"
import { createOwnerBusiness } from "./owner-businesses"
import type { DbClient } from "./types"

type VerificationRow = {
  createdAt: Date
  expiresAt: Date
  identifier: string
  value: string
}

type UserRow = {
  ageBand?: string
  ageDeclaredAt?: Date | null
  avatarUrl?: string | null
  displayName?: string | null
  email: string
  emailVerified?: boolean
  emailVerifiedAt?: Date | null
  id: string
  image?: string | null
  name: string
  phone?: string | null
}

type AccountRow = {
  accountId: string
  idToken?: string | null
  provider: string
  providerAccountId: string
  providerId: string
  refreshToken?: string | null
  scope?: string | null
  userId: string
}

type StoreRow = {
  currencyCode?: string
  id: string
  metadata?: unknown
  name: string
  slug?: string
  status: string
  supportPhone?: string | null
  tenantId?: string
}

type TenantRow = {
  currencyCode?: string
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
    currencyCode?: string
    id: string
    name: string
    slug: string
    stores: StoreRow[]
  }
  userId: string
}

type StoreConversationAccountAccessRow = {
  accountUserId: string
  status: string
}

function createMockMobileAuthDb(input?: {
  privacyStatus?: string
  accounts?: AccountRow[]
  accountAccesses?: StoreConversationAccountAccessRow[]
  memberships?: MembershipRow[]
  stores?: StoreRow[]
  tenants?: TenantRow[]
  users?: UserRow[]
}) {
  const accounts = [...(input?.accounts ?? [])]
  const accountAccesses = [...(input?.accountAccesses ?? [])]
  const stores = [...(input?.stores ?? [])]
  const tenants = [...(input?.tenants ?? [])]
  const verifications: VerificationRow[] = []
  const users = [...(input?.users ?? [])]
  const memberships = [...(input?.memberships ?? [])]
  const sessions: Array<{ expiresAt: Date; token: string; userId: string }> = []

  const db = {
    accountPrivacyRequest: {
      findUnique: async () =>
        input?.privacyStatus ? { status: input.privacyStatus } : null,
    },
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

        const account = accounts.find(
          (account) =>
            account.provider === lookup.provider &&
            account.providerAccountId === lookup.providerAccountId,
        )
        return account
          ? {
              ...account,
              user: {
                email: users.find((user) => user.id === account.userId)?.email,
              },
            }
          : null
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
      update: async ({
        data,
        where,
      }: {
        data: Partial<AccountRow>
        where: {
          provider_providerAccountId: {
            provider: string
            providerAccountId: string
          }
        }
      }) => {
        const lookup = where.provider_providerAccountId
        const account = accounts.find(
          (item) =>
            item.provider === lookup.provider &&
            item.providerAccountId === lookup.providerAccountId,
        )
        if (!account) throw new Error("Account missing")
        Object.assign(account, data)
        return account
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
      findFirst: async ({
        where,
      }: {
        where: {
          OR?: Array<{ status: string }>
          status?: string
          userId: string
        }
      }) =>
        memberships.find(
          (membership) =>
            membership.userId === where.userId &&
            (where.status === undefined || membership.status === where.status),
        ) ?? null,
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
    catalogItem: {
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
    storeConversationAccountAccess: {
      findFirst: async ({ where }: { where: { accountUserId: string } }) =>
        accountAccesses.find(
          (access) =>
            access.accountUserId === where.accountUserId &&
            access.status === "ACTIVE",
        ) ?? null,
    },
    store: {
      count: async ({ where }: { where: { tenantId: string } }) =>
        stores.filter((store) => store.tenantId === where.tenantId).length,
      create: async ({
        data,
      }: {
        data: {
          currencyCode?: string
          metadata?: unknown
          name: string
          slug: string
          status: string
          supportPhone?: string | null
          tenantId: string
        }
      }) => {
        const store = {
          currencyCode: data.currencyCode,
          id: `store_${stores.length + 1}`,
          metadata: data.metadata,
          name: data.name,
          slug: data.slug,
          status: data.status,
          supportPhone: data.supportPhone,
          tenantId: data.tenantId,
        }
        stores.push(store)
        const tenant = tenants.find(
          (currentTenant) => currentTenant.id === data.tenantId,
        )
        tenant?.stores.push(store)

        return {
          currencyCode: store.currencyCode,
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
        data: { currencyCode?: string; name: string; slug: string }
      }) => {
        const now = new Date()
        const tenant = {
          currencyCode: data.currencyCode,
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
          currencyCode: tenant.currencyCode,
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
      findUnique: async ({
        where,
      }: {
        where: { email?: string; id?: string }
      }) =>
        users.find(
          (user) =>
            (where.email !== undefined && user.email === where.email) ||
            (where.id !== undefined && user.id === where.id),
        ) ?? null,
      create: async ({
        data,
      }: {
        data: Omit<UserRow, "id"> & { id?: string }
      }) => {
        const user = {
          ageBand: "UNDECLARED",
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

        Object.assign(
          user,
          Object.fromEntries(
            Object.entries(data).filter(([, value]) => value !== undefined),
          ),
        )

        return {
          email: user.email,
          id: user.id,
          name: user.name,
        }
      },
      updateMany: async ({
        data,
        where,
      }: {
        data: Partial<UserRow>
        where: { id: string; ageBand: string }
      }) => {
        const user = users.find(
          (current) =>
            current.id === where.id && current.ageBand === where.ageBand,
        )
        if (!user) return { count: 0 }
        Object.assign(user, data)
        return { count: 1 }
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
          ageBand: "UNDECLARED",
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
    accountAccesses,
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
  test("does not issue a new bearer for an account being closed", async () => {
    const db = createMockMobileAuthDb({
      privacyStatus: "PROCESSING",
      users: [
        {
          email: "closing@example.com",
          emailVerified: true,
          id: "user-closing",
          name: "Closing User",
        },
      ],
    })
    await expect(
      createMobileSessionForVerifiedUser(db.client, "user-closing"),
    ).rejects.toThrow("being closed")
    expect(db.sessions).toHaveLength(0)
  })

  test("uses the fixed OTP only outside production runtimes", () => {
    expect(shouldUseFixedMobileOwnerOtp({})).toBe(true)
    expect(
      shouldUseFixedMobileOwnerOtp({
        APP_ENV: "development",
        NODE_ENV: "development",
      }),
    ).toBe(true)
    expect(
      shouldUseFixedMobileOwnerOtp({
        APP_ENV: "production",
        NODE_ENV: "development",
      }),
    ).toBe(false)
    expect(
      shouldUseFixedMobileOwnerOtp({
        APP_ENV: "development",
        NODE_ENV: "production",
      }),
    ).toBe(false)
  })

  test("resolves customer history only from active explicit account links", async () => {
    const db = createMockMobileAuthDb({
      accountAccesses: [
        { accountUserId: "user_customer", status: "ACTIVE" },
        { accountUserId: "user_revoked", status: "REVOKED" },
      ],
    })

    await expect(
      getMobileAccessProfile(db.client, { userId: "user_customer" }),
    ).resolves.toMatchObject({
      hasBusinessAccess: false,
      hasCustomerHistory: true,
    })

    await expect(
      getMobileAccessProfile(db.client, { userId: "user_revoked" }),
    ).resolves.toMatchObject({
      hasBusinessAccess: false,
      hasCustomerHistory: false,
    })
  })

  test("does not treat an invited Business membership as active access", async () => {
    const db = createMockMobileAuthDb({
      memberships: [
        {
          role: "OPERATOR",
          status: "INVITED",
          tenant: {
            id: "tenant_invited",
            name: "Future Market",
            slug: "future-market",
            stores: [],
          },
          userId: "user_invited",
        },
      ],
    })

    await expect(
      getMobileAccessProfile(db.client, { userId: "user_invited" }),
    ).resolves.toEqual({
      hasBusinessAccess: false,
      hasCustomerHistory: false,
    })
  })

  test("creates another isolated owner business for an existing account", async () => {
    const existingTenant: TenantRow = {
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      currencyCode: "NGN",
      id: "tenant_existing",
      isActive: true,
      name: "Existing Business",
      slug: "existing-business",
      stores: [],
      updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    }
    const db = createMockMobileAuthDb({
      memberships: [
        {
          role: "OWNER",
          status: "ACTIVE",
          tenant: existingTenant,
          userId: "user_owner",
        },
      ],
      tenants: [existingTenant],
      users: [
        {
          ageBand: "ADULT",
          email: "owner@example.com",
          id: "user_owner",
          name: "Owner Name",
        },
      ],
    })

    const business = await createOwnerBusiness(db.client, {
      addressLine1: "12 Market Road",
      businessName: "Second Business",
      businessProfileKey: "general-retail-groceries",
      businessProfileVersion: 1,
      city: "Lagos",
      currencyCode: "NGN",
      operatingModel: "products",
      orderChannels: ["walk_in"],
      phone: "08012345678",
      teamSize: "2_5",
      userId: "user_owner",
    })

    expect(db.tenants).toHaveLength(2)
    expect(db.memberships).toHaveLength(2)
    expect(db.stores).toEqual([
      expect.objectContaining({
        metadata: {
          retailOps: {
            onboarding: expect.objectContaining({
              businessProfileKey: "general-retail-groceries",
              source: "mobile_owner_business_create",
            }),
          },
        },
        name: "Main store",
        tenantId: "tenant_2",
      }),
    ])
    expect(business).toMatchObject({
      currencyCode: "NGN",
      id: "tenant_2",
      name: "Second Business",
      role: "OWNER",
      slug: "second-business",
      status: "ACTIVE",
      storeId: "store_1",
    })
  })

  test.each(["AGE_13_TO_15", "AGE_16_TO_17"])(
    "allows a declared %s account to create a business",
    async (ageBand) => {
      const db = createMockMobileAuthDb({
        users: [
          {
            ageBand,
            email: "teen-owner@example.com",
            id: "user_teen",
            name: "Teen Owner",
          },
        ],
      })

      const business = await createOwnerBusiness(db.client, {
        businessName: "Teen Store",
        currencyCode: "NGN",
        userId: "user_teen",
      })

      expect(business.role).toBe("OWNER")
      expect(db.tenants).toHaveLength(1)
      expect(db.stores).toHaveLength(1)
    },
  )

  test("QA owners create suffixed business names without claiming ordinary slugs", async () => {
    const previousRoutes = process.env.EMAIL_QA_DOMAIN_ROUTES
    process.env.EMAIL_QA_DOMAIN_ROUTES =
      '{"ishaq.qa.test":"tester@example.com"}'
    try {
      const db = createMockMobileAuthDb({
        users: [
          {
            ageBand: "ADULT",
            email: "owner@ishaq.qa.test",
            id: "qa_owner",
            name: "QA Owner",
          },
        ],
      })
      const business = await createOwnerBusiness(db.client, {
        businessName: "Hello",
        currencyCode: "NGN",
        userId: "qa_owner",
      })
      expect(business.slug).toBe("hello-qa")
      expect(db.tenants.map((tenant) => tenant.slug)).not.toContain("hello")
    } finally {
      if (previousRoutes === undefined)
        Reflect.deleteProperty(process.env, "EMAIL_QA_DOMAIN_ROUTES")
      else process.env.EMAIL_QA_DOMAIN_ROUTES = previousRoutes
    }
  })

  test("does not create a business for an undeclared account", async () => {
    const db = createMockMobileAuthDb({
      users: [
        {
          ageBand: "UNDECLARED",
          email: "unknown-age@example.com",
          id: "user_unknown",
          name: "Unknown Age",
        },
      ],
    })

    await expect(
      createOwnerBusiness(db.client, {
        businessName: "Unverified Store",
        currencyCode: "NGN",
        userId: "user_unknown",
      }),
    ).rejects.toThrow("Choose an eligible age range")
    expect(db.tenants).toHaveLength(0)
    expect(db.memberships).toHaveLength(0)
    expect(db.stores).toHaveLength(0)
  })

  test("creates a normalized OTP verification without storing the raw code", async () => {
    const db = createMockMobileAuthDb()

    const otp = await createMobileOwnerOtp(db.client, {
      businessName: "  Main Market Store  ",
      email: " OWNER@Example.COM ",
      ageBand: "AGE_13_TO_15",
      mode: "sign_up",
      name: "  Store Owner  ",
    })

    expect(otp.email).toBe("owner@example.com")
    expect(otp.code).toBe("123456")
    expect(db.verifications).toHaveLength(1)
    expect(db.verifications[0]?.identifier).toBe(
      "mobile-auth:sign_up:owner@example.com",
    )
    expect(db.verifications[0]?.value).not.toContain(otp.code)

    const payload = JSON.parse(db.verifications[0]?.value ?? "{}")
    expect(payload).toMatchObject({
      businessName: "Main Market Store",
      ageBand: "AGE_13_TO_15",
      mode: "sign_up",
      name: "Store Owner",
    })
    expect(typeof payload.codeHash).toBe("string")
    expect(payload.codeHash).not.toBe(otp.code)
  })

  test("does not issue a signup OTP without a 13+ declaration", async () => {
    const db = createMockMobileAuthDb()
    await expect(
      createMobileOwnerOtp(db.client, {
        email: "new-owner@example.com",
        mode: "sign_up",
      }),
    ).rejects.toThrow("Choose an eligible age range")
    expect(db.verifications).toHaveLength(0)
  })

  test("draft signup cannot persist a claimed legal acceptance", async () => {
    const db = createMockMobileAuthDb()
    await expect(
      createMobileOwnerOtp(db.client, {
        email: "owner@example.com",
        ageBand: "AGE_13_TO_15",
        mode: "sign_up",
        legalVersion: "2026-10-01",
        acceptedTerms: true,
        acknowledgedPrivacyNotice: true,
      }),
    ).rejects.toThrow("Draft legal documents")
    expect(db.verifications).toHaveLength(0)
  })

  test("creates a common login OTP before account access is known", async () => {
    const db = createMockMobileAuthDb()

    const otp = await createMobileOwnerOtp(db.client, {
      email: "missing-owner@example.com",
      mode: "login",
    })

    expect(otp.email).toBe("missing-owner@example.com")
    expect(db.verifications).toHaveLength(1)
    await expect(
      verifyMobileOwnerOtp(db.client, {
        code: otp.code,
        email: "missing-owner@example.com",
        mode: "login",
      }),
    ).rejects.toBeInstanceOf(MobileAccountNotFoundError)
    expect(db.users).toHaveLength(0)
    expect(db.sessions).toHaveLength(0)
  })

  test("production OTP and social login keep an existing account usable without draft signup", async () => {
    const previousAppEnv = process.env.APP_ENV
    process.env.APP_ENV = "production"
    try {
      const db = createMockMobileAuthDb({
        users: [
          {
            email: "reviewer@example.test",
            id: "user_reviewer",
            name: "Review Owner",
          },
        ],
      })
      const otp = await createMobileOwnerOtp(db.client, {
        email: "reviewer@example.test",
        mode: "login",
      })
      const otpSession = await verifyMobileOwnerOtp(db.client, {
        code: otp.code,
        email: "reviewer@example.test",
        mode: "login",
      })
      expect(otpSession.profile.id).toBe("user_reviewer")
      const socialSession = await verifyMobileSocialIdentity(db.client, {
        email: "reviewer@example.test",
        mode: "login",
        provider: "google",
        providerAccountId: "google-reviewer",
      })
      expect(socialSession.profile.id).toBe("user_reviewer")
      expect(db.users).toHaveLength(1)
      expect(db.users[0]?.name).toBe("Review Owner")
    } finally {
      process.env.APP_ENV = previousAppEnv ?? ""
    }
  })

  test("returning Apple login resolves its linked account when Apple omits email", async () => {
    const db = createMockMobileAuthDb({
      users: [
        {
          email: "relay@privaterelay.appleid.com",
          id: "user-apple",
          name: "Apple Owner",
        },
      ],
      accounts: [
        {
          accountId: "apple-subject",
          provider: "apple",
          providerAccountId: "apple-subject",
          providerId: "apple",
          userId: "user-apple",
        },
      ],
    })
    const session = await verifyMobileAppleIdentity(db.client, {
      mode: "login",
      providerAccountId: "apple-subject",
      encryptedRefreshToken: "encrypted-refresh-token",
      clientId: "com.ewatrade.app",
    })
    expect(session.profile.id).toBe("user-apple")
    expect(db.users).toHaveLength(1)
    expect(db.accounts[0]).toMatchObject({
      refreshToken: "encrypted-refresh-token",
      scope: "com.ewatrade.app",
    })
  })

  test("returning social login keeps the linked user's profile when provider email belongs to another user", async () => {
    const db = createMockMobileAuthDb({
      users: [
        {
          email: "original@example.test",
          emailVerified: false,
          id: "user-linked",
          name: "Original Owner",
        },
        {
          email: "changed@example.test",
          id: "user-other",
          name: "Other Owner",
        },
      ],
      accounts: [
        {
          accountId: "google-subject",
          provider: "google",
          providerAccountId: "google-subject",
          providerId: "google",
          userId: "user-linked",
        },
      ],
    })
    const session = await verifyMobileGoogleIdentity(db.client, {
      mode: "login",
      email: "changed@example.test",
      name: "Changed Provider Name",
      providerAccountId: "google-subject",
    })

    expect(session.profile).toMatchObject({
      email: "original@example.test",
      id: "user-linked",
      name: "Original Owner",
    })
    expect(db.users).toEqual([
      expect.objectContaining({
        email: "original@example.test",
        emailVerified: false,
        id: "user-linked",
        name: "Original Owner",
      }),
      expect.objectContaining({
        email: "changed@example.test",
        id: "user-other",
        name: "Other Owner",
      }),
    ])
    expect(db.accounts[0]?.userId).toBe("user-linked")
  })

  test("first Apple link uses verified email to reach an existing account", async () => {
    const db = createMockMobileAuthDb({
      users: [
        {
          email: "owner@example.com",
          id: "user-owner",
          name: "Existing Owner",
        },
      ],
    })
    const session = await verifyMobileAppleIdentity(db.client, {
      mode: "login",
      email: "owner@example.com",
      providerAccountId: "apple-new-link",
      encryptedRefreshToken: "encrypted-refresh-token",
      clientId: "com.ewatrade.app",
    })
    expect(session.profile.id).toBe("user-owner")
    expect(db.users).toHaveLength(1)
    expect(db.accounts).toContainEqual(
      expect.objectContaining({
        provider: "apple",
        providerAccountId: "apple-new-link",
        userId: "user-owner",
        refreshToken: "encrypted-refresh-token",
      }),
    )
  })

  test("unlinked Apple identity without email cannot create or enter an account", async () => {
    const db = createMockMobileAuthDb()
    await expect(
      verifyMobileAppleIdentity(db.client, {
        mode: "login",
        providerAccountId: "unknown-apple-subject",
        encryptedRefreshToken: "encrypted-refresh-token",
        clientId: "com.ewatrade.app",
      }),
    ).rejects.toThrow("did not provide an email")
    expect(db.users).toHaveLength(0)
    expect(db.accounts).toHaveLength(0)
    expect(db.sessions).toHaveLength(0)
  })

  test("creates a common login OTP for a User with Business access", async () => {
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
      "mobile-auth:login:owner@example.com",
    )
  })

  test("creates a common login OTP for an existing User without Business access", async () => {
    const db = createMockMobileAuthDb({
      users: [
        {
          email: "owner@example.com",
          id: "user_owner",
          name: "Owner Name",
        },
      ],
    })

    const otp = await createMobileOwnerOtp(db.client, {
      email: "owner@example.com",
      mode: "login",
    })

    expect(otp.email).toBe("owner@example.com")
    expect(db.verifications).toHaveLength(1)
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
      ageBand: "ADULT",
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
    expect(db.users[0]?.name).toBe("Owner Name")
  })

  test("legacy undeclared owner OTP login issues only a limited session", async () => {
    const user = {
      ageBand: "UNDECLARED",
      email: "legacy-owner@example.com",
      id: "legacy_owner",
      name: "Legacy Owner",
    }
    const db = createMockMobileAuthDb({
      memberships: [
        {
          role: "OWNER",
          status: "ACTIVE",
          tenant: {
            id: "legacy_tenant",
            name: "Legacy Store",
            slug: "legacy-store",
            stores: [],
          },
          userId: user.id,
        },
      ],
      users: [user],
    })
    const otp = await createMobileOwnerOtp(db.client, {
      email: user.email,
      mode: "login",
    })

    const session = await verifyMobileOwnerOtp(db.client, {
      code: otp.code,
      email: user.email,
      mode: "login",
    })

    expect(session.accessProfile).toEqual({
      hasBusinessAccess: false,
      hasCustomerHistory: false,
    })
    expect(session.tenant).toBeNull()
    expect(session.profile.businessId).toBeNull()
    expect(db.sessions).toHaveLength(1)
  })

  test("legacy undeclared password account receives a limited session", async () => {
    const db = createMockMobileAuthDb({
      users: [
        {
          ageBand: "UNDECLARED",
          email: "legacy-password@example.com",
          emailVerified: true,
          id: "legacy_password",
          name: "Legacy Password",
        },
      ],
    })

    const session = await createMobileSessionForVerifiedUser(
      db.client,
      "legacy_password",
    )
    expect(session.accessProfile).toEqual({
      hasBusinessAccess: false,
      hasCustomerHistory: false,
    })
    expect(session.tenant).toBeNull()
    expect(db.sessions).toHaveLength(1)
  })

  test("legacy undeclared social login receives no workspace access", async () => {
    const db = createMockMobileAuthDb({
      users: [
        {
          ageBand: "UNDECLARED",
          email: "legacy-social@example.com",
          id: "legacy_social",
          name: "Legacy Social",
        },
      ],
    })

    const session = await verifyMobileGoogleIdentity(db.client, {
      email: "legacy-social@example.com",
      mode: "login",
      providerAccountId: "legacy-google-id",
    })
    expect(session.accessProfile).toEqual({
      hasBusinessAccess: false,
      hasCustomerHistory: false,
    })
    expect(session.tenant).toBeNull()
    expect(db.sessions).toHaveLength(1)
  })

  test("verifies a customer-linked User into the common session without inventing Business access", async () => {
    const user = {
      ageBand: "ADULT",
      email: "customer@example.com",
      id: "user_customer",
      name: "Customer Name",
    }
    const db = createMockMobileAuthDb({
      accountAccesses: [{ accountUserId: user.id, status: "ACTIVE" }],
      users: [user],
    })
    const otp = await createMobileOwnerOtp(db.client, {
      email: user.email,
      mode: "login",
    })

    const session = await verifyMobileOwnerOtp(db.client, {
      code: otp.code,
      email: user.email,
      mode: "login",
    })

    expect(session.accessProfile).toEqual({
      hasBusinessAccess: false,
      hasCustomerHistory: true,
    })
    expect(session.profile).toMatchObject({
      businessId: null,
      id: user.id,
      role: "NONE",
      status: "NONE",
    })
    expect(session.tenant).toBeNull()
  })

  test("verifies new owner OTP signup by creating the first business and store", async () => {
    const db = createMockMobileAuthDb()
    const otp = await createMobileOwnerOtp(db.client, {
      businessProfileKey: "animal-feed-agricultural-supplies",
      businessProfileVersion: 1,
      businessName: " Main Market Store ",
      currencyCode: "GHS",
      email: "new-owner@example.com",
      ageBand: "AGE_13_TO_15",
      mode: "sign_up",
      name: " New Owner ",
      operatingModel: "products",
      orderChannels: ["walk_in", "phone_whatsapp"],
      teamSize: "2_5",
    })

    const session = await verifyMobileOwnerOtp(db.client, {
      code: otp.code,
      email: "new-owner@example.com",
      ageBand: "AGE_13_TO_15",
      mode: "sign_up",
    })

    expect(db.users[0]).toMatchObject({
      ageBand: "AGE_13_TO_15",
      ageDeclaredAt: expect.any(Date),
    })

    expect(db.tenants).toEqual([
      expect.objectContaining({
        id: "tenant_1",
        currencyCode: "GHS",
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
        currencyCode: "GHS",
        metadata: {
          retailOps: {
            onboarding: expect.objectContaining({
              businessProfileKey: "animal-feed-agricultural-supplies",
              businessProfileVersion: 1,
              operatingModel: "products",
              orderChannels: ["walk_in", "phone_whatsapp"],
              source: "mobile_owner_signup",
              teamSize: "2_5",
            }),
          },
        },
        name: "Main Market Store",
        slug: "main-market-store",
        status: "ACTIVE",
        tenantId: "tenant_1",
      }),
    ])
    expect(session.profile).toMatchObject({
      businessId: "tenant_1",
      businessName: "Main Market Store",
      currencyCode: "GHS",
      email: "new-owner@example.com",
      id: "user_1",
      name: "New Owner",
      role: "OWNER",
      status: "ACTIVE",
    })
    expect(session.tenant).toMatchObject({
      id: "tenant_1",
      currencyCode: "GHS",
      name: "Main Market Store",
      storeId: "store_1",
      storeName: "Main Market Store",
    })
  })

  test("keeps the signup business phone on the store instead of the user identity", async () => {
    const businessPhone = "08186877306"
    const db = createMockMobileAuthDb({
      users: [
        {
          email: "existing-owner@example.com",
          id: "user_existing",
          name: "Existing Owner",
          phone: businessPhone,
        },
      ],
    })
    const otp = await createMobileOwnerOtp(db.client, {
      businessName: "Jawdah",
      email: "jawdah@ishaq.qa.test",
      ageBand: "AGE_13_TO_15",
      mode: "sign_up",
      name: "Ishaq Yusuf",
      phone: businessPhone,
    })

    const session = await verifyMobileOwnerOtp(db.client, {
      businessName: "Jawdah",
      code: otp.code,
      email: "jawdah@ishaq.qa.test",
      ageBand: "AGE_13_TO_15",
      mode: "sign_up",
      name: "Ishaq Yusuf",
      phone: businessPhone,
    })

    expect(db.users).toEqual([
      expect.objectContaining({
        id: "user_existing",
        phone: businessPhone,
      }),
      expect.not.objectContaining({
        phone: businessPhone,
      }),
    ])
    expect(db.stores).toEqual([
      expect.objectContaining({
        supportPhone: businessPhone,
        tenantId: session.tenant?.id,
      }),
    ])
  })

  test("first-time Google and Apple login cannot create an account without signup choices", async () => {
    for (const provider of ["google", "apple"] as const) {
      const db = createMockMobileAuthDb()
      await expect(
        verifyMobileSocialIdentity(db.client, {
          email: "new-owner@example.com",
          mode: "login",
          name: "New Owner",
          provider,
          providerAccountId: `${provider}-new-owner`,
        }),
      ).rejects.toBeInstanceOf(MobileAccountNotFoundError)
      expect(db.users).toHaveLength(0)
      expect(db.accounts).toHaveLength(0)
      expect(db.sessions).toHaveLength(0)
    }
  })

  test("links an existing owner email to Google and returns the active business session context", async () => {
    const user = {
      ageBand: "ADULT",
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
      businessProfileKey: "laundry-dry-cleaning",
      businessProfileVersion: 1,
      businessName: " Main Market Store ",
      currencyCode: "USD",
      email: "new-google-owner@example.com",
      idToken: "new-google-id-token",
      ageBand: "AGE_13_TO_15",
      mode: "sign_up",
      name: " New Google Owner ",
      operatingModel: "services",
      orderChannels: ["walk_in", "phone_whatsapp"],
      providerAccountId: " new-google-owner ",
      teamSize: "2_5",
    })

    expect(db.users[0]).toMatchObject({
      ageBand: "AGE_13_TO_15",
      ageDeclaredAt: expect.any(Date),
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
        currencyCode: "USD",
        name: "Main Market Store",
        slug: "main-market-store",
      }),
    ])
    expect(db.stores).toEqual([
      expect.objectContaining({
        id: "store_1",
        currencyCode: "USD",
        metadata: {
          retailOps: {
            onboarding: expect.objectContaining({
              businessProfileKey: "laundry-dry-cleaning",
              businessProfileVersion: 1,
              operatingModel: "services",
              orderChannels: ["walk_in", "phone_whatsapp"],
              source: "mobile_owner_signup",
              teamSize: "2_5",
            }),
          },
        },
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

  test("does not overwrite an existing account age during social signup", async () => {
    const db = createMockMobileAuthDb({
      users: [
        {
          ageBand: "ADULT",
          ageDeclaredAt: new Date("2026-09-01T00:00:00.000Z"),
          email: "owner@example.com",
          id: "user_1",
          name: "Owner",
        },
      ],
    })

    await expect(
      verifyMobileGoogleIdentity(db.client, {
        ageBand: "AGE_13_TO_15",
        email: "owner@example.com",
        mode: "sign_up",
        providerAccountId: "google-owner-id",
      }),
    ).rejects.toThrow("age range is already set")
    expect(db.users[0]?.ageBand).toBe("ADULT")
  })
})
