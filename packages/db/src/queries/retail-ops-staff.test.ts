import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import type { PrismaClient } from "../generated/prisma/client"
import {
  completeRetailOpsStaffOnboarding,
  inviteRetailOpsStaff,
  resolveRetailOpsStaffInviteToken,
} from "./retail-ops-staff"

type StaffCall = {
  data?: unknown
  kind: string
  where?: unknown
}

function createInvitedUser() {
  return {
    displayName: "Attendant Name",
    email: "attendant@example.com",
    id: "user_staff",
    name: "Attendant Name",
  }
}

function createInvitedMembership(input?: { status?: string }) {
  return {
    acceptedAt: null,
    id: "membership_staff",
    invitedAt: new Date("2026-07-12T08:00:00.000Z"),
    invitedById: "user_owner",
    role: "CASHIER",
    status: input?.status ?? "INVITED",
    tenant: {
      id: "tenant_123",
      name: "Rice Store",
      slug: "rice-store",
    },
    updatedAt: new Date("2026-07-12T08:05:00.000Z"),
    user: createInvitedUser(),
  }
}

function hashInviteToken(token: string) {
  return createHash("sha256").update(token.trim()).digest("hex")
}

function createMockStaffInviteDb() {
  const calls: StaffCall[] = []
  const invitedUser = createInvitedUser()
  const membership = createInvitedMembership()
  let capturedAcceptanceToken: string | null = null

  const tx = {
    membership: {
      count: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "membership.count", where })

        return 0
      },
      create: async ({ data }: { data: unknown }) => {
        calls.push({ data, kind: "membership.create" })

        return membership
      },
      findUnique: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "membership.findUnique", where })

        return null
      },
      update: async ({ data, where }: { data: unknown; where: unknown }) => {
        calls.push({ data, kind: "membership.update", where })

        return membership
      },
    },
    retailOpsStaffInviteToken: {
      create: async ({ data }: { data: { tokenHash?: string } }) => {
        calls.push({ data, kind: "retailOpsStaffInviteToken.create" })
        capturedAcceptanceToken = data.tokenHash ?? null

        return { id: "invite_token_123" }
      },
      updateMany: async ({
        data,
        where,
      }: { data: unknown; where: unknown }) => {
        calls.push({
          data,
          kind: "retailOpsStaffInviteToken.updateMany",
          where,
        })

        return { count: 1 }
      },
    },
    retailOpsStaffLifecycleEvent: {
      create: async ({ data }: { data: unknown }) => {
        calls.push({ data, kind: "retailOpsStaffLifecycleEvent.create" })

        return { id: "staff_event_123" }
      },
    },
    retailOpsStaffProfile: {
      upsert: async ({ create, update, where }: Record<string, unknown>) => {
        calls.push({
          data: {
            create,
            update,
          },
          kind: "retailOpsStaffProfile.upsert",
          where,
        })

        return { id: "staff_profile_123" }
      },
    },
    tenant: {
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "tenant.findFirst", where })

        return {
          id: "tenant_123",
          metadata: {},
        }
      },
      findFirstOrThrow: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "tenant.findFirstOrThrow", where })

        return {
          createdAt: new Date("2026-07-01T08:00:00.000Z"),
          id: "tenant_123",
          metadata: {},
          name: "Rice Store",
          slug: "rice-store",
          updatedAt: new Date("2026-07-12T08:00:00.000Z"),
        }
      },
      update: async ({ data, where }: { data: unknown; where: unknown }) => {
        calls.push({ data, kind: "tenant.update", where })

        return { id: "tenant_123" }
      },
    },
    product: {
      count: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "product.count", where })

        return 1
      },
    },
    offlineDevice: {
      findMany: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "offlineDevice.findMany", where })

        return []
      },
    },
    offlineDeviceRevocation: {
      findMany: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "offlineDeviceRevocation.findMany", where })

        return []
      },
    },
    store: {
      count: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "store.count", where })

        return 1
      },
    },
    subscriptionPlan: {
      findMany: async () => [],
    },
    tenantSubscription: {
      findUnique: async () => null,
    },
    user: {
      create: async ({ data }: { data: unknown }) => {
        calls.push({ data, kind: "user.create" })

        return invitedUser
      },
      findUnique: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "user.findUnique", where })

        return null
      },
    },
  }
  const db = {
    $transaction: async <T>(
      callback: (transactionClient: typeof tx) => Promise<T>,
    ) => callback(tx),
  }

  return {
    calls,
    client: db as unknown as PrismaClient,
    get tokenHash() {
      return capturedAcceptanceToken
    },
  }
}

function createMockStaffTokenDb(input?: {
  expiresAt?: Date
  status?: string
}) {
  const calls: StaffCall[] = []
  const expiresAt =
    input?.expiresAt ?? new Date(Date.now() + 1000 * 60 * 60 * 24)
  const db = {
    retailOpsStaffInviteToken: {
      findUnique: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "retailOpsStaffInviteToken.findUnique", where })

        return {
          email: "attendant@example.com",
          expiresAt,
          id: "invite_token_123",
          membershipId: "membership_staff",
          role: "CASHIER",
          status: input?.status ?? "ACTIVE",
          tenant: {
            id: "tenant_123",
            name: "Rice Store",
            slug: "rice-store",
          },
        }
      },
      update: async ({ data, where }: { data: unknown; where: unknown }) => {
        calls.push({ data, kind: "retailOpsStaffInviteToken.update", where })

        return { id: "invite_token_123" }
      },
    },
  }

  return {
    calls,
    client: db as unknown as PrismaClient,
  }
}

function createMockStaffOnboardingDb() {
  const calls: StaffCall[] = []
  const invitedMembership = createInvitedMembership()
  const updatedUser = {
    ...invitedMembership.user,
    displayName: "Market Attendant",
    name: "Market Attendant",
  }
  const updatedMembership = {
    ...invitedMembership,
    acceptedAt: new Date("2026-07-12T09:00:00.000Z"),
    status: "ACTIVE",
    updatedAt: new Date("2026-07-12T09:00:00.000Z"),
  }

  const tx = {
    membership: {
      findMany: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "membership.findMany", where })

        return [invitedMembership]
      },
      findUniqueOrThrow: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "membership.findUniqueOrThrow", where })

        return updatedMembership
      },
      update: async ({ data, where }: { data: unknown; where: unknown }) => {
        calls.push({ data, kind: "membership.update", where })

        return updatedMembership
      },
    },
    retailOpsStaffInviteToken: {
      updateMany: async ({
        data,
        where,
      }: { data: unknown; where: unknown }) => {
        calls.push({
          data,
          kind: "retailOpsStaffInviteToken.updateMany",
          where,
        })

        return { count: 1 }
      },
    },
    retailOpsStaffLifecycleEvent: {
      create: async ({ data }: { data: unknown }) => {
        calls.push({ data, kind: "retailOpsStaffLifecycleEvent.create" })

        return { id: "staff_event_123" }
      },
    },
    retailOpsStaffProfile: {
      upsert: async ({ create, update, where }: Record<string, unknown>) => {
        calls.push({
          data: {
            create,
            update,
          },
          kind: "retailOpsStaffProfile.upsert",
          where,
        })

        return { id: "staff_profile_123" }
      },
    },
    user: {
      update: async ({ data, where }: { data: unknown; where: unknown }) => {
        calls.push({ data, kind: "user.update", where })

        return updatedUser
      },
    },
  }
  const db = {
    $transaction: async <T>(
      callback: (transactionClient: typeof tx) => Promise<T>,
    ) => callback(tx),
  }

  return {
    calls,
    client: db as unknown as PrismaClient,
  }
}

function getCall(calls: StaffCall[], kind: string) {
  const call = calls.find((currentCall) => currentCall.kind === kind)
  expect(call, `Expected ${kind} to be called`).toBeTruthy()

  return call
}

describe("retail ops staff queries", () => {
  test("invites staff with a one-time acceptance token hash and lifecycle audit", async () => {
    const db = createMockStaffInviteDb()

    const result = await inviteRetailOpsStaff(db.client, {
      actorUserId: "user_owner",
      email: " Attendant@Example.com ",
      externalId: " staff-invite-123 ",
      name: " Attendant Name ",
      role: "cashier",
      storeId: "store_123",
      tenantId: "tenant_123",
    })

    expect(result).toMatchObject({
      invite: {
        id: "membership_staff",
        role: "CASHIER",
        status: "INVITED",
      },
      notification: {
        shouldSend: true,
      },
      staff: {
        email: "attendant@example.com",
        id: "user_staff",
      },
      storeId: "store_123",
      tenantId: "tenant_123",
    })
    expect(result.invite.acceptanceToken).toEqual(expect.any(String))
    expect(result.invite.acceptanceToken).not.toBe(db.tokenHash)
    expect(db.tokenHash).toEqual(expect.any(String))
    const storedTokenHash = db.tokenHash

    if (!storedTokenHash) {
      throw new Error("Expected staff invite token hash to be stored.")
    }

    expect(hashInviteToken(result.invite.acceptanceToken ?? "")).toBe(
      storedTokenHash,
    )
    expect(getCall(db.calls, "user.create")).toMatchObject({
      data: {
        displayName: "Attendant Name",
        email: "attendant@example.com",
        name: "Attendant Name",
      },
    })
    expect(getCall(db.calls, "membership.create")).toMatchObject({
      data: {
        invitedById: "user_owner",
        role: "CASHIER",
        status: "INVITED",
        tenantId: "tenant_123",
        userId: "user_staff",
      },
    })
    expect(
      getCall(db.calls, "retailOpsStaffInviteToken.updateMany"),
    ).toMatchObject({
      data: {
        revokedByUserId: "user_owner",
        status: "REVOKED",
      },
      where: {
        membershipId: "membership_staff",
        status: "ACTIVE",
        tenantId: "tenant_123",
      },
    })
    expect(getCall(db.calls, "retailOpsStaffInviteToken.create")).toMatchObject(
      {
        data: {
          email: "attendant@example.com",
          externalId: "staff-invite-123",
          invitedByUserId: "user_owner",
          invitedUserId: "user_staff",
          membershipId: "membership_staff",
          role: "CASHIER",
          status: "ACTIVE",
          tenantId: "tenant_123",
          tokenHash: db.tokenHash,
        },
      },
    )
    expect(getCall(db.calls, "retailOpsStaffProfile.upsert")).toMatchObject({
      data: {
        create: {
          defaultStoreId: "store_123",
          displayName: "Attendant Name",
          membershipId: "membership_staff",
          roleSnapshot: "CASHIER",
          statusSnapshot: "INVITED",
        },
        update: {
          defaultStoreId: "store_123",
          displayName: "Attendant Name",
          membershipId: "membership_staff",
          roleSnapshot: "CASHIER",
          statusSnapshot: "INVITED",
        },
      },
    })
    expect(
      getCall(db.calls, "retailOpsStaffLifecycleEvent.create"),
    ).toMatchObject({
      data: {
        actorUserId: "user_owner",
        fromRole: null,
        fromStatus: null,
        membershipId: "membership_staff",
        staffProfileId: "staff_profile_123",
        staffUserId: "user_staff",
        tenantId: "tenant_123",
        toRole: "CASHIER",
        toStatus: "INVITED",
        type: "INVITED",
      },
    })
  })

  test("resolves active staff invite tokens without exposing the secret token", async () => {
    const db = createMockStaffTokenDb()

    const result = await resolveRetailOpsStaffInviteToken(db.client, {
      token: " acceptance-token ",
    })

    expect(result).toMatchObject({
      email: "attendant@example.com",
      inviteTokenId: "invite_token_123",
      membershipId: "membership_staff",
      role: "CASHIER",
      status: "ACTIVE",
      tenant: {
        id: "tenant_123",
        name: "Rice Store",
        slug: "rice-store",
      },
    })
    expect(result).not.toHaveProperty("token")
    expect(
      getCall(db.calls, "retailOpsStaffInviteToken.findUnique"),
    ).toMatchObject({
      where: {
        tokenHash: hashInviteToken("acceptance-token"),
      },
    })
  })

  test("completes invited staff onboarding and accepts active invite tokens", async () => {
    const db = createMockStaffOnboardingDb()

    const result = await completeRetailOpsStaffOnboarding(db.client, {
      displayName: " Market Attendant ",
      tenantSlug: "rice-store",
      userId: "user_staff",
    })

    expect(result).toMatchObject({
      id: "membership_staff",
      previousStatus: "INVITED",
      role: "CASHIER",
      status: "ACTIVE",
      tenant: {
        id: "tenant_123",
        slug: "rice-store",
      },
      user: {
        displayName: "Market Attendant",
        email: "attendant@example.com",
        id: "user_staff",
      },
    })
    expect(getCall(db.calls, "membership.findMany")).toMatchObject({
      where: {
        role: {
          in: ["CASHIER", "MANAGER", "OPERATOR"],
        },
        status: {
          in: ["ACTIVE", "INVITED"],
        },
        tenant: {
          slug: "rice-store",
        },
        userId: "user_staff",
      },
    })
    expect(getCall(db.calls, "user.update")).toMatchObject({
      data: {
        displayName: "Market Attendant",
        name: "Market Attendant",
      },
      where: {
        id: "user_staff",
      },
    })
    expect(getCall(db.calls, "membership.update")).toMatchObject({
      data: {
        acceptedAt: expect.any(Date),
        status: "ACTIVE",
      },
      where: {
        id: "membership_staff",
      },
    })
    expect(
      getCall(db.calls, "retailOpsStaffInviteToken.updateMany"),
    ).toMatchObject({
      data: {
        acceptedAt: expect.any(Date),
        acceptedByUserId: "user_staff",
        status: "ACCEPTED",
      },
      where: {
        membershipId: "membership_staff",
        status: "ACTIVE",
        tenantId: "tenant_123",
      },
    })
    expect(
      getCall(db.calls, "retailOpsStaffLifecycleEvent.create"),
    ).toMatchObject({
      data: {
        actorUserId: "user_staff",
        fromStatus: "INVITED",
        membershipId: "membership_staff",
        staffUserId: "user_staff",
        tenantId: "tenant_123",
        toRole: "CASHIER",
        toStatus: "ACTIVE",
        type: "ONBOARDING_COMPLETED",
      },
    })
  })
})
